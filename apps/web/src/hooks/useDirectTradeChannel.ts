/**
 * useDirectTradeChannel — in-trade coordination, backed by the local Dexie
 * `message-store`.
 *
 * Once an escrow is locked, both parties open this channel to negotiate
 * meeting time / place / recognition note and to broadcast their live
 * "on the way / here / late" status.
 *
 * Migrated from the React-state + localStorage approach to the same
 * DB-as-source-of-truth model as `useTradeRequests` (inspired by
 * polkadot-app-android's chat module). This eliminates the three Critical
 * direct-trade bugs we documented: orphan responses, saved-responses-lost-
 * after-reload, and double-respond. The single live query handles ordering,
 * idempotency, and survives reloads structurally.
 */

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useMemo } from "react";

import { useWalletContext } from "../context/WalletContext";
import { ss58ToEvmAddress } from "../lib/address";
import { db, pkFor, sendTradeMessage } from "../lib/message-store";
import {
  generateRequestId,
  type LiveStatus,
  type MeetingLocationPayload,
  type ProposalKind,
  type TradeLiveStatusPayload,
  type TradeProposalPayload,
  type TradeProposalResponsePayload,
} from "../lib/statement-store";

export type ProposalStatus = "pending" | "accepted" | "declined";

export interface DirectProposal {
  id: string;
  tradeId: string;
  kind: ProposalKind;
  /** Sender EVM address (lowercased) */
  from: string;
  scheduledAt?: number;
  location?: MeetingLocationPayload;
  recognition?: string;
  status: ProposalStatus;
  createdAt: number;
  /** True when the recipient's app has acked our outgoing `prop` — only
   *  meaningful on rows I sent (`from === myEvmAddress`). */
  acked?: boolean;
}

export interface CounterpartyLive {
  status: LiveStatus;
  lateMinutes?: number;
  updatedAt: number;
}

export interface SendProposalChange {
  scheduledAt?: number;
  location?: MeetingLocationPayload;
  recognition?: string;
}

interface UseDirectTradeChannelArgs {
  tradeId: string;
  counterpartyEvmAddress: string | null;
}

interface UseDirectTradeChannelReturn {
  ready: boolean;
  error: string | null;
  proposals: DirectProposal[];
  counterpartyLive: CounterpartyLive | null;
  /** My own last broadcast status for this trade, read back from the DB so a
   *  reload can restore it. Null until I've sent a status this trade. */
  myLive: CounterpartyLive | null;
  sendProposal: (
    kind: ProposalKind,
    change: SendProposalChange,
  ) => Promise<DirectProposal>;
  respondToProposal: (
    proposal: DirectProposal,
    decision: "accept" | "decline",
  ) => Promise<void>;
  sendStatus: (status: LiveStatus, lateMinutes?: number) => Promise<void>;
}

export function useDirectTradeChannel({
  tradeId,
  counterpartyEvmAddress,
}: UseDirectTradeChannelArgs): UseDirectTradeChannelReturn {
  const { address, isConnected } = useWalletContext();

  const myEvmAddress = useMemo(() => {
    if (!address) return null;
    try {
      return ss58ToEvmAddress(address).toLowerCase();
    } catch {
      console.warn("[useDirectTradeChannel] Invalid SS58 address:", address);
      return null;
    }
  }, [address]);

  const counterpartyAddr = counterpartyEvmAddress?.toLowerCase() ?? null;

  const ready =
    isConnected && myEvmAddress !== null && counterpartyAddr !== null;
  const error: string | null = null;

  // ── Proposals ──────────────────────────────────────────────────────────
  //
  // All `prop` rows for this trade (both outgoing and incoming), JOINed
  // against `prop-res` rows on id. Status: accepted / declined if a
  // matching prop-res exists, otherwise pending. The JOIN handles orphan
  // responses (response arrives before proposal) — both rows are in the DB,
  // and the live query re-runs when either is inserted, so eventual
  // consistency is automatic.
  const proposals =
    useLiveQuery<DirectProposal[]>(async () => {
      if (!tradeId) return [];

      const [propRows, propResRows, incomingAckRows] = await Promise.all([
        db.statements.where("[k+tradeId]").equals(["prop", tradeId]).toArray(),
        db.statements
          .where("[k+tradeId]")
          .equals(["prop-res", tradeId])
          .toArray(),
        db.statements
          .where("[k+direction]")
          .equals(["ack", "incoming"])
          .toArray(),
      ]);

      const resById = new Map<string, TradeProposalResponsePayload>();
      for (const row of propResRows) {
        resById.set(row.id, row.payload as TradeProposalResponsePayload);
      }

      // ack id = `${refK}:${refId}` — pick up the prop acks.
      const ackedPropIds = new Set<string>();
      for (const row of incomingAckRows) {
        if (row.id.startsWith("prop:")) {
          ackedPropIds.add(row.id.slice("prop:".length));
        }
      }

      return propRows
        .map((row) => {
          const p = row.payload as TradeProposalPayload;
          const res = resById.get(p.id);
          let status: ProposalStatus = "pending";
          if (res) {
            status = res.status === "accept" ? "accepted" : "declined";
          }
          return {
            id: p.id,
            tradeId: p.tradeId,
            kind: p.kind,
            from: p.from.toLowerCase(),
            ...(p.scheduledAt !== undefined
              ? { scheduledAt: p.scheduledAt }
              : {}),
            ...(p.location ? { location: p.location } : {}),
            ...(p.recognition !== undefined
              ? { recognition: p.recognition }
              : {}),
            status,
            createdAt: p.ts,
            acked: ackedPropIds.has(p.id),
          };
        })
        .sort((a, b) => b.createdAt - a.createdAt);
    }, [tradeId]) ?? [];

  // ── Counterparty live status ───────────────────────────────────────────
  //
  // Latest incoming `status` row for this trade where the sender is our
  // counterparty. Status payloads aren't channel-namespaced per-sender in
  // statement-store gossip (everyone uses `status:${tradeId}`), so the
  // sender filter is essential.
  const counterpartyLive =
    useLiveQuery<CounterpartyLive | null>(async () => {
      if (!tradeId || !counterpartyAddr) return null;

      const rows = await db.statements
        .where("[k+tradeId]")
        .equals(["status", tradeId])
        .toArray();

      // Find the latest status from the counterparty. We filter by direction
      // = "incoming" (my own statuses are direction=outgoing and don't belong
      // in their live state) and double-check `from` matches.
      let latest: CounterpartyLive | null = null;
      for (const row of rows) {
        if (row.direction !== "incoming") continue;
        const payload = row.payload as TradeLiveStatusPayload;
        if (payload.from.toLowerCase() !== counterpartyAddr) continue;
        if (!latest || payload.ts >= latest.updatedAt) {
          latest = {
            status: payload.status,
            ...(payload.lateMinutes !== undefined
              ? { lateMinutes: payload.lateMinutes }
              : {}),
            updatedAt: payload.ts,
          };
        }
      }
      return latest;
    }, [tradeId, counterpartyAddr]) ?? null;

  // ── My own live status ─────────────────────────────────────────────────
  //
  // Symmetric to `counterpartyLive`, but reads the *outgoing* status row —
  // the last status I broadcast for this trade. `sendStatus` already persists
  // every broadcast to the DB (`recordOutgoing`, last-write-wins on
  // `status:${tradeId}` per sender), so this lets the UI restore my status
  // picker after a reload instead of resetting it to "idle".
  const myLive =
    useLiveQuery<CounterpartyLive | null>(async () => {
      if (!tradeId || !myEvmAddress) return null;

      const rows = await db.statements
        .where("[k+tradeId]")
        .equals(["status", tradeId])
        .toArray();

      let latest: CounterpartyLive | null = null;
      for (const row of rows) {
        if (row.direction !== "outgoing") continue;
        const payload = row.payload as TradeLiveStatusPayload;
        if (payload.from.toLowerCase() !== myEvmAddress) continue;
        if (!latest || payload.ts >= latest.updatedAt) {
          latest = {
            status: payload.status,
            ...(payload.lateMinutes !== undefined
              ? { lateMinutes: payload.lateMinutes }
              : {}),
            updatedAt: payload.ts,
          };
        }
      }
      return latest;
    }, [tradeId, myEvmAddress]) ?? null;

  // ── Actions ────────────────────────────────────────────────────────────

  const sendProposal = useCallback(
    async (
      kind: ProposalKind,
      change: SendProposalChange,
    ): Promise<DirectProposal> => {
      if (!myEvmAddress) throw new Error("Wallet not connected");
      if (!counterpartyAddr) throw new Error("Counterparty unknown");

      const id = generateRequestId();
      const now = Date.now();
      const payload: TradeProposalPayload = {
        k: "prop",
        id,
        tradeId,
        kind,
        from: myEvmAddress,
        ...(change.scheduledAt !== undefined
          ? { scheduledAt: change.scheduledAt }
          : {}),
        ...(change.location ? { location: change.location } : {}),
        ...(change.recognition !== undefined
          ? { recognition: change.recognition }
          : {}),
        ts: now,
      };

      await sendTradeMessage(myEvmAddress, counterpartyAddr, payload);

      return {
        id,
        tradeId,
        kind,
        from: myEvmAddress,
        ...(change.scheduledAt !== undefined
          ? { scheduledAt: change.scheduledAt }
          : {}),
        ...(change.location ? { location: change.location } : {}),
        ...(change.recognition !== undefined
          ? { recognition: change.recognition }
          : {}),
        status: "pending",
        createdAt: now,
      };
    },
    [myEvmAddress, counterpartyAddr, tradeId],
  );

  const respondToProposal = useCallback(
    async (
      proposal: DirectProposal,
      decision: "accept" | "decline",
    ): Promise<void> => {
      if (!counterpartyAddr) throw new Error("Counterparty unknown");
      if (!myEvmAddress) throw new Error("Wallet not connected");

      // Idempotency guard — if we've already responded to this proposal,
      // no-op. Single DB read; survives page reloads.
      const alreadyResponded = await db.statements.get(
        pkFor("prop-res", proposal.id),
      );
      if (alreadyResponded?.direction === "outgoing") return;

      const payload: TradeProposalResponsePayload = {
        k: "prop-res",
        id: proposal.id,
        tradeId,
        status: decision,
        ts: Date.now(),
      };

      await sendTradeMessage(myEvmAddress, counterpartyAddr, payload);
    },
    [counterpartyAddr, myEvmAddress, tradeId],
  );

  const sendStatus = useCallback(
    async (status: LiveStatus, lateMinutes?: number): Promise<void> => {
      if (!myEvmAddress) throw new Error("Wallet not connected");
      if (!counterpartyAddr) throw new Error("Counterparty unknown");

      // Status payloads have no wire-level `id` — the channel is
      // `status:${tradeId}` with last-write-wins per sender. The recording
      // step inside `sendTradeMessage` synthesizes a stable per-sender id
      // (`<tradeId>:<from>`) so the DB row gets overwritten on each broadcast
      // rather than accumulating.
      const payload: TradeLiveStatusPayload = {
        k: "status",
        tradeId,
        from: myEvmAddress,
        status,
        ...(lateMinutes !== undefined ? { lateMinutes } : {}),
        ts: Date.now(),
      };

      await sendTradeMessage(myEvmAddress, counterpartyAddr, payload);
    },
    [myEvmAddress, counterpartyAddr, tradeId],
  );

  return {
    ready,
    error,
    proposals,
    counterpartyLive,
    myLive,
    sendProposal,
    respondToProposal,
    sendStatus,
  };
}
