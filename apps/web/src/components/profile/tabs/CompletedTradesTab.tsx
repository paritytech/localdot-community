/**
 * CompletedTradesTab — read-only showcase of a profile's finished trades.
 *
 * "Completed" = any terminal state (state >= 2: Settled / Refunded / Cancelled
 * / Insured), the exact complement of the Active Trades tab (state 0 | 1). The
 * parent (Profile) already loads every trade for the address, so this tab just
 * presents the terminal slice. It mirrors the Active Trades tab's look — a
 * sortable, filterable table on desktop and a card grid on mobile — so the two
 * tabs feel like one product; each row/card deep-links to /trades/:id and
 * passes the trade in router state to skip a chain round-trip.
 */

import { CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import type { ContractTrade } from "../../../hooks/useEscrow";
import { tradeStateLabel } from "../../../lib/trade-state";
import { EmptyState } from "../../common/EmptyState";
import { Spinner } from "../../common/Spinner";
import { CompactTradeCard } from "../../trade/CompactTradeCard";
import {
  FilterChip,
  KeyboardHints,
  type RowStatus,
  type SortDir,
  type SortKey,
  TradeTableHeader,
  TradeTableRow,
  useTradeRowNav,
} from "../../trade/TradeTable";

type OutcomeFilter = "all" | "settled" | "refunded" | "cancelled";

export function CompletedTradesTab({
  trades,
  loading,
  evmAddress,
  decimals,
  symbol,
}: {
  trades: ContractTrade[];
  loading: boolean;
  evmAddress: string;
  decimals: number;
  symbol: string;
}): JSX.Element {
  const navigate = useNavigate();

  // Newest first by lock time — there's no dedicated settled-at timestamp on
  // chain, and lockedAt is monotonic per trade.
  const sorted = useMemo(
    () => [...trades].sort((a, b) => Number(b.lockedAt - a.lockedAt)),
    [trades],
  );

  // Small status breakdown for the header subtitle, e.g. "3 settled · 1 refunded".
  const breakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of trades) {
      const label = tradeStateLabel(t.state);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([label, n]) => `${n} ${label.toLowerCase()}`)
      .join(" · ");
  }, [trades]);

  if (loading && trades.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <EmptyState
        compact
        icon={CheckCircle2}
        title="No completed trades"
        description="Settled, refunded, and cancelled trades appear here once escrow closes."
      />
    );
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-3 mb-5">
        <div>
          <h2 className="text-stone-100 text-base font-medium">
            Completed trades
          </h2>
          <p className="text-stone-500 text-xs mt-1">
            {breakdown || "Trades where escrow has closed."}
          </p>
        </div>
        <span className="text-[10px] uppercase tracking-wider text-stone-500 px-2 py-1 rounded-md border border-stone-800">
          {trades.length} done
        </span>
      </div>

      {/* Desktop: table */}
      <div className="hidden lg:block">
        <CompletedTradesTable
          trades={sorted}
          evmAddress={evmAddress}
          decimals={decimals}
          symbol={symbol}
        />
      </div>

      {/* Mobile/tablet: card grid */}
      <div className="lg:hidden grid grid-cols-1 sm:grid-cols-2 gap-3">
        {sorted.map((trade) => (
          <CompactTradeCard
            key={String(trade.id)}
            trade={trade}
            evmAddress={evmAddress}
            decimals={decimals}
            symbol={symbol}
            onClick={() =>
              navigate(`/trades/${trade.id.toString()}`, { state: { trade } })
            }
          />
        ))}
      </div>
    </div>
  );
}

// ─── Desktop completed-trades table — outcome filters, kbd nav, sortable cols ─

function CompletedTradesTable({
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
  const [filter, setFilter] = useState<OutcomeFilter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "when",
    dir: "asc",
  });

  const counts = useMemo(() => {
    return {
      all: trades.length,
      settled: trades.filter((t) => t.state === 2).length,
      refunded: trades.filter((t) => t.state === 3).length,
      cancelled: trades.filter((t) => t.state === 4).length,
    };
  }, [trades]);

  const filtered = useMemo(() => {
    const matchFilter = (t: ContractTrade) => {
      if (filter === "all") return true;
      if (filter === "settled") return t.state === 2;
      if (filter === "refunded") return t.state === 3;
      if (filter === "cancelled") return t.state === 4;
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

  return (
    <div>
      {/* Toolbar — outcome filter chips + keyboard hints */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1">
          <FilterChip
            label="All"
            count={counts.all}
            active={filter === "all"}
            onClick={() => setFilter("all")}
          />
          {counts.settled > 0 && (
            <FilterChip
              label="Settled"
              count={counts.settled}
              active={filter === "settled"}
              onClick={() => setFilter("settled")}
            />
          )}
          {counts.refunded > 0 && (
            <FilterChip
              label="Refunded"
              count={counts.refunded}
              active={filter === "refunded"}
              onClick={() => setFilter("refunded")}
            />
          )}
          {counts.cancelled > 0 && (
            <FilterChip
              label="Cancelled"
              count={counts.cancelled}
              active={filter === "cancelled"}
              onClick={() => setFilter("cancelled")}
            />
          )}
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
        {filtered.map((trade, i) => (
          <TradeTableRow
            key={String(trade.id)}
            trade={trade}
            evmAddress={evmAddress}
            decimals={decimals}
            symbol={symbol}
            status={completedStatus(trade.state)}
            isFirst={i === 0}
            isFocused={i === focused}
            onHover={() => setFocused(i)}
          />
        ))}
      </div>

      <p className="mt-3 text-[11px] text-stone-600">
        Showing {filtered.length} of {trades.length} completed trades.
      </p>
    </div>
  );
}

/** Terminal-state status pill: Settled (green) · Refunded (amber) · Cancelled. */
function completedStatus(state: number): RowStatus {
  switch (state) {
    case 2:
      return { tone: "emerald", label: "Settled" };
    case 3:
      return { tone: "amber", label: "Refunded" };
    case 4:
      return { tone: "stone", label: "Cancelled" };
    case 5:
      return { tone: "sky", label: "Insured" };
    default:
      return { tone: "stone", label: tradeStateLabel(state) };
  }
}
