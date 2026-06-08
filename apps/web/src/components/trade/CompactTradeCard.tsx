import { ChevronRight } from "lucide-react";

import { shortenAddress, ZERO_ADDRESS } from "../../lib/format";
import { Pill } from "../common/Pill";

type Role = "buyer" | "provider";

interface MinimalContractTrade {
  id: bigint;
  /** 0=Locked 1=Released 2=Completed 3=Refunded 4=Cancelled 5=Insured */
  state: number;
  locker: string;
  counterparty: string;
  agent: string;
  amount: bigint;
}

interface CompactTradeCardProps {
  trade: MinimalContractTrade;
  /** Caller's EVM address — controls labels ("Buying from" / "Selling to") */
  evmAddress: string;
  /** Token decimals for amount formatting */
  decimals: number;
  /** Token symbol (e.g. "DOT") */
  symbol: string;
  /** Mock fiat USD value (real impl: from offer.fiatPrice * amount) */
  fiatAmount?: number;
  fiatCurrency?: string;
  /** Click on card body → open detail */
  onClick: () => void;
  /**
   * Small inline footer actions rendered at the bottom-right of the card
   * (Cancel / Claim refund). Each click stops propagation so the parent
   * card click doesn't fire. The primary "next-step" action lives on the
   * detail page that opens via the card-body click.
   */
  footerActions?: {
    key: string;
    label: string;
    tone?: "neutral" | "danger" | "warn";
    disabled?: boolean;
    onClick: () => void;
  }[];
}

/**
 * One unified card shape for both direct and agent trades. Click body → detail.
 *
 * - Direct (no agent): shows time + location + dual live status pills
 * - Agent: shows "via Agent · Tara", trade-state badge, plus an inline
 *   primary action button (e.g. "Scan buyer QR")
 */
export function CompactTradeCard({
  trade,
  evmAddress,
  decimals,
  symbol,
  fiatAmount,
  fiatCurrency = "USD",
  onClick,
  footerActions,
}: CompactTradeCardProps): JSX.Element {
  const me = evmAddress.toLowerCase();
  const isLocker = trade.locker.toLowerCase() === me;
  const isCounterparty = trade.counterparty.toLowerCase() === me;
  const hasAgent = trade.agent.toLowerCase() !== ZERO_ADDRESS;

  const myRole: Role = isLocker ? "provider" : "buyer";

  const counterpartyAddr = isCounterparty ? trade.locker : trade.counterparty;

  const amountStr = formatTokenAmountTrimmed(trade.amount, decimals);

  // Use a div with onClick (not <button>) so we can nest the primary action
  // <button> inside without producing invalid markup. Keep keyboard support
  // via role="button" + tabIndex + onKeyDown.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="w-full text-left rounded-2xl border border-stone-800 bg-stone-900/60 hover:bg-stone-900 hover:border-stone-700 transition-colors p-4 group relative cursor-pointer focus:outline-none focus:border-stone-700"
    >
      {/* Top row: amount + counterparty + chevron */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <span className="mono text-lg text-stone-100 font-medium">
              {amountStr}
            </span>
            <span className="text-stone-500 text-xs">{symbol}</span>
            {fiatAmount !== undefined && (
              <span className="text-stone-600 text-xs ml-1">
                · ${fiatAmount} {fiatCurrency}
              </span>
            )}
            <KindBadge hasAgent={hasAgent} />
          </div>
          <p className="text-xs text-stone-500 mt-0.5">
            {myRole === "buyer" ? "Buying from" : "Selling to"}{" "}
            <span className="mono text-stone-300">
              {shortenAddress(counterpartyAddr)}
            </span>
            <span className="text-stone-600 ml-1.5">
              · #{trade.id.toString()}
            </span>
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-stone-600 group-hover:text-stone-400 mt-0.5 shrink-0" />
      </div>

      {/* Body: direct vs agent — meet-up details (time/place/live status)
          will arrive via Statement Store + Bulletin Chain; for now show
          only what we can derive from the on-chain trade. */}
      {hasAgent ? <AgentBody trade={trade} /> : <DirectBody trade={trade} />}

      {/* Footer actions — small inline buttons in bottom-right
          (Cancel / Claim refund). Each click stops propagation so the
          parent card click doesn't fire on top of it. */}
      {footerActions && footerActions.length > 0 && (
        <div className="mt-3 pt-3 border-t border-stone-800/60 flex items-center justify-end gap-1.5">
          {footerActions.map((action) => (
            <button
              key={action.key}
              disabled={action.disabled}
              onClick={(e) => {
                e.stopPropagation();
                action.onClick();
              }}
              className={
                "text-[11px] px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed " +
                (action.tone === "danger"
                  ? "border border-red-700/30 text-red-300/90 hover:text-red-300 hover:border-red-500/50 hover:bg-red-900/15"
                  : action.tone === "warn"
                    ? "border border-amber-700/40 text-amber-400 hover:bg-amber-900/20"
                    : "border border-stone-800 text-stone-400 hover:text-stone-200 hover:border-stone-700 hover:bg-stone-800/50")
              }
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function KindBadge({ hasAgent }: { hasAgent: boolean }): JSX.Element {
  const label = hasAgent ? "Via agent" : "Direct";
  return <Pill variant="badge" tone="stone" label={label} className="ml-1" />;
}

function DirectBody({ trade }: { trade: MinimalContractTrade }): JSX.Element {
  if (trade.state >= 2) {
    return <p className="text-xs text-stone-500">Settled · view receipt</p>;
  }
  return (
    <div className="flex items-center gap-2 text-xs text-stone-400">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
      <span>Meeting not set yet — open to coordinate</span>
    </div>
  );
}

function AgentBody({ trade }: { trade: MinimalContractTrade }): JSX.Element {
  const stateLabel = (() => {
    switch (trade.state) {
      case 0:
        return {
          text: "Locked · awaiting cash exchange",
          color: "text-amber-300",
          dot: "bg-amber-400",
        };
      case 1:
        return {
          text: "Released · provider to pick up cash",
          color: "text-blue-300",
          dot: "bg-blue-400",
        };
      case 2:
        return {
          text: "Completed",
          color: "text-green-300",
          dot: "bg-green-400",
        };
      default:
        return {
          text: "Settled",
          color: "text-stone-400",
          dot: "bg-stone-700",
        };
    }
  })();

  const hint = (() => {
    if (trade.state === 0) return "Show your QR to the agent";
    if (trade.state === 1) return "Pickup cash at the agent";
    return "Trade settled";
  })();

  return (
    <>
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${stateLabel.dot}`} />
        <span className={`text-xs font-medium ${stateLabel.color}`}>
          {stateLabel.text}
        </span>
      </div>
      <p className="text-xs text-stone-400 mt-1.5">{hint}</p>
    </>
  );
}

/**
 * Same idea as `formatAmount` but trims trailing `.00` for whole numbers
 * and caps at 2 fractional digits otherwise.
 */
function formatTokenAmountTrimmed(amount: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const frac = amount % divisor;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, 2);
  return `${whole}.${fracStr}`;
}
