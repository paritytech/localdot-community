/**
 * Local persistent store for all Statement Store traffic LocalDOT cares about.
 *
 * Inspired by polkadot-app-android's chat module, which uses a SQLite
 * (Room DAO) table as the single source of truth for incoming and outgoing
 * messages. The UI subscribes to the DB; SS only feeds it. This eliminates
 * the whole class of "state lives in React, reseed on every page load"
 * bugs we found in the previous direct-trade audit.
 *
 * Design:
 *
 *   - **Table**: `statements`. One row per (k, id) pair. So `req:abc` and
 *     `res:abc` are distinct rows even though they share the trade-request id
 *     by wire convention. The composite "k:id" is the primary key so
 *     idempotency is enforced — re-ingesting the same statement is a no-op.
 *
 *   - **Direction**: every row carries `"incoming"` or `"outgoing"`. We write
 *     outgoing rows on send (since the SS subscriber on our own inbox doesn't
 *     see our outbound statements — they go to the recipient's inbox).
 *
 *   - **Unsupported rows**: when the envelope decoder can't recognize a
 *     payload (unknown version, malformed shape), we still write a row with
 *     `k="unsupported"` and `rawBytes` preserved. The UI can surface this as
 *     "[Message from older / newer client — please update]" rather than
 *     silently losing the message. Pattern lifted from
 *     polkadot-app-android's `AlwaysDecodableChatMessagePart` +
 *     `Content.Unsupported(raw)`.
 *
 *   - **Ack-on-receive**: when we persist an inbound `req` or `prop`, we
 *     fire-and-forget publish an `ack` back to the sender. The sender's
 *     UI can derive a "delivered" indicator by joining their outgoing row
 *     against the incoming `ack`. We don't ack `res` / `prop-res` / `status`
 *     (they're already responses; acking them would loop or be wasteful),
 *     and we never ack an `ack` (loop prevention).
 *
 *   - **Subscriber**: one singleton, started once when the wallet is ready,
 *     stopped on disconnect. Replays `getStatements` then streams via
 *     `subscribeStatements`. Each delivery is decoded + written.
 *
 *   - **Queries**: hooks use `useLiveQuery` from `dexie-react-hooks` to
 *     subscribe to slices of the table. Status updates propagate automatically.
 *
 * Schema version is bumped each time the row shape changes. We treat
 * existing browser state as disposable (W3S pre-launch users have no real data).
 */

import type { Statement as WireStatement } from "@novasamatech/sdk-statement";
import Dexie, { type Table } from "dexie";

import { notifyIncomingStatement } from "./host/notifications";
import {
  type AckPayload,
  decodePayloadEnvelope,
  getSdk,
  inboxTopics,
  type PublishOpts,
  publishStatement,
  type TradePayload,
} from "./statement-store";

// ─── Schema ─────────────────────────────────────────────────────────────────

export type Direction = "incoming" | "outgoing";

/** Discriminator for the DB row's `k` field. Includes "unsupported" for rows
 *  we persisted from undecodable wire bytes. */
export type StoredKind = TradePayload["k"] | "unsupported";

/**
 * One row per statement (incoming or outgoing) we've observed. `payload`
 * carries the full decoded TradePayload for cheap reads; the indexed
 * columns exist so we can query without scanning + JSON-parsing every row.
 *
 * For `k === "unsupported"`, `payload` is `null` and the original wire
 * bytes live in `rawBytes`. Everything else fills `payload`.
 */
export interface StoredStatement {
  /** Composite primary key: `${k}:${id}`. Enforces idempotency. */
  pk: string;
  k: StoredKind;
  /** The payload's `id` (or a synthesized one for status / unsupported rows). */
  id: string;
  /** Sender EVM address (lowercased) when known. */
  from?: string;
  /** Trade id, if the payload is trade-scoped (prop, prop-res, status). */
  tradeId?: string;
  /** Original publish timestamp. */
  ts: number;
  /** Full decoded payload — null only for unsupported rows. */
  payload: TradePayload | null;
  /** Local-clock ingest time. */
  receivedAt: number;
  /** Whether we sent this (outgoing) or received it (incoming). */
  direction: Direction;
  /** Raw wire bytes — only set for `k === "unsupported"` rows so a future
   *  app version could re-decode after a schema bump. */
  rawBytes?: Uint8Array;
  /**
   * Soft-delete flag — set by UI actions like `clearRequest`. Queries
   * filter these out, but the row stays so an in-flight response can
   * still match (vs a hard delete that would orphan it).
   */
  dismissed?: boolean;
  /**
   * Notifications-bell dismissal — set when the user clears a row from the
   * bell menu. Kept separate from `dismissed` so hiding a bell item never
   * removes the underlying trade request from the Sent/Received tabs.
   */
  notifDismissed?: boolean;
}

class MessageStoreDb extends Dexie {
  statements!: Table<StoredStatement, string>;

  constructor() {
    super("localdot-message-store");
    // v2: extends v1 with the `unsupported` storage path + `rawBytes`. No
    // upgrade callback needed — Dexie just opens the existing table with
    // the new schema. Existing rows missing `rawBytes` are fine (it's
    // optional). v1 -> v2 in the same load is a no-op for users who
    // didn't have v1 yet.
    this.version(1).stores({
      statements:
        "&pk, id, k, ts, " +
        "[k+id], [k+tradeId], [k+direction], [k+from], " +
        "[k+tradeId+direction]",
    });
    this.version(2).stores({
      statements:
        "&pk, id, k, ts, " +
        "[k+id], [k+tradeId], [k+direction], [k+from], " +
        "[k+tradeId+direction]",
    });
  }
}

export const db = new MessageStoreDb();

/** Build the composite primary key for a payload. */
export function pkFor(k: StoredKind, id: string): string {
  return `${k}:${id}`;
}

// ─── Active subscription tracking ───────────────────────────────────────────
//
// The subscriber writes inbound rows; if the payload is ackable, we also
// publish an ack back to the sender. Signing is delegated to the host, so the
// only thing we need to remember is the address we're listening on — it's both
// the live subscription target and the `from` we stamp on outgoing acks.

let active: {
  /** Address-inbox subscription (req / res / ack / prop / status addressed to me). */
  addressSub: { address: string; unsub: () => void } | null;
} = {
  addressSub: null,
};

// Gate for host push notifications. Stays false during the initial inbox
// backfill so opening the app doesn't fire a burst of notifications for
// historical statements; armed once we go live (see openInbox). Only fresh,
// post-backfill inbound statements notify.
let notificationsArmed = false;

// ─── Writers ────────────────────────────────────────────────────────────────

/**
 * Persist a freshly-decoded payload as an outgoing row. Internal — invoked by
 * `sendTradeMessage` after the publish resolves. Idempotent via the PK, so
 * retrying a publish that already wrote the local row is safe.
 */
async function recordOutgoing(
  payload: TradePayload,
  myEvmAddress: string,
): Promise<void> {
  const id = extractId(payload);
  const row: StoredStatement = {
    pk: pkFor(payload.k, id),
    k: payload.k,
    id,
    from: myEvmAddress.toLowerCase(),
    tradeId: extractTradeId(payload),
    ts: payload.ts,
    payload,
    receivedAt: Date.now(),
    direction: "outgoing",
  };
  try {
    await writeRow(row);
  } catch (err) {
    if (!isConstraintError(err)) {
      console.warn("[message-store] recordOutgoing failed:", err);
    }
  }
}

/**
 * The channel key for a payload — the single source of truth for channel
 * naming. Channels are last-write-wins per signer, so the key must be stable
 * across re-sends of "the same" logical message: a status heartbeat keys on
 * `tradeId` (not a fresh id each beat), an ack on the ref it acknowledges.
 */
function channelKeyFor(payload: TradePayload): string {
  switch (payload.k) {
    case "req":
      return `req:${payload.id}`;
    case "res":
      return `res:${payload.id}`;
    case "prop":
      return `prop:${payload.id}`;
    case "prop-res":
      return `prop-res:${payload.id}`;
    case "status":
      return `status:${payload.tradeId}`;
    case "ack":
      return `ack:${payload.refK}:${payload.refId}`;
  }
}

/**
 * Send a trade statement. The single send path for the whole app: derive the
 * channel key, publish to the recipient's address inbox, then (for everything
 * except acks) record it as an outgoing row. Channel naming, address-only
 * routing, and the publish-then-record pairing all live here, so callers just
 * build a typed payload and name the recipient.
 *
 * `myEvmAddress` is stamped on the outgoing row's `from` — needed because
 * `res` / `prop-res` carry no `from` on the wire.
 */
export async function sendTradeMessage(
  myEvmAddress: string,
  recipientEvmAddress: string,
  payload: TradePayload,
  opts?: PublishOpts,
): Promise<void> {
  await publishStatement(
    recipientEvmAddress,
    channelKeyFor(payload),
    payload,
    opts,
  );
  // Acks are passive delivery receipts — never recorded as our own history.
  if (payload.k !== "ack") {
    await recordOutgoing(payload, myEvmAddress);
  }
}

/**
 * Decode + persist a single inbound statement from SS. Handles:
 *   - Recognized payloads: write a typed row.
 *   - Unsupported payloads: write an `unsupported` row with raw bytes.
 *   - Non-JSON / non-object bytes: drop silently.
 *
 * After a successful write of an ackable payload (req/prop), fires off a
 * fire-and-forget ack publish.
 */
async function persistIncoming(stmt: WireStatement): Promise<void> {
  if (!stmt.data) return;
  const decoded = decodePayloadEnvelope(stmt.data);
  if (!decoded) return;

  if (decoded.kind === "unsupported") {
    const env = decoded.envelope;
    const synthId = env.id ?? `${env.ts ?? Date.now()}-${env.v ?? "?"}`;
    const row: StoredStatement = {
      pk: pkFor("unsupported", synthId),
      k: "unsupported",
      id: synthId,
      ts: env.ts ?? Date.now(),
      payload: null,
      receivedAt: Date.now(),
      direction: "incoming",
      rawBytes: decoded.raw,
    };
    try {
      await writeRow(row);
    } catch (err) {
      if (!isConstraintError(err)) {
        console.warn(
          "[message-store] persistIncoming (unsupported) failed:",
          err,
        );
      }
    }
    return;
  }

  const payload = decoded.payload;

  // NOTE: we do NOT validate the on-chain signer against `payload.from`.
  // Under the host-signs model every statement is signed by the visitor's
  // *root session key* (the key that holds the RFC-0010 statement allowance),
  // never by the author's product account — and the host exposes no
  // recipient-verifiable link between the two. So `pubkeyToH160(signer)` can
  // never equal `payload.from`, and an earlier guard here dropped 100% of
  // legitimate req/prop/status/ack traffic.
  //
  // `from` is therefore self-asserted at this layer. That's acceptable: the
  // boundary that protects funds is the on-chain escrow contract, which
  // authenticates the real product account. A spoofed `from` can only mislead
  // off-chain coordination UI, it cannot move funds. Authenticating `from`
  // here would require a product-account signature over the payload (the host
  // session-key proof can't provide one) — tracked as a follow-up.

  const id = extractId(payload);
  const pk = pkFor(payload.k, id);

  // Status uses last-write-wins (`put`), so a successful write can't by itself
  // distinguish a genuinely newer update from a replay of the same one.
  // Capture the prior timestamp to gate notifications on real changes.
  let statusPriorTs: number | undefined;
  if (payload.k === "status") {
    statusPriorTs = (await db.statements.get(pk))?.ts;
  }

  const row: StoredStatement = {
    pk,
    k: payload.k,
    id,
    from: "from" in payload ? payload.from.toLowerCase() : undefined,
    tradeId: extractTradeId(payload),
    ts: payload.ts,
    payload,
    receivedAt: Date.now(),
    direction: "incoming",
  };

  let written = false;
  try {
    await writeRow(row);
    written = true;
  } catch (err) {
    if (!isConstraintError(err)) {
      console.warn("[message-store] persistIncoming failed:", err);
    }
  }

  // Genuinely-new inbound activity? For immutable kinds a non-throwing `add`
  // means new; for last-write-wins status, only a forward step in timestamp.
  const isFresh =
    payload.k === "status"
      ? statusPriorTs === undefined || statusPriorTs < payload.ts
      : written;

  // Ack-on-receive: only on fresh writes (not duplicates / constraint hits)
  // and only for ackable kinds (req, prop). The sender's `from` is the
  // recipient of our ack; our own listening address is the ack's `from`.
  const myAddr = active.addressSub?.address;
  if (written && myAddr && isAckable(payload)) {
    const ack: AckPayload = {
      k: "ack",
      refK: payload.k,
      refId: payload.id,
      from: myAddr,
      ts: Date.now(),
    };
    // Fire-and-forget — ack delivery is best-effort. The host signs, so we can
    // publish straight from here without a wallet signer.
    void sendTradeMessage(myAddr, payload.from.toLowerCase(), ack).catch(
      (err) => {
        console.warn(
          "[message-store] ack publish failed:",
          err instanceof Error ? err.message : String(err),
        );
      },
    );
  }

  // Host push notification — deep-links a tap straight to the relevant trade
  // (or requests inbox). Gated on `notificationsArmed` so the initial backfill
  // stays silent, and on `isFresh` so replays/duplicates don't re-notify.
  if (notificationsArmed && isFresh) {
    notifyIncomingStatement(payload);
  }
}

/** `true` for the kinds we want to ack on receive (loop-safe + traffic-bounded). */
function isAckable(
  payload: TradePayload,
): payload is Extract<TradePayload, { k: "req" } | { k: "prop" }> {
  return payload.k === "req" || payload.k === "prop";
}

/**
 * Status payloads have last-write-wins channel semantics on the wire — the
 * latest from a given sender replaces previous ones. Mirror that locally
 * with `put` (overwrite). All other payload kinds are immutable once
 * written, so `add` (which errors on duplicate PK) gives us idempotency.
 */
async function writeRow(row: StoredStatement): Promise<void> {
  if (row.k === "status") {
    await db.statements.put(row);
  } else {
    await db.statements.add(row);
  }
}

/**
 * Pull the wire-level `id` out of the payload. Most payloads carry an
 * explicit `id`; status payloads don't (their channel is `status:${tradeId}`
 * and the protocol semantics are last-write-wins per signer). For status
 * we synthesize `tradeId:sender`. For ack we use the refId-prefixed form
 * so two acks for different refs don't collide.
 */
function extractId(payload: TradePayload): string {
  if (payload.k === "status") {
    return `${payload.tradeId}:${payload.from.toLowerCase()}`;
  }
  if (payload.k === "ack") {
    return `${payload.refK}:${payload.refId}`;
  }
  return payload.id;
}

function extractTradeId(payload: TradePayload): string | undefined {
  if ("tradeId" in payload) return payload.tradeId;
  return undefined;
}

function isConstraintError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "ConstraintError" ||
      err.message.includes("Key already exists"))
  );
}

// ─── Subscriber + active-account wiring ────────────────────────────────────

/** How often to re-poll each inbox for statements that arrived post-subscribe. */
const INBOX_POLL_MS = 5_000;

/**
 * Open one inbox subscription for a topic pair. Feeds every matching statement
 * into `persistIncoming` (idempotent) via three mechanisms:
 *   1. an initial `getStatements` replay,
 *   2. a best-effort `subscribeStatements` live stream, and
 *   3. a `getStatements` poll every `INBOX_POLL_MS`.
 *
 * The poll is the reliable path. The People-chain statement RPC emits the
 * current set when you subscribe but does NOT reliably push statements that
 * are gossiped in afterwards — so without polling, new messages only appeared
 * after a manual refresh (which re-ran the replay). Returns an unsub.
 * `label` only feeds the trace logs.
 */
function openInbox(
  topics: ReturnType<typeof inboxTopics>,
  label: string,
): () => void {
  let cancelled = false;
  let liveUnsub: (() => void) | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  // Keep host push notifications silent during the initial backfill so opening
  // the app doesn't fire a burst for historical statements; armed once the
  // replay drains and we go live (below).
  notificationsArmed = false;

  void (async () => {
    try {
      const sdk = getSdk();
      const filter = { matchAll: [...topics] };

      // Fetch the current matching statements and feed them through
      // `persistIncoming`. Idempotent: immutable kinds hit the PK constraint
      // and are skipped; status rows upsert (last-write-wins). Safe to repeat.
      const drain = async (): Promise<void> => {
        const stmts = await sdk.getStatements(filter);
        if (cancelled) return;
        for (const stmt of stmts) {
          if (cancelled) return;
          await persistIncoming(stmt);
        }
      };

      await drain();
      if (cancelled) return;

      // Backfill drained — arm notifications before going live so subsequent
      // inbound statements (live stream + poll) can notify.
      notificationsArmed = true;

      // Best-effort live stream — may beat the poll when the node pushes, but
      // can't be relied on alone (see fn doc).
      liveUnsub = sdk.subscribeStatements(
        filter,
        (stmt) => {
          if (!cancelled) void persistIncoming(stmt);
        },
        (err) => {
          console.warn(
            `[message-store] subscribe error (${label}):`,
            err.message,
          );
        },
      );

      // Poll fallback — guarantees post-subscribe arrivals land within
      // INBOX_POLL_MS. `inFlight` stops slow polls from piling up.
      let inFlight = false;
      pollTimer = setInterval(() => {
        if (cancelled || inFlight) return;
        inFlight = true;
        void drain()
          .catch((err) => {
            console.warn(
              `[message-store] poll failed (${label}):`,
              err instanceof Error ? err.message : String(err),
            );
          })
          .finally(() => {
            inFlight = false;
          });
      }, INBOX_POLL_MS);
    } catch (err) {
      console.warn(
        `[message-store] subscriber init failed (${label}):`,
        err instanceof Error ? err.message : String(err),
      );
    }
  })();

  return () => {
    cancelled = true;
    notificationsArmed = false;
    liveUnsub?.();
    if (pollTimer) clearInterval(pollTimer);
  };
}

/**
 * Start the SS subscriber for `myEvmAddress`. Opens the address inbox — every
 * trade message (req / res / ack / prop / prop-res / status) is routed to the
 * recipient's address, so this single inbox catches everything addressed to us.
 *
 * Re-calling with the same address is a no-op; a different address tears the
 * old inbox down first.
 */
export function startMessageSubscriber(myEvmAddress: string): void {
  const addr = myEvmAddress.toLowerCase();

  if (active.addressSub?.address !== addr) {
    active.addressSub?.unsub();
    active.addressSub = {
      address: addr,
      unsub: openInbox(inboxTopics(addr), `addr=${addr}`),
    };
  }
}

/** Tear down the SS subscriber. Use on sign-out / wallet disconnect. */
export function stopMessageSubscriber(): void {
  active.addressSub?.unsub();
  active.addressSub = null;
}

// ─── Helpers for query call sites ───────────────────────────────────────────

/**
 * Fetch a single statement row by `[k, id]`. Used to look up the original
 * request when handling a response that arrived before we'd ingested the request.
 */
export function findById(
  k: StoredKind,
  id: string,
): Promise<StoredStatement | undefined> {
  return db.statements.get(pkFor(k, id));
}
