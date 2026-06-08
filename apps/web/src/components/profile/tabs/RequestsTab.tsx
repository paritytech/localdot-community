/**
 * "Received" profile tab — trade requests buyers have sent on my offers.
 * Mirrors the Active-trades / My-offers tables: header + count pill, status
 * filter chips, a dense desktop table (../../common/ListTable primitives, the
 * shared TypeBadge + status Pill) and a card grid on mobile. Unlike those
 * tables the rows aren't click-to-open — each carries inline Accept/Lock/Decline
 * actions — so there's no keyboard-nav/chevron affordance.
 */

import { Check, Clock, Inbox, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  type AcceptedAwaitingLock,
  type IncomingRequest,
  LOCK_WINDOW_MS,
} from "../../../hooks/useTradeRequests";
import { shortenAddress, timeAgo } from "../../../lib/format";
import type { Offer } from "../../../types/offers";
import { EmptyState } from "../../common/EmptyState";
import { FilterChip } from "../../common/ListTable";
import { Pill } from "../../common/Pill";
import { TypeBadge } from "../../trade/TradeTable";

type ReqFilter = "all" | "pending" | "declined";

/** Grid template shared by the received-requests header and body rows. */
const REQ_TABLE_COLS = "grid-cols-[150px_1fr_130px_140px_210px]";

interface RequestsTabProps {
  requests: IncomingRequest[];
  offers: Offer[];
  acceptedAwaitingLock: AcceptedAwaitingLock[];
  onClearAwaitingLock: (reqId: string) => void;
  onLockFunds: (req: IncomingRequest, offer: Offer | undefined) => void;
  onAccept: (
    req: IncomingRequest,
    offer: Offer | undefined,
  ) => void | Promise<void>;
  onDecline: (req: IncomingRequest) => void | Promise<void>;
}

export function RequestsTab({
  requests,
  offers,
  acceptedAwaitingLock,
  onClearAwaitingLock,
  onLockFunds,
  onAccept,
  onDecline,
}: RequestsTabProps): JSX.Element {
  const [filter, setFilter] = useState<ReqFilter>("all");

  const counts = useMemo(() => {
    return {
      all: requests.length,
      pending: requests.filter((r) => (r.status ?? "pending") === "pending")
        .length,
      declined: requests.filter((r) => r.status === "declined").length,
    };
  }, [requests]);

  const filtered = useMemo(
    () =>
      requests.filter((r) => {
        const status = r.status ?? "pending";
        if (filter === "pending") return status === "pending";
        if (filter === "declined") return status === "declined";
        return true;
      }),
    [requests, filter],
  );

  const offerFor = (req: IncomingRequest): Offer | undefined =>
    offers.find((o) => o.id === req.offerId);

  if (requests.length === 0 && acceptedAwaitingLock.length === 0) {
    return (
      <EmptyState
        compact
        icon={Inbox}
        title="No trade requests"
        description="When a buyer requests one of your offers, it shows up here."
      />
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between gap-3 mb-5">
        <div>
          <h2 className="text-stone-100 text-base font-medium">Received</h2>
          <p className="text-stone-500 text-xs mt-1">
            Trade requests buyers have sent on your offers.
          </p>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-stone-500 px-2 py-1 rounded-md border border-stone-800">
          {counts.pending} pending
        </span>
      </div>

      {/* Awaiting buyer lock — accepted requests still waiting on the buyer */}
      {acceptedAwaitingLock.length > 0 && (
        <div className="mb-5 space-y-3">
          <p className="text-[11px] text-stone-500 uppercase tracking-[0.16em] font-medium">
            Awaiting buyer lock
          </p>
          {acceptedAwaitingLock.map((entry) => (
            <AwaitingLockCard
              key={entry.req.id}
              entry={entry}
              onClear={() => onClearAwaitingLock(entry.req.id)}
            />
          ))}
        </div>
      )}

      {requests.length > 0 && (
        <>
          {/* Toolbar — status filter chips */}
          <div className="flex items-center justify-between mb-3">
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
                label="Declined"
                count={counts.declined}
                active={filter === "declined"}
                onClick={() => setFilter("declined")}
              />
            </div>
          </div>

          {/* Desktop: table */}
          <div className="hidden lg:block rounded-2xl border border-stone-800/80 bg-stone-900/30 overflow-hidden">
            <div
              className={`grid ${REQ_TABLE_COLS} items-center gap-4 px-5 py-2.5 border-b border-stone-900 bg-stone-950/40`}
            >
              <HeaderLabel>Amount</HeaderLabel>
              <HeaderLabel>Buyer</HeaderLabel>
              <HeaderLabel>Type</HeaderLabel>
              <HeaderLabel>When</HeaderLabel>
              <span />
            </div>

            {filtered.length === 0 && (
              <div className="px-5 py-12 text-center text-sm text-stone-500">
                No requests match this filter.
              </div>
            )}
            {filtered.map((req, i) => (
              <ReceivedRow
                key={req.id}
                req={req}
                offer={offerFor(req)}
                isFirst={i === 0}
                onLockFunds={onLockFunds}
                onAccept={onAccept}
                onDecline={onDecline}
              />
            ))}
          </div>

          {/* Mobile/tablet: card grid */}
          <div className="lg:hidden space-y-3">
            {filtered.map((req) => (
              <ReceivedCard
                key={req.id}
                req={req}
                offer={offerFor(req)}
                onLockFunds={onLockFunds}
                onAccept={onAccept}
                onDecline={onDecline}
              />
            ))}
          </div>
        </>
      )}
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

// ─── Desktop row ─────────────────────────────────────────────────────────────

function ReceivedRow({
  req,
  offer,
  isFirst,
  onLockFunds,
  onAccept,
  onDecline,
}: {
  req: IncomingRequest;
  offer: Offer | undefined;
  isFirst: boolean;
  onLockFunds: (req: IncomingRequest, offer: Offer | undefined) => void;
  onAccept: (
    req: IncomingRequest,
    offer: Offer | undefined,
  ) => void | Promise<void>;
  onDecline: (req: IncomingRequest) => void | Promise<void>;
}): JSX.Element {
  return (
    <div
      className={`grid ${REQ_TABLE_COLS} items-center gap-4 px-5 py-3.5 text-sm transition-colors hover:bg-stone-900/50 ${
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
      <div className="min-w-0 pr-3">
        <div className="flex items-center gap-2">
          <span className="text-stone-500">From</span>
          <Link
            to={`/profile/${req.from}`}
            className="mono text-stone-100 hover:text-white underline underline-offset-2 decoration-stone-700"
          >
            {shortenAddress(req.from)}
          </Link>
        </div>
        {req.note && (
          <p className="text-stone-500 text-xs mt-0.5 truncate">
            &ldquo;{req.note}&rdquo;
          </p>
        )}
      </div>
      <div>
        <TypeBadge hasAgent={!!req.agent} />
      </div>
      <div className="min-w-0 text-sm">
        <div className="flex items-center gap-1.5 text-stone-300">
          <Clock className="w-3.5 h-3.5 text-stone-500 shrink-0" />
          <span className="truncate">{timeAgo(req.ts)}</span>
        </div>
      </div>
      <div className="flex justify-end">
        <RequestActions
          req={req}
          offer={offer}
          onLockFunds={onLockFunds}
          onAccept={onAccept}
          onDecline={onDecline}
        />
      </div>
    </div>
  );
}

// ─── Mobile card ─────────────────────────────────────────────────────────────

function ReceivedCard({
  req,
  offer,
  onLockFunds,
  onAccept,
  onDecline,
}: {
  req: IncomingRequest;
  offer: Offer | undefined;
  onLockFunds: (req: IncomingRequest, offer: Offer | undefined) => void;
  onAccept: (
    req: IncomingRequest,
    offer: Offer | undefined,
  ) => void | Promise<void>;
  onDecline: (req: IncomingRequest) => void | Promise<void>;
}): JSX.Element {
  return (
    <div className="rounded-2xl border border-stone-800/80 bg-stone-900/60 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="mono text-lg text-stone-100 font-medium tabular-nums">
              {req.amount}
            </span>
            <span className="text-stone-500 text-xs">{req.cur}</span>
            <span className="ml-1">
              <TypeBadge hasAgent={!!req.agent} />
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-1">
            From{" "}
            <Link
              to={`/profile/${req.from}`}
              className="mono text-stone-300 hover:text-stone-100"
            >
              {shortenAddress(req.from)}
            </Link>{" "}
            · <span className="mono text-stone-600">#{req.offerId}</span>
          </p>
        </div>
        <span className="text-[11px] text-stone-500 shrink-0">
          {timeAgo(req.ts)}
        </span>
      </div>
      {req.note && (
        <p className="text-sm text-stone-400 mb-3 italic">
          &ldquo;{req.note}&rdquo;
        </p>
      )}
      <RequestActions
        req={req}
        offer={offer}
        onLockFunds={onLockFunds}
        onAccept={onAccept}
        onDecline={onDecline}
        full
      />
    </div>
  );
}

// ─── Shared accept / lock / decline controls ─────────────────────────────────

function RequestActions({
  req,
  offer,
  onLockFunds,
  onAccept,
  onDecline,
  full = false,
}: {
  req: IncomingRequest;
  offer: Offer | undefined;
  onLockFunds: (req: IncomingRequest, offer: Offer | undefined) => void;
  onAccept: (
    req: IncomingRequest,
    offer: Offer | undefined,
  ) => void | Promise<void>;
  onDecline: (req: IncomingRequest) => void | Promise<void>;
  full?: boolean;
}): JSX.Element {
  if (req.status === "declined") {
    return <Pill tone="rose" label="Declined" />;
  }
  // SELL offer: I hold the tokens — lock now to accept. BUY offer: I hold cash —
  // just send the SS accept and wait for the buyer to lock.
  const isBuyOffer = offer?.role === "buyer";
  return (
    <div className={`flex items-center gap-2 ${full ? "w-full" : ""}`}>
      <button
        className={`inline-flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition-colors ${
          full ? "flex-1" : ""
        }`}
        onClick={() => {
          if (isBuyOffer) void onAccept(req, offer);
          else onLockFunds(req, offer);
        }}
      >
        <Check className="w-3.5 h-3.5" strokeWidth={2.5} />
        {isBuyOffer ? "Accept" : "Lock funds"}
      </button>
      <button
        className={`inline-flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500/5 border border-red-500/20 text-red-400/70 hover:bg-red-500/10 hover:text-red-400 transition-colors ${
          full ? "flex-1" : ""
        }`}
        onClick={() => void onDecline(req)}
      >
        <X className="w-3.5 h-3.5" strokeWidth={2.5} />
        Decline
      </button>
    </div>
  );
}

// ─── Awaiting-lock alert card (accepted, waiting on the buyer) ────────────────

function AwaitingLockCard({
  entry,
  onClear,
}: {
  entry: AcceptedAwaitingLock;
  onClear: () => void;
}): JSX.Element {
  const elapsed = Date.now() - entry.acceptedAt;
  const remaining = LOCK_WINDOW_MS - elapsed;
  const expired = remaining <= 0;
  const remainingMin = Math.max(0, Math.ceil(remaining / 60_000));
  return (
    <div
      className={`rounded-2xl border bg-stone-900/60 px-5 py-4 ${
        expired ? "border-rose-500/30" : "border-amber-500/30"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="mono text-base text-stone-100 font-medium">
              {entry.req.amount} {entry.req.cur}
            </span>
            <Pill
              tone={expired ? "rose" : "amber"}
              label={expired ? "Lock window expired" : `${remainingMin}m left`}
            />
          </div>
          <p className="text-xs text-stone-500 mt-1">
            Buyer{" "}
            <span className="mono text-stone-300">
              {shortenAddress(entry.req.from)}
            </span>{" "}
            must lock tokens to start the trade.
          </p>
        </div>
        <button
          onClick={() => {
            if (
              expired
                ? confirm("Drop this expired request?")
                : confirm("Stop tracking this request?")
            )
              onClear();
          }}
          className="text-stone-600 hover:text-stone-400 transition-colors"
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
