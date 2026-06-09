/**
 * Statement Store client for LocalDOT.
 *
 * **Publish** goes entirely through the host:
 *   - `hostStatementStore.createProof(...)` signs the statement
 *   - `hostStatementStore.submit(...)` broadcasts it via the host's chain client
 *
 *   The host signs and submits with a key that has the on-chain statement-
 *   store write allowance — granted up-front by `ensureBootstrap` (see
 *   `./host/allowances.ts`), which is RFC-0010 + the RFC-0002 JIT
 *   `StatementSubmit` permission rolled into one memoized call.
 *
 *   Per the dot.li reference implementation and the comments in
 *   dot.li's own auth/container source, current hosts (Polkadot Desktop +
 *   dot.li gateway) ignore the `[dotNs, idx]` tuple passed to `createProof`
 *   and sign with the visitor's root session key. The on-chain allowance is
 *   therefore granted to the root account; product-scoped identity is
 *   handled consumer-side by deriving an H160 from the root pubkey under
 *   junctions `['product', dotNsIdentifier, derivationIndex]`.
 *
 * **Subscribe** still uses the direct `@novasamatech/sdk-statement` client
 *   via JSON-RPC against People Chain. Subscribe doesn't need the on-chain
 *   allowance gate that submit does — it's read-only. Switching subscribe to
 *   the host's `statementStoreSubscribe` slot is a follow-on cleanup.
 *
 * No encryption for V1 — payloads are cleartext JSON.
 *
 * Each user has an "inbox" defined by two topics:
 *   Topic1 = hash("localdot-trade")    — filters to our app only
 *   Topic2 = hash(recipientEvmAddr)    — filters to a specific user
 *
 * Channels (last-write-wins per channel per signer):
 *   hash("req:{requestId}")           — buyer publishes trade request
 *   hash("res:{requestId}")           — provider publishes accept/decline
 *   hash("prop:{proposalId}")         — either side proposes new time / place / note
 *   hash("prop-res:{proposalId}")     — counterparty accepts/declines a proposal
 *   hash("status:{tradeId}")          — sender's live "on the way / here / late" heartbeat
 *
 * The response channel shares the same requestId so both sides can
 * correlate request ↔ response. They are separate channels because they
 * come from different signers (buyer vs provider).
 */

import {
  createPapiProvider,
  createStatementStore,
} from "@novasamatech/host-api-wrapper";
import {
  createExpiryFromDuration,
  createStatementSdk,
  stringToTopic,
} from "@novasamatech/sdk-statement";
import {
  createClient,
  type SubstrateClient,
} from "@polkadot-api/substrate-client";

import { type BootstrapStep, ensureBootstrap } from "./host/allowances";
import { activeNetwork } from "./host/networks";

type Topic = ReturnType<typeof stringToTopic>;

export const APP_TOPIC: Topic = stringToTopic("localdot-trade");
export const TTL_SECONDS = 8 * 60 * 60; // 8 hours

// Payload types

export interface TradeRequestPayload {
  k: "req";
  id: string;
  from: string; // sender EVM address
  offerId: string;
  amount: string;
  cur: string;
  agent?: string;
  note?: string;
  ts: number;
}

export interface TradeResponsePayload {
  k: "res";
  id: string;
  to: string; // original requester EVM address
  status: "accept" | "decline";
  ts: number;
}

export type ProposalKind = "time" | "location" | "recognition";

export interface MeetingLocationPayload {
  label: string;
  address: string;
  lat: number;
  lon: number;
}

export interface TradeProposalPayload {
  k: "prop";
  id: string; // proposal id (unique per proposal)
  tradeId: string;
  kind: ProposalKind;
  from: string; // sender EVM address
  scheduledAt?: number;
  location?: MeetingLocationPayload;
  recognition?: string;
  ts: number;
}

export interface TradeProposalResponsePayload {
  k: "prop-res";
  id: string; // matches the original proposal id
  tradeId: string;
  status: "accept" | "decline";
  ts: number;
}

export type LiveStatus = "idle" | "on-the-way" | "here" | "late";

export interface TradeLiveStatusPayload {
  k: "status";
  tradeId: string;
  from: string; // sender EVM address
  status: LiveStatus;
  lateMinutes?: number;
  ts: number;
}

/**
 * Delivery acknowledgement. Published automatically by the receiver's
 * message-store when an ackable payload (req / prop) lands in their DB.
 * The sender can derive a "delivered" indicator by joining outgoing rows
 * against incoming ack rows on (refK, refId).
 *
 * Not acked themselves (and never ack a `res` / `prop-res` / `status`) to
 * avoid loops and keep allowance traffic bounded.
 */
export interface AckPayload {
  k: "ack";
  /** The kind of the original statement being acked. */
  refK: "req" | "prop";
  /** The `id` of the original statement being acked. */
  refId: string;
  /** Acker's EVM address — i.e. the original recipient. */
  from: string;
  ts: number;
}

export type TradePayload =
  | TradeRequestPayload
  | TradeResponsePayload
  | TradeProposalPayload
  | TradeProposalResponsePayload
  | TradeLiveStatusPayload
  | AckPayload;

// ─── Wire envelope ──────────────────────────────────────────────────────────
//
// Outgoing wire bytes are `JSON.stringify({ v: 1, p: payload })`. The envelope
// adds a version field that lets future schema changes coexist with old
// clients gracefully (we decode the envelope first; an unknown `v` surfaces
// as `unsupported` rather than silently dropping the message). Mirrors the
// `VersionedChatMessage` / `AlwaysDecodableChatMessagePart` pattern from
// polkadot-app-android.

const WIRE_VERSION = 1;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function encodePayload(payload: TradePayload): Uint8Array {
  return textEncoder.encode(JSON.stringify({ v: WIRE_VERSION, p: payload }));
}

/**
 * Decode a wire payload to its TradePayload form. Returns `null` for any
 * shape we can't recognize OR for valid-but-unsupported versions; callers
 * that want to preserve the unsupported envelope (e.g. to keep history)
 * should use `decodePayloadEnvelope` instead.
 */
export function decodePayload(data: Uint8Array): TradePayload | null {
  const decoded = decodePayloadEnvelope(data);
  return decoded?.kind === "payload" ? decoded.payload : null;
}

/**
 * Decode result discriminated on success.
 *
 *   - `payload` — recognized version + valid TradePayload shape
 *   - `unsupported` — parseable but we don't know how to interpret. Caller
 *     can still preserve the envelope (id/ts) so the message appears in
 *     history as a placeholder instead of vanishing.
 *
 * Returns `null` only when the bytes aren't JSON or aren't an object.
 */
export type DecodedEnvelope =
  | { kind: "payload"; payload: TradePayload }
  | {
      kind: "unsupported";
      envelope: { v?: number; id?: string; ts?: number };
      raw: Uint8Array;
    };

export function decodePayloadEnvelope(
  data: Uint8Array,
): DecodedEnvelope | null {
  let outer: unknown;
  try {
    outer = JSON.parse(textDecoder.decode(data));
  } catch {
    return null;
  }
  if (!isObject(outer)) return null;

  const o = outer as Record<string, unknown>;

  // New format: { v: 1, p: <payload> }
  if (o.v === WIRE_VERSION && isObject(o.p)) {
    const payload = validatePayload(o.p);
    if (payload) return { kind: "payload", payload };
    const inner = o.p as Record<string, unknown>;
    return {
      kind: "unsupported",
      envelope: {
        v: WIRE_VERSION,
        id: typeof inner.id === "string" ? inner.id : undefined,
        ts: typeof inner.ts === "number" ? inner.ts : undefined,
      },
      raw: data,
    };
  }

  // Legacy format: top-level has `k` field (pre-envelope wire). Any
  // in-flight gossip from older clients still lands as a real payload.
  if (typeof o.k === "string") {
    const payload = validatePayload(o);
    if (payload) return { kind: "payload", payload };
  }

  // Unknown version or unrecognized shape. Preserve envelope hints so the
  // UI can at least show "an unsupported message from <ts> exists".
  return {
    kind: "unsupported",
    envelope: {
      v: typeof o.v === "number" ? o.v : undefined,
      id: typeof o.id === "string" ? o.id : undefined,
      ts: typeof o.ts === "number" ? o.ts : undefined,
    },
    raw: data,
  };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Strict validation of a payload's required fields by kind. Defensive
 * against JSON-shaped-but-malformed input (an attacker who controls the
 * statement bytes can write whatever they want; ditto a buggy older client).
 * The TS cast at the bottom is safe because we've verified everything the
 * inner code depends on.
 */
function validatePayload(p: Record<string, unknown>): TradePayload | null {
  if (typeof p.k !== "string") return null;
  if (typeof p.ts !== "number") return null;

  switch (p.k) {
    case "req":
      if (
        typeof p.id !== "string" ||
        typeof p.from !== "string" ||
        typeof p.offerId !== "string" ||
        typeof p.amount !== "string" ||
        typeof p.cur !== "string"
      )
        return null;
      return p as unknown as TradeRequestPayload;
    case "res":
      if (
        typeof p.id !== "string" ||
        typeof p.to !== "string" ||
        (p.status !== "accept" && p.status !== "decline")
      )
        return null;
      return p as unknown as TradeResponsePayload;
    case "prop":
      if (
        typeof p.id !== "string" ||
        typeof p.tradeId !== "string" ||
        typeof p.from !== "string" ||
        (p.kind !== "time" && p.kind !== "location" && p.kind !== "recognition")
      )
        return null;
      return p as unknown as TradeProposalPayload;
    case "prop-res":
      if (
        typeof p.id !== "string" ||
        typeof p.tradeId !== "string" ||
        (p.status !== "accept" && p.status !== "decline")
      )
        return null;
      return p as unknown as TradeProposalResponsePayload;
    case "status":
      if (
        typeof p.tradeId !== "string" ||
        typeof p.from !== "string" ||
        (p.status !== "idle" &&
          p.status !== "on-the-way" &&
          p.status !== "here" &&
          p.status !== "late")
      )
        return null;
      return p as unknown as TradeLiveStatusPayload;
    case "ack":
      if (
        typeof p.refId !== "string" ||
        typeof p.from !== "string" ||
        (p.refK !== "req" && p.refK !== "prop")
      )
        return null;
      return p as unknown as AckPayload;
    default:
      return null;
  }
}

// SDK singleton — one WebSocket connection shared across the app

type Sdk = ReturnType<typeof createStatementSdk>;

let _client: SubstrateClient | null = null;
let _sdk: Sdk | null = null;

/**
 * Returns the SDK singleton, opening a host-routed connection on first call.
 *
 * createStatementSdk expects two adapters:
 *   requestFn  — Promise-based, for statement_submit
 *   subscribeFn — callback-based, for statement_subscribeStatement
 *
 * SubstrateClient._request is callback-based, so requestFn wraps it
 * in a Promise, and subscribeFn maps it to the subscribe/unsubscribe
 * lifecycle the SDK expects.
 */
export function getSdk(): Sdk {
  if (_sdk) return _sdk;

  const provider = createPapiProvider(activeNetwork.peopleGenesis);
  _client = createClient(provider);
  const c = _client;

  // Promise wrapper for one-shot RPC calls (statement_submit)
  const requestFn = <Reply>(
    method: string,
    params: unknown[],
  ): Promise<Reply> =>
    new Promise<Reply>((resolve, reject) => {
      c._request<Reply, unknown>(method, params as never[], {
        onSuccess: (result) => resolve(result),
        onError: (e) => reject(e),
      });
    });

  // Callback wrapper for subscription RPC (statement_subscribeStatement)
  const subscribeFn = <T>(
    method: string,
    params: unknown[],
    onMessage: (message: T) => void,
    onError: (error: Error) => void,
  ): (() => void) => {
    let subId: string | null = null;
    let unsubLocal: (() => void) | null = null;

    const cancel = c._request<string, T>(method, params as never[], {
      onSuccess: (id, follow) => {
        subId = id;
        unsubLocal = follow(id, { next: onMessage, error: onError });
      },
      onError,
    });

    const unsubMethod = method.replace("subscribe", "unsubscribe");
    return () => {
      if (unsubLocal) {
        unsubLocal();
        if (subId != null) {
          c._request(unsubMethod, [subId], {
            onSuccess: () => {},
            onError: () => {},
          });
        }
      } else {
        cancel();
      }
    };
  };

  _sdk = createStatementSdk(requestFn, subscribeFn);
  return _sdk;
}

export function destroyConnection(): void {
  _client?.destroy();
  _client = null;
  _sdk = null;
}

// Helpers

/** Topic pair for a user's inbox: [appTopic, addressTopic]. */
export function inboxTopics(evmAddress: string): readonly [Topic, Topic] {
  return [APP_TOPIC, stringToTopic(evmAddress.toLowerCase())] as const;
}

/** Host's statement-store client — used for both `createProof` and `submit`. */
const hostStatementStore = createStatementStore();

function getProductAccountId(): [string, number] {
  if (typeof window === "undefined") {
    throw new Error("Statement store requires a window context");
  }
  return [window.location.host, 0];
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Step names surfaced via `PublishOpts.onProgress`. Sequence on the happy path:
 *   requesting-allowance → allowance-ok           (bootstrap, first call only)
 *   requesting-permission → permission-ok          (bootstrap, first call only)
 *   creating-proof → proof-ok
 *   submitting → submitted
 * On any failure, `error` fires with the message before the promise rejects.
 */
export type PublishStep =
  | BootstrapStep
  | "creating-proof"
  | "proof-ok"
  | "submitting"
  | "submitted";

export interface PublishOpts {
  /** Statement expiry in seconds. Defaults to `TTL_SECONDS` (8 hours). */
  ttlSeconds?: number;
  /** Progress callback fired at each step so the UI can show what's happening. */
  onProgress?: (step: PublishStep, detail?: string) => void;
}

/**
 * Sign and submit a statement to a recipient's address inbox.
 *
 * Signing is delegated to the host (whose session key holds the on-chain
 * statement-store allowance, granted at bootstrap time), so no caller-side
 * signer is needed — the recipient address is the only routing input.
 */
export async function publishStatement(
  recipientEvmAddress: string,
  channelKey: string,
  payload: TradePayload,
  opts: PublishOpts = {},
): Promise<void> {
  return await publishToTopics(
    inboxTopics(recipientEvmAddress),
    channelKey,
    payload,
    opts,
  );
}

async function publishToTopics(
  topics: readonly [Topic, Topic],
  channelKey: string,
  payload: TradePayload,
  opts: PublishOpts = {},
): Promise<void> {
  const ttlSeconds = opts.ttlSeconds ?? TTL_SECONDS;
  const progress: NonNullable<PublishOpts["onProgress"]> =
    opts.onProgress ?? (() => {});

  // 1. RFC-0010 allowance + RFC-0002 JIT permission. Memoized: only the first
  // call per session shows host modals; subsequent calls are no-op.
  await ensureBootstrap({
    onProgress: (step, detail) => progress(step, detail),
  });

  const [topic1, topic2] = topics;
  const expiryHex = createExpiryFromDuration(ttlSeconds);
  const channelHex = stringToTopic(channelKey);

  // 2. Sign via the host. The host's `createProof` slot ignores the
  // [dotNs, idx] tuple and signs with the visitor's root session key (see
  // dot.li auth/container source + the dot.li reference implementation's
  // productAccount.ts comments).
  // The on-chain allowance was granted to that root key in step 1, so the
  // People-chain validator accepts the proof.
  progress("creating-proof");
  let hostProof;
  try {
    hostProof = await hostStatementStore.createProof(getProductAccountId(), {
      proof: undefined,
      decryptionKey: undefined,
      expiry: expiryHex,
      channel: hexToBytes(channelHex),
      topics: [hexToBytes(topic1), hexToBytes(topic2)],
      data: encodePayload(payload),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // StatementProofErr.UnableToSign typically means the host has no active
    // SSO session — surface a user-actionable message rather than the raw
    // codec error.
    if (msg.includes("UnableToSign") || msg.includes("no session")) {
      const friendly =
        "No active session — sign in to Polkadot Desktop/Mobile and retry.";
      progress("error", friendly);
      throw new Error(friendly);
    }
    progress("error", msg);
    throw err;
  }
  progress("proof-ok");

  // 3. Submit through the host's chain client. We deliberately avoid
  // `sdk.submit(...)` here: the direct JSON-RPC client would talk to People
  // Chain with no allowance attribution, defeating step 1.
  progress("submitting");
  try {
    await hostStatementStore.submit({
      proof: hostProof,
      decryptionKey: undefined,
      expiry: expiryHex,
      channel: hexToBytes(channelHex),
      topics: [hexToBytes(topic1), hexToBytes(topic2)],
      data: encodePayload(payload),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    progress("error", msg);
    throw err;
  }
  progress("submitted");
}

export function generateRequestId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rand}`;
}
