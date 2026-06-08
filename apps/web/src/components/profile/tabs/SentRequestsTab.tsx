/**
 * "Sent" profile tab — trade requests I've sent to providers. Mirrors the
 * Active-trades / My-offers tables: header + count pill, status filter chips, a
 * dense desktop table (../../common/ListTable primitives, shared TypeBadge +
 * status Pill) and a card grid on mobile. The per-row action is the buyer-side
 * "Lock funds" step (when a BUY-offer provider has accepted) plus a clear
 * control for finished requests; "Clear all done" lives in the toolbar.
 */

import { Check, Send, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";

import {
  type IncomingRequest,
  LOCK_WINDOW_MS,
} from "../../../hooks/useTradeRequests";
import { timeAgo } from "../../../lib/format";
import type { Offer } from "../../../types/offers";
import { EmptyState } from "../../common/EmptyState";
import { FilterChip } from "../../common/ListTable";
import { Pill, type PillTone } from "../../common/Pill";
import { TypeBadge } from "../../trade/TradeTable";

type SentFilter = "all" | "pending" | "accepted" | "declined";
type SentStatus = "pending" | "accepted" | "declined";

/** Grid template shared by the sent-requests header and body rows. */
const SENT_TABLE_COLS = "grid-cols-[160px_140px_1fr_130px_170px]";

interface SentRequestsTabProps {
  sentRequests: IncomingRequest[];
  offers: Offer[];
  onLockFunds: (req: IncomingRequest, offer: Offer | undefined) => void;
  clearRequest: (id: string) => void;
  clearDoneRequests: () => void;
}

function statusOf(req: IncomingRequest): SentStatus {
  return req.status ?? "pending";
}

export function SentRequestsTab({
  sentRequests,
  offers,
  onLockFunds,
  clearRequest,
  clearDoneRequests,
}: SentRequestsTabProps): JSX.Element {
  const [filter, setFilter] = useState<SentFilter>("all");

  const counts = useMemo(() => {
    return {
      all: sentRequests.length,
      pending: sentRequests.filter((r) => statusOf(r) === "pending").length,
      accepted: sentRequests.filter((r) => statusOf(r) === "accepted").length,
      declined: sentRequests.filter((r) => statusOf(r) === "declined").length,
    };
  }, [sentRequests]);

  const filtered = useMemo(
    () =>
      sentRequests.filter((r) => {
        if (filter === "all") return true;
        return statusOf(r) === filter;
      }),
    [sentRequests, filter],
  );

  const hasDone = counts.accepted + counts.declined > 0;
  const offerFor = (req: IncomingRequest): Offer | undefined =>
    offers.find((o) => o.id === req.offerId);

  if (sentRequests.length === 0) {
    return (
      <EmptyState
        compact
        icon={Send}
        title="No requests sent"
        description="Requests you send to providers show up here."
      />
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between gap-3 mb-5">
        <div>
          <h2 className="text-stone-100 text-base font-medium">Sent</h2>
          <p className="text-stone-500 text-xs mt-1">
            Trade requests you've sent to providers.
          </p>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-stone-500 px-2 py-1 rounded-md border border-stone-800">
          {sentRequests.length} sent
        </span>
      </div>

      {/* Toolbar — status filter chips + clear-done */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-1">
          <FilterChip
            label="All"
            count={counts.all}
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          <FilterChip
            label="Pending"
            count={counts.pending}
            active={filter === "pending"}
            onClick={() => setFilter("pending")}
          />
          <FilterChip
            label="Accepted"
            count={counts.accepted}
            active={filter === "accepted"}
            onClick={() => setFilter("accepted")}
          />
          <FilterChip
            label="Declined"
            count={counts.declined}
            active={filter === "declined"}
            onClick={() => setFilter("declined")}
          />
        </div>
        {hasDone && (
          <button
            className="inline-flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-300 px-2.5 py-1 rounded-md border border-stone-800 hover:border-stone-700 transition-colors"
            onClick={() => {
              if (confirm("Clear all declined and accepted requests?"))
                clearDoneRequests();
            }}
          >
            <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
            Clear done
          </button>
        )}
      </div>

      {/* Desktop: table */}
      <div className="hidden lg:block rounded-2xl border border-stone-800/80 bg-stone-900/30 overflow-hidden">
        <div
          className={`grid ${SENT_TABLE_COLS} items-center gap-4 px-5 py-2.5 border-b border-stone-900 bg-stone-950/40`}
        >
          <HeaderLabel>Amount</HeaderLabel>
          <HeaderLabel>Type</HeaderLabel>
          <HeaderLabel>When</HeaderLabel>
          <HeaderLabel>Status</HeaderLabel>
          <span />
        </div>

        {filtered.length === 0 && (
          <div className="px-5 py-12 text-center text-sm text-stone-500">
            No requests match this filter.
          </div>
        )}
        {filtered.map((req, i) => (
          <SentRow
            key={req.id}
            req={req}
            offer={offerFor(req)}
            isFirst={i === 0}
            onLockFunds={onLockFunds}
            clearRequest={clearRequest}
          />
        ))}
      </div>

      {/* Mobile/tablet: card grid */}
      <div className="lg:hidden space-y-3">
        {filtered.map((req) => (
          <SentCard
            key={req.id}
            req={req}
            offer={offerFor(req)}
            onLockFunds={onLockFunds}
            clearRequest={clearRequest}
          />
        ))}
      </div>
    </div>
  );
}

function HeaderLabel({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <span className="text-[10px] uppercase tracking-[0.1em] text-stone-500 font-medium">
      {children}
    </span>
  );
}

function StatusPill({ status }: { status: SentStatus }): JSX.Element {
  const tone: PillTone =
    status === "accepted"
      ? "emerald"
      : status === "declined"
        ? "rose"
        : "amber";
  const label =
    status === "accepted"
      ? "Accepted"
      : status === "declined"
        ? "Declined"
        : "Pending";
  return <Pill tone={tone} label={label} />;
}

// ─── Desktop row ─────────────────────────────────────────────────────────────

function SentRow({
  req,
  offer,
  isFirst,
  onLockFunds,
  clearRequest,
}: {
  req: IncomingRequest;
  offer: Offer | undefined;
  isFirst: boolean;
  onLockFunds: (req: IncomingRequest, offer: Offer | undefined) => void;
  clearRequest: (id: string) => void;
}): JSX.Element {
  return (
    <div
      className={`grid ${SENT_TABLE_COLS} items-center gap-4 px-5 py-3.5 text-sm transition-colors hover:bg-stone-900/50 ${
        isFirst ? "" : "border-t border-stone-900"
      }`}
    >
      <div className="min-w-0">
        <p className="flex items-baseline gap-1">
          <span className="mono text-base text-stone-100 font-medium tabular-nums">
            {req.amount}
          </span>
          <span className="mono text-[10px] uppercase tracking-wider text-stone-500">
            {req.cur}
          </span>
        </p>
        <p className="text-stone-500 text-xs mt-0.5 truncate">
          <span className="mono text-stone-600">#{req.offerId}</span>
        </p>
      </div>
      <div>
        <TypeBadge hasAgent={!!req.agent} />
      </div>
      <div className="min-w-0 text-sm text-stone-300 truncate">
        {timeAgo(req.ts)}
      </div>
      <div>
        <StatusPill status={statusOf(req)} />
      </div>
      <div className="flex justify-end">
        <SentAction
          req={req}
          offer={offer}
          onLockFunds={onLockFunds}
          clearRequest={clearRequest}
        />
      </div>
    </div>
  );
}

// ─── Mobile card ─────────────────────────────────────────────────────────────

function SentCard({
  req,
  offer,
  onLockFunds,
  clearRequest,
}: {
  req: IncomingRequest;
  offer: Offer | undefined;
  onLockFunds: (req: IncomingRequest, offer: Offer | undefined) => void;
  clearRequest: (id: string) => void;
}): JSX.Element {
  return (
    <div className="rounded-2xl border border-stone-800/80 bg-stone-900/60 p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="mono text-lg text-stone-100 font-medium tabular-nums">
              {req.amount}
            </span>
            <span className="text-stone-500 text-xs">{req.cur}</span>
            <span className="ml-1">
              <StatusPill status={statusOf(req)} />
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-1 flex items-center gap-1.5">
            <span className="mono text-stone-600">#{req.offerId}</span>
            <TypeBadge hasAgent={!!req.agent} />
          </p>
        </div>
        <span className="text-[11px] text-stone-500 shrink-0">
          {timeAgo(req.ts)}
        </span>
      </div>
      {req.note && (
        <p className="text-xs text-stone-400 mb-2 italic">
          &ldquo;{req.note}&rdquo;
        </p>
      )}
      <SentAction
        req={req}
        offer={offer}
        onLockFunds={onLockFunds}
        clearRequest={clearRequest}
        full
      />
    </div>
  );
}

// ─── Per-row action: buyer-side lock / expiry notice / clear ─────────────────

function SentAction({
  req,
  offer,
  onLockFunds,
  clearRequest,
  full = false,
}: {
  req: IncomingRequest;
  offer: Offer | undefined;
  onLockFunds: (req: IncomingRequest, offer: Offer | undefined) => void;
  clearRequest: (id: string) => void;
  full?: boolean;
}): JSX.Element | null {
  const status = statusOf(req);
  const isDone = status === "declined" || status === "accepted";
  // BUY offer: I'm the requester so I hold the tokens — once the provider has
  // SS-accepted I must lock to start the trade. SELL offer: the provider locked
  // on accept, so there's nothing for me to do here.
  const isBuyerLockSide = status === "accepted" && offer?.role === "buyer";
  const lockElapsed = req.acceptedAt ? Date.now() - req.acceptedAt : 0;
  const lockRemaining = LOCK_WINDOW_MS - lockElapsed;
  const lockExpired = isBuyerLockSide && lockRemaining <= 0;
  const lockRemainingMin = Math.max(0, Math.ceil(lockRemaining / 60_000));
  const needsBuyerLock = isBuyerLockSide && !lockExpired;

  if (needsBuyerLock) {
    return (
      <button
        className={`inline-flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition-colors ${
          full ? "w-full" : ""
        }`}
        onClick={() => onLockFunds(req, offer)}
      >
        <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
        Lock funds
        <span className="text-[10px] opacity-80">({lockRemainingMin}m)</span>
      </button>
    );
  }
  if (lockExpired) {
    return (
      <span className="text-xs text-rose-300/80">Lock window expired</span>
    );
  }
  if (isDone) {
    return (
      <button
        onClick={() => {
          if (confirm("Remove this request?")) clearRequest(req.id);
        }}
        className={`inline-flex items-center justify-center gap-1.5 text-xs text-stone-500 hover:text-stone-300 transition-colors ${
          full
            ? "w-full px-3 py-1.5 rounded-lg border border-stone-800 hover:border-stone-700"
            : ""
        }`}
        title="Remove"
      >
        <X className="w-3.5 h-3.5" />
        {full && "Remove"}
      </button>
    );
  }
  return null;
}
