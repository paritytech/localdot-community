import { Clock } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { ContractTrade } from "../../../hooks/useEscrow";
import { ZERO_ADDRESS } from "../../../lib/format";
import { EmptyState } from "../../common/EmptyState";
import { type PillTone } from "../../common/Pill";
import { Spinner } from "../../common/Spinner";
import { CompactTradeCard } from "../../trade/CompactTradeCard";
import {
  FilterChip,
  KeyboardHints,
  type SortDir,
  type SortKey,
  TradeTableHeader,
  TradeTableRow,
  useTradeRowNav,
} from "../../trade/TradeTable";

export type TradeAction = "confirm" | "cancel" | "refund";

type RowKind = "direct" | "via-agent";
type FilterId = "all" | "direct" | "agent";

function rowKindFor(trade: ContractTrade): RowKind {
  // Agent-mediated trades where the viewer is *only* the agent are filtered
  // out upstream (Profile), so the viewer here is always a buyer or provider.
  return trade.agent === ZERO_ADDRESS ? "direct" : "via-agent";
}

export function TradesTab({
  trades,
  loading,
  evmAddress,
  decimals,
  symbol,
  isOwn,
  onAction,
  pendingAction,
}: {
  trades: ContractTrade[];
  loading: boolean;
  evmAddress: string;
  decimals: number;
  symbol: string;
  isOwn: boolean;
  onAction: (tradeId: bigint, action: TradeAction) => void;
  pendingAction: { tradeId: bigint; action: TradeAction } | null;
}): JSX.Element {
  const totalCount = trades.length;

  if (loading && totalCount === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (totalCount === 0) {
    return (
      <EmptyState
        compact
        icon={Clock}
        title="No active trades"
        description="Accepted requests and locked trades appear here."
      />
    );
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-3 mb-5">
        <div>
          <h2 className="text-stone-100 text-base font-medium">
            Active trades
          </h2>
          <p className="text-stone-500 text-xs mt-1">
            Trades where you are the buyer or provider — and escrow is still
            open.
          </p>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-stone-500 px-2 py-1 rounded-md border border-stone-800">
          {trades.length} open
        </span>
      </div>

      {/* Desktop: table */}
      <div className="hidden lg:block">
        <ActiveTradesTable
          trades={trades}
          evmAddress={evmAddress}
          decimals={decimals}
          symbol={symbol}
        />
      </div>

      {/* Mobile: stacked cards */}
      <div className="lg:hidden space-y-3">
        {trades.map((trade) => (
          <TradeRow
            key={String(trade.id)}
            trade={trade}
            evmAddress={evmAddress}
            decimals={decimals}
            symbol={symbol}
            isOwn={isOwn}
            onAction={onAction}
            pendingAction={pendingAction}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Desktop active-trades table — filter chips, kbd nav, sortable cols ───

function ActiveTradesTable({
  trades,
  evmAddress,
  decimals,
  symbol,
}: {
  trades: ContractTrade[];
  evmAddress: string;
  decimals: number;
  symbol: string;
}): JSX.Element {
  const [filter, setFilter] = useState<FilterId>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "when",
    dir: "asc",
  });

  const counts = useMemo(() => {
    return {
      all: trades.length,
      direct: trades.filter((t) => rowKindFor(t) === "direct").length,
      agent: trades.filter((t) => rowKindFor(t) === "via-agent").length,
    };
  }, [trades]);

  const filtered = useMemo(() => {
    const matchFilter = (t: ContractTrade) => {
      const k = rowKindFor(t);
      if (filter === "all") return true;
      if (filter === "direct") return k === "direct";
      if (filter === "agent") return k === "via-agent";
      return true;
    };
    const arr = trades.filter(matchFilter);
    if (sort.key === "amount") {
      arr.sort((a, b) => Number(b.amount - a.amount));
    } else if (sort.key === "when") {
      arr.sort((a, b) => Number(b.lockedAt - a.lockedAt));
    } else if (sort.key === "status") {
      arr.sort((a, b) => a.state - b.state);
    }
    if (sort.dir === "desc") arr.reverse();
    return arr;
  }, [trades, filter, sort]);

  const [focused, setFocused] = useTradeRowNav(filtered);

  const setSortKey = (key: Exclude<SortKey, null>) => {
    setSort((s) => {
      return {
        key,
        dir: s.key === key && s.dir === "asc" ? "desc" : "asc",
      };
    });
  };

  const me = evmAddress.toLowerCase();

  return (
    <div>
      {/* Toolbar — filter chips + keyboard hints */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1">
          <FilterChip
            label="All"
            count={counts.all}
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          <FilterChip
            label="Direct"
            count={counts.direct}
            active={filter === "direct"}
            onClick={() => setFilter("direct")}
          />
          <FilterChip
            label="Via agent"
            count={counts.agent}
            active={filter === "agent"}
            onClick={() => setFilter("agent")}
          />
        </div>
        <KeyboardHints />
      </div>

      <div className="rounded-2xl border border-stone-800/80 bg-stone-900/30 overflow-hidden">
        <TradeTableHeader
          sortKey={sort.key}
          sortDir={sort.dir}
          onSort={setSortKey}
        />

        {filtered.length === 0 && (
          <div className="px-5 py-12 text-center text-sm text-stone-500">
            No trades match this filter.
          </div>
        )}
        {filtered.map((trade, i) => {
          const hasAgent = trade.agent !== ZERO_ADDRESS;
          const isCounterparty = trade.counterparty.toLowerCase() === me;
          return (
            <TradeTableRow
              key={String(trade.id)}
              trade={trade}
              evmAddress={evmAddress}
              decimals={decimals}
              symbol={symbol}
              status={pickRowStatus(trade, hasAgent, isCounterparty)}
              isFirst={i === 0}
              isFocused={i === focused}
              onHover={() => setFocused(i)}
            />
          );
        })}
      </div>

      <p className="mt-3 text-[11px] text-stone-600">
        Showing {filtered.length} of {trades.length} active trades.
      </p>
    </div>
  );
}

function pickRowStatus(
  trade: ContractTrade,
  hasAgent: boolean,
  isCounterparty: boolean,
): { tone: PillTone; label: string } {
  const now = Date.now();
  const lockedExpired =
    trade.state === 0 && Number(trade.lockedAt) * 1000 + 24 * 3_600_000 < now;
  const pickupExpired =
    trade.state === 1 &&
    Number(trade.pickupDeadline) > 0 &&
    Number(trade.pickupDeadline) * 1000 < now;

  if (lockedExpired) {
    return { tone: "rose", label: "Refund ready" };
  }
  if (pickupExpired) {
    // Provider (token-holder) can claim the agent's insurance; the cash-holder
    // (counterparty) is already settled.
    if (!isCounterparty) return { tone: "rose", label: "Insurance ready" };
    return { tone: "rose", label: "Pickup expired" };
  }

  if (trade.state === 1) {
    if (hasAgent) {
      if (isCounterparty) return { tone: "emerald", label: "Done" };
      return { tone: "amber", label: "Pickup ready" };
    }
    return { tone: "emerald", label: "Done" };
  }
  if (trade.state === 2) return { tone: "emerald", label: "Settled" };
  if (trade.state === 0) {
    if (hasAgent) return { tone: "amber", label: "Awaiting cash" };
    return { tone: "amber", label: "Meeting set" };
  }
  return { tone: "stone", label: "Settled" };
}

/**
 * One row in the active-trades list (mobile/tablet).
 */
function TradeRow({
  trade,
  evmAddress,
  decimals,
  symbol,
  isOwn,
  onAction,
  pendingAction,
}: {
  trade: ContractTrade;
  evmAddress: string;
  decimals: number;
  symbol: string;
  isOwn: boolean;
  onAction: (tradeId: bigint, action: TradeAction) => void;
  pendingAction: { tradeId: bigint; action: TradeAction } | null;
}): JSX.Element {
  const navigate = useNavigate();

  const isLocker = trade.locker.toLowerCase() === evmAddress.toLowerCase();
  const isCounterparty =
    trade.counterparty.toLowerCase() === evmAddress.toLowerCase();
  const expired =
    Number(trade.lockedAt) * 1000 + 24 * 60 * 60 * 1000 < Date.now();

  const alreadyCancelRequested =
    (isLocker && trade.lockerCancelRequested) ||
    (isCounterparty && trade.counterpartyCancelRequested);
  const isPending = (action: TradeAction) =>
    pendingAction?.tradeId === trade.id && pendingAction?.action === action;

  const handleCardClick = () => {
    navigate(`/trades/${trade.id.toString()}`, { state: { trade } });
  };

  const footerActions: {
    key: string;
    label: string;
    tone?: "neutral" | "danger" | "warn";
    disabled?: boolean;
    onClick: () => void;
  }[] = [];

  if (isOwn && trade.state === 0 && !alreadyCancelRequested && !expired) {
    footerActions.push({
      key: "cancel",
      label: isPending("cancel") ? "Cancelling…" : "Cancel",
      tone: "danger",
      disabled: isPending("cancel"),
      onClick: () => onAction(trade.id, "cancel"),
    });
  }
  if (isOwn && trade.state === 0 && expired && isLocker) {
    footerActions.push({
      key: "refund",
      label: isPending("refund") ? "Refunding…" : "Claim refund",
      tone: "warn",
      disabled: isPending("refund"),
      onClick: () => onAction(trade.id, "refund"),
    });
  }

  return (
    <div>
      <CompactTradeCard
        trade={trade}
        evmAddress={evmAddress}
        decimals={decimals}
        symbol={symbol}
        onClick={handleCardClick}
        footerActions={footerActions}
      />

      {(trade.lockerCancelRequested || trade.counterpartyCancelRequested) && (
        <div className="mt-2 px-3 py-2 rounded-lg bg-stone-800 border border-stone-700">
          <p className="text-xs text-stone-400">
            Cancel requested by{" "}
            {trade.lockerCancelRequested && trade.counterpartyCancelRequested
              ? "both parties"
              : trade.lockerCancelRequested
                ? "locker"
                : "counterparty"}
          </p>
        </div>
      )}
    </div>
  );
}
