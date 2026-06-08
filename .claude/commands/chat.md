# /chat - Trade Signaling via Statement Store

Implement trade signaling (request / response / proposal / live-status / ack) over
the **Statement Store**. There is **no free-form chat** in LocalDOT V1 — no chat
window, no encrypted P2P messaging. Counterparties exchange a small set of
structured, **cleartext JSON** payloads that drive the trade lifecycle.

Ground truth lives in [`apps/web/src/lib/statement-store.ts`](../../apps/web/src/lib/statement-store.ts)
and [`apps/web/src/lib/message-store.ts`](../../apps/web/src/lib/message-store.ts). Read those before changing anything here.

Reference implementation: the **dot.li** reference implementation auth + container source
(cited in `lib/statement-store.ts`) — for the host-mediated publish flow and the
"hosts ignore the `[dotNs, idx]` tuple and sign with the root session key"
behaviour. (NOT polkadot-1p chat.)

---

## Architecture

**Transport:** Statement Store, topic-based routing. There is **no Bulletin Chain
`system.remark` fallback** — publish goes through the host's statement-store slot,
subscribe goes direct over People Next JSON-RPC.

- **Publish** is host-mediated:
  `hostStatementStore.createProof(...)` signs, then `hostStatementStore.submit(...)`
  broadcasts via the host's chain client. The host signs with the visitor's root
  session key (it ignores the `[dotNs, idx]` tuple), which holds the on-chain
  statement-store write allowance granted by `ensureBootstrap`. Submitting via the
  direct SDK client would bypass that allowance attribution, so we deliberately
  do not use `sdk.submit(...)` for writes.
- **Subscribe** uses the `@novasamatech/sdk-statement` SDK over a direct
  WebSocket (`getWsProvider` from `polkadot-api/ws`) to **People Next**
  (`wss://paseo-people-next-system-rpc.polkadot.io`). Reads are unauthenticated —
  no allowance needed.
- **No encryption in V1** — wire bytes are `JSON.stringify({ v: 1, p: payload })`.

> **This repo's setup:** publish requires `ensureBootstrap`
> ([`lib/host/allowances.ts`](../../apps/web/src/lib/host/allowances.ts)) to have
> granted `BulletinAllowance` + `StatementStoreAllowance` + `SmartContractAllowance`
> and the JIT `StatementSubmit` permission. `SmartContractAllowance` means
> **auto-signing of `Revive.call` writes**, NOT gas sponsorship — the product
> account must still hold native PAS for any contract write.

---

## Inbox Topic Model

Each user has an inbox addressed by a **pair** of topics (subscribers `matchAll`
on both):

```typescript
// lib/statement-store.ts
export const APP_TOPIC = stringToTopic("localdot-trade"); // filters to our app
export function inboxTopics(evmAddress: string) {
  return [APP_TOPIC, stringToTopic(evmAddress.toLowerCase())] as const;
}
```

- `Topic1 = stringToTopic("localdot-trade")` — scopes to LocalDOT.
- `Topic2 = stringToTopic(recipientEvmAddress.toLowerCase())` — scopes to one user.

`stringToTopic` comes from `@novasamatech/sdk-statement` (NOT a hand-rolled
`blake2b256`). A statement is published to the **recipient's** inbox topics, so
your own subscriber never sees your outbound statements — outgoing rows are
recorded locally at send time instead.

Within an inbox, statements are bucketed into **channels** (last-write-wins per
channel per signer) via the `channel` field, keyed by `stringToTopic(channelKey)`:

```
req:{requestId}        — buyer publishes a trade request
res:{requestId}        — provider publishes accept / decline (same requestId)
prop:{proposalId}      — either side proposes a new time / location / recognition note
prop-res:{proposalId}  — counterparty accepts / declines a proposal
status:{tradeId}       — sender's live "on the way / here / late" heartbeat
```

---

## Payload Kinds (the wire protocol)

There are six payload kinds (`k`), all cleartext JSON. From `lib/statement-store.ts`:

| `k`        | Direction        | Purpose |
|------------|------------------|---------|
| `req`      | buyer → provider | Trade request: `offerId`, `amount`, `cur`, optional `agent`, `note` |
| `res`      | provider → buyer | `accept` \| `decline` of a request (same `id` as the `req`) |
| `prop`     | either side      | Propose a change — `kind` is `time` \| `location` \| `recognition` |
| `prop-res` | counterparty     | `accept` \| `decline` of a proposal (same proposal `id`) |
| `status`   | either side      | Live heartbeat: `idle` \| `on-the-way` \| `here` \| `late` (last-write-wins) |
| `ack`      | recipient → sender | Delivery ack for an inbound `req` / `prop` (auto-published) |

```typescript
// lib/statement-store.ts — representative shapes
export interface TradeRequestPayload {
  k: "req";
  id: string;
  from: string;     // sender EVM address
  offerId: string;
  amount: string;
  cur: string;
  agent?: string;
  note?: string;
  ts: number;
}

export interface TradeProposalPayload {
  k: "prop";
  id: string;       // unique per proposal
  tradeId: string;
  kind: "time" | "location" | "recognition";
  from: string;
  scheduledAt?: number;
  location?: { label: string; address: string; lat: number; lon: number };
  recognition?: string;
  ts: number;
}
```

`ack` is published automatically by the receiver's message-store when an ackable
payload (`req` / `prop`) lands. We never ack `res` / `prop-res` / `status` (already
responses), and never ack an `ack` (loop prevention). The sender derives a
"delivered" indicator by joining outgoing rows against incoming `ack` rows on
`(refK, refId)`.

---

## Wire Envelope

Outgoing bytes are versioned so schema changes coexist with old clients:

```typescript
// lib/statement-store.ts
const WIRE_VERSION = 1;
export function encodePayload(p: TradePayload): Uint8Array {
  return new TextEncoder().encode(JSON.stringify({ v: WIRE_VERSION, p }));
}
```

`decodePayloadEnvelope` returns a discriminated result: `payload` (recognized
version + valid shape), or `unsupported` (parseable but unknown — the envelope's
`id`/`ts` are preserved so the UI can show a placeholder rather than dropping it),
or `null` (not JSON / not an object). `validatePayload` strictly checks required
fields per kind because the statement bytes are attacker-controllable.

---

## Publishing a statement

```typescript
// lib/statement-store.ts
export async function publishStatement(
  _signer: PolkadotSigner,        // unused — signing is delegated to the host
  recipientEvmAddress: string,
  channelKey: string,             // e.g. `req:${requestId}`
  payload: TradePayload,
  opts: PublishOpts = {},
): Promise<void> {
  // 1. RFC-0010 allowance + RFC-0002 JIT StatementSubmit permission (memoized).
  await ensureBootstrap({ onProgress: (s, d) => opts.onProgress?.(s, d) });

  const [topic1, topic2] = inboxTopics(recipientEvmAddress);
  const expiryHex = createExpiryFromDuration(opts.ttlSeconds ?? TTL_SECONDS);
  const channelHex = stringToTopic(channelKey);

  // 2. Host signs with the root session key that holds the on-chain allowance.
  const hostProof = await hostStatementStore.createProof([window.location.host, 0], {
    proof: undefined, decryptionKey: undefined, expiry: expiryHex,
    channel: hexToBytes(channelHex),
    topics: [hexToBytes(topic1), hexToBytes(topic2)],
    data: encodePayload(payload),
  });

  // 3. Submit through the host's chain client (NOT the direct SDK).
  await hostStatementStore.submit({ proof: hostProof, /* …same fields… */ });
}
```

Progress steps surfaced via `onProgress`: `requesting-allowance → allowance-ok →
requesting-permission → permission-ok` (bootstrap, first call only) then
`creating-proof → proof-ok → submitting → submitted`. `TTL_SECONDS` defaults to
2 days.

---

## Subscribing + local persistence (Dexie)

The single source of truth for all observed statements is a **Dexie** table, not
React state — this kills the "reseed on every page load" class of bugs. See
[`lib/message-store.ts`](../../apps/web/src/lib/message-store.ts).

- **Table** `statements`, DB `localdot-message-store`. One row per `(k, id)` pair;
  composite PK `${k}:${id}` enforces idempotency (re-ingesting a statement is a
  no-op).
- **Direction**: each row is `incoming` or `outgoing`. `recordOutgoing` writes the
  outgoing row at send time (our own inbox subscriber never sees our outbound
  statements).
- **Subscriber**: one singleton (`startMessageSubscriber` / `stopMessageSubscriber`),
  started when the wallet is ready, stopped on disconnect. It replays
  `sdk.getStatements(filter)` then streams `sdk.subscribeStatements(filter, …)`,
  where `filter = { matchAll: inboxTopics(addr) }`. Each delivery is decoded +
  written via `persistIncoming`.
- **Signer validation**: `persistIncoming` drops statements whose proof signer
  doesn't derive to the claimed `from` H160 (`req` / `prop` / `status` / `ack`),
  closing the `from`-spoofing vector.
- **Unsupported rows**: undecodable payloads are stored with `k="unsupported"` and
  `rawBytes` preserved so the UI can show a "please update your client" placeholder.
- **Queries**: UI hooks use `useLiveQuery` from `dexie-react-hooks`, so status
  updates propagate to the UI automatically.

```typescript
// lib/message-store.ts
export const db = new MessageStoreDb(); // Dexie("localdot-message-store")
export function startMessageSubscriber(
  myEvmAddress: string,
  publishAck?: (recipient: string, ack: AckPayload) => Promise<void>,
): void { /* replay getStatements → stream subscribeStatements → persistIncoming */ }
```

---

## SDK singleton

`getSdk()` opens one WebSocket to People Next on first call and wraps the
`@polkadot-api/substrate-client` callback API into the Promise-based `requestFn`
(for `statement_submit`) and callback-based `subscribeFn` (for
`statement_subscribeStatement`) that `createStatementSdk` expects.
`destroyConnection()` tears it down.

---

## Where the UI surfaces this

There is **no chat window**. Trade signaling appears in:

- **Profile → Received / Sent tabs** ([`apps/web/src/pages/Profile.tsx`](../../apps/web/src/pages/Profile.tsx)) —
  inbound `req` rows and the user's outbound requests/responses.
- **Trade detail** — the direct-trade channel
  ([`apps/web/src/hooks/useDirectTradeChannel.ts`](../../apps/web/src/hooks/useDirectTradeChannel.ts),
  rendered by [`apps/web/src/components/trade/DirectTradeDetail.tsx`](../../apps/web/src/components/trade/DirectTradeDetail.tsx)) —
  proposals (`prop` / `prop-res`) and the live `status` heartbeat.

---

## Package locations

| What | Where |
|------|-------|
| Statement Store client + payload types | `apps/web/src/lib/statement-store.ts` |
| Dexie message store + subscriber | `apps/web/src/lib/message-store.ts` |
| Host bootstrap (allowances + JIT permission) | `apps/web/src/lib/host/allowances.ts` |
| Shared cross-package types | `packages/types` |
| Bulletin Chain client | `packages/bulletin` |

> There is **no `packages/bulletin-sdk` and no `packages/shared`**. Statement-store
> logic lives in the web app under `apps/web/src/lib/`, not in a separate SDK
> package.

---

## Phase 4 Tasks

- [ ] Statement Store publish (host-mediated `createProof` + `submit`)
- [ ] Dexie message store + singleton subscriber (`startMessageSubscriber`)
- [ ] All six payload kinds wired (`req` / `res` / `prop` / `prop-res` / `status` / `ack`)
- [ ] Profile Received / Sent tabs render request/response rows
- [ ] Direct-trade channel renders proposals + live status (`useDirectTradeChannel`)
- [ ] Signer validation drops spoofed `from` statements
- [ ] Unsupported-envelope placeholder handling
- [ ] Error boundaries + loading/progress states
- [ ] Mobile responsiveness pass

## Phase 4 Acceptance Criteria

- [ ] All quality gates pass (`turbo build && turbo test && turbo lint && turbo typecheck`)
- [ ] Can send/receive a trade `req` and matching `res`
- [ ] Proposals and live status display correctly in trade detail
- [ ] Delivery acks resolve to a "delivered" indicator on the sender side
- [ ] Error states show helpful messages (e.g. "No active session — sign in…")
- [ ] Works on mobile (375px)
- [ ] Full trade flow works on Paseo Next v2 testnet (end-to-end)
- [ ] No console errors in browser DevTools
- [ ] `pnpm audit` shows no high/critical vulnerabilities
- [ ] Code ready for security audit review
