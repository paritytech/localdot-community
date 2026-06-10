/**
 * useTradeRequests — trade-request lifecycle, backed by the local Dexie
 * `message-store`.
 *
 * Inspired by polkadot-app-android's chat module: the SS subscriber lives
 * once at app-level (started in WalletContext), writes everything into the
 * DB, and this hook subscribes to the DB via `useLiveQuery`. The previous
 * React-state + ad-hoc localStorage approach had three Critical bugs we
 * documented (orphan responses, saved-responses-lost-after-reload, double-
 * respond). All three disappear because state lives in one place that
 * handles ordering, idempotency, and survives reloads automatically.
 *
 * Action surface (sendRequest / declineRequest / acceptRequest / etc.)
 * is preserved so calling components don't change.
 */

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useMemo, useState } from "react";

import { useWalletContext } from "../context/WalletContext";
import { ss58ToEvmAddress } from "../lib/address";
import {
  db,
  pkFor,
  sendTradeMessage,
  type StoredStatement,
} from "../lib/message-store";
import {
  generateRequestId,
  type PublishStep,
  type TradeRequestPayload,
  type TradeResponsePayload,
} from "../lib/statement-store";

export type { PublishStep } from "../lib/statement-store";

interface SendOpts {
  onProgress?: (step: PublishStep, detail?: string) => void;
}

// Types

export interface IncomingRequest extends TradeRequestPayload {
  status?: "pending" | "declined" | "accepted";
  isMine?: boolean;
  acceptedAt?: number;
  /** True when the recipient's app has acked our outgoing `req` — i.e.
   *  their app has persisted it. UI surfaces this as a "Delivered" tick.
   *  Only meaningful on rows in `sentRequests` (where it's mine + outgoing). */
  acked?: boolean;
}

export interface SendRequestParams {
  to: string;
  offerId: string;
  amount: string;
  currency: string;
  agent?: string;
  note?: string;
}

/** Provider's record of a request they accepted on a BUY-direction offer —
 *  they have no tokens to lock, so they wait for the buyer to lockTrade.   */
export interface AcceptedAwaitingLock {
  req: IncomingRequest;
  acceptedAt: number;
}

/** Soft window after accept inside which the token-holder is expected to
 *  call lockTrade. Past this, the UI flags the request as expired. */
export const LOCK_WINDOW_MS = 60 * 60 * 1000; // 1h

// ─── awaitingLock storage (UI-only state, stays in localStorage) ────────────
//
// AcceptedAwaitingLock isn't a wire payload — it's a per-user UI state
// ("when I clicked accept on this BUY offer, start a countdown"). We keep
// it in localStorage rather than the message DB to avoid mixing pure UI
// state with statement-store-derived data.

const ACCEPTED_LOCK_KEY = "localdot_accepted_awaiting_lock";

function loadAwaitingLock(): AcceptedAwaitingLock[] {
  try {
    const raw = localStorage.getItem(ACCEPTED_LOCK_KEY);
    return raw ? (JSON.parse(raw) as AcceptedAwaitingLock[]) : [];
  } catch {
    return [];
  }
}

function saveAwaitingLock(items: AcceptedAwaitingLock[]): void {
  try {
    localStorage.setItem(ACCEPTED_LOCK_KEY, JSON.stringify(items));
  } catch {
    /* ignored */
  }
}

// ─── Hook ───────────────────────────────────────────────────────────────────

interface UseTradeRequestsReturn {
  ready: boolean;
  error: string | null;
  /** Incoming requests I haven't responded to (provider side) */
  requests: IncomingRequest[];
  /** Requests I sent (buyer side), with derived status from any matching `res` */
  sentRequests: IncomingRequest[];
  /** I (cash-holder) accepted these on a BUY offer; waiting for buyer's lockTrade */
  acceptedAwaitingLock: AcceptedAwaitingLock[];
  sendRequest: (
    params: SendRequestParams,
    opts?: SendOpts,
  ) => Promise<{ id: string }>;
  declineRequest: (req: IncomingRequest) => Promise<void>;
  acceptRequest: (
    req: IncomingRequest,
    opts?: { awaitingBuyerLock?: boolean },
  ) => Promise<void>;
  clearAwaitingLock: (reqId: string) => void;
  clearRequest: (reqId: string) => void;
  clearDoneRequests: () => void;
}

export function useTradeRequests(): UseTradeRequestsReturn {
  const { address, isConnected } = useWalletContext();

  const myEvmAddress = useMemo(() => {
    if (!address) return null;
    try {
      return ss58ToEvmAddress(address).toLowerCase();
    } catch {
      console.warn("[useTradeRequests] Invalid SS58 address:", address);
      return null;
    }
  }, [address]);

  // The SS subscriber lives in WalletContext, so `ready` here just reflects
  // "wallet connected + we know my EVM addr". Errors that the subscriber
  // surfaces are logged at the subscriber level; if we want them surfaced
  // here later, we add an error-bus to message-store.
  const ready = isConnected && myEvmAddress !== null;
  const error: string | null = null;

  // ── Incoming requests — provider's pending inbox ────────────────────────
  //
  // "Incoming req rows that I have NOT yet responded to AND have not
  // dismissed." The "not responded" check is a JOIN against outgoing `res`
  // rows on the request id.
  const requests =
    useLiveQuery<IncomingRequest[]>(async () => {
      if (!myEvmAddress) return [];

      const [incomingReqs, outgoingResIds] = await Promise.all([
        db.statements
          .where("[k+direction]")
          .equals(["req", "incoming"])
          .toArray(),
        db.statements
          .where("[k+direction]")
          .equals(["res", "outgoing"])
          .primaryKeys(),
      ]);

      const respondedIds = new Set(
        outgoingResIds.map((pk) => String(pk).slice("res:".length)),
      );

      return incomingReqs
        .filter((row) => !row.dismissed)
        .filter((row) => !respondedIds.has(row.id))
        .map((row) => {
          return {
            ...(row.payload as TradeRequestPayload),
            status: "pending" as const,
          };
        })
        .sort((a, b) => b.ts - a.ts);
    }, [myEvmAddress]) ?? [];

  // ── Sent requests — buyer's outbox ──────────────────────────────────────
  //
  // Outgoing `req` rows, with status derived from any matching incoming
  // `res`. Orphan responses (response arrives before request, or vice
  // versa) just work — the JOIN runs every time anything in the table
  // changes, so eventual consistency is automatic.
  const sentRequests =
    useLiveQuery<IncomingRequest[]>(async () => {
      if (!myEvmAddress) return [];

      const [outgoingReqs, incomingResRows, incomingAckRows] =
        await Promise.all([
          db.statements
            .where("[k+direction]")
            .equals(["req", "outgoing"])
            .toArray(),
          db.statements
            .where("[k+direction]")
            .equals(["res", "incoming"])
            .toArray(),
          // Acks for req — incoming ack rows whose synthesized id starts
          // with `req:` (per `extractId` in message-store).
          db.statements
            .where("[k+direction]")
            .equals(["ack", "incoming"])
            .toArray(),
        ]);

      const resById = new Map<string, TradeResponsePayload>();
      for (const row of incomingResRows) {
        resById.set(row.id, row.payload as TradeResponsePayload);
      }

      // ack id = `${refK}:${refId}` per message-store.extractId. We only
      // care about acks for `req` here.
      const ackedReqIds = new Set<string>();
      for (const row of incomingAckRows) {
        if (row.id.startsWith("req:")) {
          ackedReqIds.add(row.id.slice("req:".length));
        }
      }

      return outgoingReqs
        .filter((row) => !row.dismissed)
        .map((row) => {
          const req = row.payload as TradeRequestPayload;
          const res = resById.get(row.id);
          let status: "pending" | "accepted" | "declined" = "pending";
          let acceptedAt: number | undefined;
          if (res) {
            status = res.status === "accept" ? "accepted" : "declined";
            if (res.status === "accept") acceptedAt = res.ts;
          }
          return {
            ...req,
            isMine: true as const,
            status,
            acked: ackedReqIds.has(req.id),
            ...(acceptedAt !== undefined ? { acceptedAt } : {}),
          };
        })
        .sort((a, b) => b.ts - a.ts);
    }, [myEvmAddress]) ?? [];

  // ── Awaiting-lock (UI-only, localStorage) ───────────────────────────────
  const [acceptedAwaitingLock, setAcceptedAwaitingLock] =
    useState<AcceptedAwaitingLock[]>(loadAwaitingLock);

  // ── Actions ─────────────────────────────────────────────────────────────

  /** Publish a trade request to the provider's inbox. */
  const sendRequest = useCallback(
    async (
      params: SendRequestParams,
      opts: SendOpts = {},
    ): Promise<{ id: string }> => {
      if (!myEvmAddress) throw new Error("Wallet not connected");

      const id = generateRequestId();
      const payload: TradeRequestPayload = {
        k: "req",
        id,
        from: myEvmAddress,
        offerId: params.offerId,
        amount: params.amount,
        cur: params.currency,
        ...(params.agent ? { agent: params.agent.toLowerCase() } : {}),
        ...(params.note ? { note: params.note } : {}),
        ts: Date.now(),
      };

      // Route to the provider's address inbox, like every other message.
      // sendTradeMessage also writes the local outgoing row, so the buyer's
      // outbox shows the request immediately (the subscriber only ever sees
      // inbound statements, never our own outbound ones).
      await sendTradeMessage(myEvmAddress, params.to, payload, {
        onProgress: opts.onProgress,
      });

      return { id };
    },
    [myEvmAddress],
  );

  /** Decline a request — publishes response to the buyer's inbox. */
  const declineRequest = useCallback(
    async (req: IncomingRequest): Promise<void> => {
      if (!myEvmAddress) throw new Error("Wallet not connected");

      // Idempotency guard: if we've already responded, no-op. Looking up the
      // outgoing res row catches double-clicks even after a page reload.
      const alreadyResponded = await db.statements.get(pkFor("res", req.id));
      if (alreadyResponded?.direction === "outgoing") return;

      const payload: TradeResponsePayload = {
        k: "res",
        id: req.id,
        to: req.from.toLowerCase(),
        status: "decline",
        ts: Date.now(),
      };

      await sendTradeMessage(myEvmAddress, req.from.toLowerCase(), payload);
      // No need to manually remove from `requests` — the live query
      // re-runs against the DB and now finds the outgoing res, so the
      // request drops out of the pending-list naturally.
    },
    [myEvmAddress],
  );

  /** Accept a request — publishes the accept SS response. */
  const acceptRequest = useCallback(
    async (
      req: IncomingRequest,
      opts?: { awaitingBuyerLock?: boolean },
    ): Promise<void> => {
      if (!myEvmAddress) throw new Error("Wallet not connected");

      const alreadyResponded = await db.statements.get(pkFor("res", req.id));
      if (alreadyResponded?.direction === "outgoing") return;

      const acceptedAt = Date.now();
      const payload: TradeResponsePayload = {
        k: "res",
        id: req.id,
        to: req.from.toLowerCase(),
        status: "accept",
        ts: acceptedAt,
      };

      // Pin awaiting-lock state BEFORE publish so the countdown UI is up
      // immediately even if the publish takes a few seconds.
      if (opts?.awaitingBuyerLock) {
        setAcceptedAwaitingLock((prev) => {
          const others = prev.filter((e) => e.req.id !== req.id);
          const updated = [
            { req: { ...req, acceptedAt }, acceptedAt },
            ...others,
          ];
          saveAwaitingLock(updated);
          return updated;
        });
      }

      try {
        await sendTradeMessage(myEvmAddress, req.from.toLowerCase(), payload);
      } catch (err) {
        console.warn("[useTradeRequests] Failed to send accept via SS:", err);
        // The accept is still effective on-chain via lockTrade — the SS
        // notification is best-effort. Leaving the awaiting-lock entry up.
      }
    },
    [myEvmAddress],
  );

  /** Drop an awaiting-lock entry — used when the trade locks on chain or
   *  the provider clears an expired one manually. */
  const clearAwaitingLock = useCallback((reqId: string) => {
    setAcceptedAwaitingLock((prev) => {
      const updated = prev.filter((e) => e.req.id !== reqId);
      saveAwaitingLock(updated);
      return updated;
    });
  }, []);

  /** Soft-dismiss a single sent request from the buyer's list. */
  const clearRequest = useCallback((reqId: string) => {
    void db.statements.update(pkFor("req", reqId), { dismissed: true });
  }, []);

  /** Soft-dismiss all non-pending sent requests (declined + accepted). */
  const clearDoneRequests = useCallback(() => {
    void (async () => {
      const outgoingReqs = await db.statements
        .where("[k+direction]")
        .equals(["req", "outgoing"])
        .toArray();
      const incomingResIds = new Set(
        (
          await db.statements
            .where("[k+direction]")
            .equals(["res", "incoming"])
            .primaryKeys()
        ).map((pk) => String(pk).slice("res:".length)),
      );
      // "Done" = has a matching incoming response (accepted or declined)
      const doneIds = outgoingReqs
        .filter((row) => incomingResIds.has(row.id))
        .map((row) => row.pk);
      if (doneIds.length > 0) {
        await db.statements
          .where("pk")
          .anyOf(doneIds)
          .modify({ dismissed: true });
      }
    })();
  }, []);

  return {
    ready,
    error,
    requests,
    sentRequests,
    acceptedAwaitingLock,
    sendRequest,
    declineRequest,
    acceptRequest,
    clearAwaitingLock,
    clearRequest,
    clearDoneRequests,
  };
}

// Helper kept exported for any consumer that previously imported it.
export type { StoredStatement };
