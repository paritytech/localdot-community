/**
 * Trade-specific chrome for the desktop trade tables (Active + Completed
 * profile tabs). The generic primitives (filter chips, sortable headers,
 * keyboard nav) live in ../common/ListTable and are re-exported here so the
 * trade tabs keep a single import site; this module adds the trade column
 * layout, the Direct/Via-agent badge, and the trade row + header.
 */

import { formatUnits } from "ethers";
import { ChevronRight, Clock, Link2, Users } from "lucide-react";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

import type { ContractTrade } from "../../hooks/useEscrow";
import {
  fmtDay,
  fmtTime,
  lockedAgo,
  shortenAddress,
  ZERO_ADDRESS,
} from "../../lib/format";
import {
  FilterChip,
  Kbd,
  KeyboardHints,
  SortableHeader,
  type SortDir,
  useRowKeyboardNav,
} from "../common/ListTable";
import { Pill, type PillTone } from "../common/Pill";

// Re-export the generic primitives so the trade tabs import everything from here.
export { FilterChip, Kbd, KeyboardHints, SortableHeader };
export type { SortDir };

export type SortKey = "amount" | "when" | "status" | null;

/** Grid template shared by the header and body rows so columns line up. */
export const TRADE_TABLE_COLS = "grid-cols-[140px_1fr_120px_200px_180px_28px]";

/** A computed status pill (tone + label) for a single trade row. */
export interface RowStatus {
  tone: PillTone;
  label: string;
}

/** The shared header row: Amount · Counterparty · Type · When · Status. */
export function TradeTableHeader({
  sortKey,
  sortDir,
  onSort,
}: {
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: Exclude<SortKey, null>) => void;
}): JSX.Element {
  return (
    <div
      className={`grid ${TRADE_TABLE_COLS} items-center gap-4 px-5 py-2.5 border-b border-stone-900 bg-stone-950/40`}
    >
      <SortableHeader
        label="Amount"
        active={sortKey === "amount"}
        dir={sortDir}
        onSort={() => onSort("amount")}
      />
      <span className="text-[10px] uppercase tracking-[0.1em] text-stone-500 font-medium">
        Counterparty
      </span>
      <span className="text-[10px] uppercase tracking-[0.1em] text-stone-500 font-medium">
        Type
      </span>
      <SortableHeader
        label="When"
        active={sortKey === "when"}
        dir={sortDir}
        onSort={() => onSort("when")}
      />
      <SortableHeader
        label="Status"
        active={sortKey === "status"}
        dir={sortDir}
        onSort={() => onSort("status")}
      />
      <span />
    </div>
  );
}

// ─── Type badge (Direct / Via agent) ────────────────────────────────────────

export function TypeBadge({ hasAgent }: { hasAgent: boolean }): JSX.Element {
  // Direct = green (peer-to-peer), Via agent = amber.
  const tone: PillTone = hasAgent ? "amber" : "emerald";
  return (
    <Pill
      variant="badge"
      tone={tone}
      label={hasAgent ? "Via agent" : "Direct"}
      icon={hasAgent ? Link2 : Users}
    />
  );
}

// ─── Keyboard navigation ─────────────────────────────────────────────────────

/** ↑/↓ move the focused trade row, ↵ opens it. Returns [focused, setFocused]. */
export function useTradeRowNav(
  trades: ContractTrade[],
): readonly [number, (index: number) => void] {
  const navigate = useNavigate();
  const onActivate = useCallback(
    (t: ContractTrade) => {
      navigate(`/trades/${t.id.toString()}`, { state: { trade: t } });
    },
    [navigate],
  );
  return useRowKeyboardNav(trades, onActivate);
}

// ─── Body row ───────────────────────────────────────────────────────────────

/**
 * One row in a desktop trade table. The status pill is computed by the caller
 * (Active vs Completed derive it differently) and passed in.
 */
export function TradeTableRow({
  trade,
  evmAddress,
  decimals,
  symbol,
  status,
  isFirst,
  isFocused,
  onHover,
}: {
  trade: ContractTrade;
  evmAddress: string;
  decimals: number;
  symbol: string;
  status: RowStatus;
  isFirst: boolean;
  isFocused: boolean;
  onHover: () => void;
}): JSX.Element {
  const navigate = useNavigate();
  const me = evmAddress.toLowerCase();
  const isLocker = trade.locker.toLowerCase() === me;
  const isCounterparty = trade.counterparty.toLowerCase() === me;
  const hasAgent = trade.agent !== ZERO_ADDRESS;

  const amountWhole = parseFloat(formatUnits(trade.amount, decimals));
  const amountStr = amountWhole.toFixed(2);

  const counterpartyAddr = isCounterparty ? trade.locker : trade.counterparty;
  const counterpartyLabel = isLocker ? "Selling to" : "Buying from";

  const lockedAtMs = Number(trade.lockedAt) * 1000;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() =>
        navigate(`/trades/${trade.id.toString()}`, { state: { trade } })
      }
      onMouseEnter={onHover}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(`/trades/${trade.id.toString()}`, { state: { trade } });
        }
      }}
      className={`group relative grid ${TRADE_TABLE_COLS} items-center gap-4 px-5 py-3.5 text-sm cursor-pointer focus:outline-none transition-colors ${
        isFocused ? "bg-stone-900/70" : "hover:bg-stone-900/50"
      } ${isFirst ? "" : "border-t border-stone-900"}`}
    >
      {isFocused && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r bg-stone-100" />
      )}
      <div className="min-w-0">
        <p className="flex items-baseline gap-1">
          <span className="mono text-base text-stone-100 font-medium tabular-nums">
            {amountStr}
          </span>
          <span className="mono text-[10px] uppercase tracking-wider text-stone-500">
            {symbol}
          </span>
        </p>
      </div>
      <div className="min-w-0 pr-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-stone-500">{counterpartyLabel}</span>
          <span className="mono text-stone-100">
            {shortenAddress(counterpartyAddr)}
          </span>
        </div>
        <p className="text-stone-500 text-xs mt-0.5 flex items-center gap-1.5 truncate">
          <span className="mono text-stone-600">#{trade.id.toString()}</span>
        </p>
      </div>
      <div>
        <TypeBadge hasAgent={hasAgent} />
      </div>
      <div className="min-w-0 text-sm">
        <div className="flex items-center gap-1.5 text-stone-200">
          <Clock className="w-3.5 h-3.5 text-stone-500" />
          <span className="mono tabular-nums">{fmtTime(lockedAtMs)}</span>
          <span className="text-stone-600">· {fmtDay(lockedAtMs)}</span>
        </div>
        <p className="mt-0.5 text-xs text-stone-500">
          Locked {lockedAgo(lockedAtMs)}
        </p>
      </div>
      <div>
        <Pill tone={status.tone} label={status.label} />
      </div>
      <div className="flex justify-end">
        <ChevronRight className="w-4 h-4 text-stone-600 transition-transform group-hover:translate-x-0.5 group-hover:text-stone-400" />
      </div>
    </div>
  );
}
