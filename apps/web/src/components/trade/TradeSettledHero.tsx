/**
 * Shared "this trade is finished" hero, used by both DirectTradeDetail and
 * AgentTradeDetail once a trade reaches a terminal state (COMPLETED / REFUNDED
 * / CANCELLED). A finished trade has no action left — no scan, no QR, no
 * coordination — so the detail pages swap their live surface for this focused,
 * status-forward summary: a big status badge, the amount, who it was with, and
 * a small meta grid. Tones match the Completed-trades table (settled = green,
 * refunded = amber, cancelled = stone).
 */

import type { LucideIcon } from "lucide-react";
import { Check, RotateCcw, XCircle } from "lucide-react";

type Tone = "emerald" | "amber" | "stone";

const TONE: Record<
  Tone,
  {
    wrap: string;
    glow: string;
    iconWrap: string;
    icon: string;
    eyebrow: string;
  }
> = {
  emerald: {
    wrap: "border-emerald-500/25 from-emerald-500/[0.08]",
    glow: "bg-emerald-500/20",
    iconWrap: "border-emerald-400/40 bg-emerald-500/15",
    icon: "text-emerald-300",
    eyebrow: "text-emerald-300/80",
  },
  amber: {
    wrap: "border-amber-500/25 from-amber-500/[0.08]",
    glow: "bg-amber-500/20",
    iconWrap: "border-amber-400/40 bg-amber-500/15",
    icon: "text-amber-300",
    eyebrow: "text-amber-300/80",
  },
  stone: {
    wrap: "border-stone-700 from-stone-500/[0.06]",
    glow: "bg-stone-500/10",
    iconWrap: "border-stone-600 bg-stone-800",
    icon: "text-stone-300",
    eyebrow: "text-stone-400",
  },
};

export interface TerminalDescriptor {
  label: string; // "Settled" | "Refunded" | "Cancelled"
  eyebrow: string; // "Trade settled" …
  tone: Tone;
  Icon: LucideIcon;
}

/** Maps a terminal on-chain state to its label, tone and icon. */
export function terminalStatusFor(state: number): TerminalDescriptor {
  switch (state) {
    case 2:
      return {
        label: "Settled",
        eyebrow: "Trade settled",
        tone: "emerald",
        Icon: Check,
      };
    case 3:
      return {
        label: "Refunded",
        eyebrow: "Trade refunded",
        tone: "amber",
        Icon: RotateCcw,
      };
    case 4:
      return {
        label: "Cancelled",
        eyebrow: "Trade cancelled",
        tone: "stone",
        Icon: XCircle,
      };
    default:
      return {
        label: "Closed",
        eyebrow: "Trade closed",
        tone: "stone",
        Icon: XCircle,
      };
  }
}

export interface HeroMeta {
  label: string;
  value: string;
  sub?: string;
}

export function TradeSettledHero({
  state,
  amount,
  symbol,
  subtitle,
  meta,
}: {
  state: number;
  amount: string;
  symbol: string;
  subtitle: React.ReactNode;
  /** Exactly three columns to fill the meta grid. */
  meta: [HeroMeta, HeroMeta, HeroMeta];
}): JSX.Element {
  const d = terminalStatusFor(state);
  const t = TONE[d.tone];
  const Icon = d.Icon;
  return (
    <div
      className={`relative overflow-hidden rounded-3xl border bg-gradient-to-b to-stone-900/30 px-6 py-9 lg:px-10 ${t.wrap}`}
    >
      <div
        aria-hidden
        className={`pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 h-44 w-44 rounded-full blur-3xl ${t.glow}`}
      />
      <div className="relative flex flex-col items-center text-center">
        <span
          className={`flex h-14 w-14 items-center justify-center rounded-full border ${t.iconWrap}`}
        >
          <Icon className={`h-7 w-7 ${t.icon}`} strokeWidth={3} />
        </span>
        <p
          className={`mt-4 text-[11px] uppercase tracking-[0.18em] font-medium ${t.eyebrow}`}
        >
          {d.eyebrow}
        </p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="mono text-5xl lg:text-6xl text-stone-50 font-medium leading-none tracking-tight">
            {amount}
          </span>
          <span className="text-stone-400 text-2xl">{symbol}</span>
        </div>
        <p className="mt-3 text-sm text-stone-400">{subtitle}</p>
      </div>

      <div className="relative mt-7 grid grid-cols-3 overflow-hidden rounded-2xl border border-stone-800/80 bg-stone-950/40 divide-x divide-stone-800">
        {meta.map((m) => (
          <div key={m.label} className="px-4 py-3.5 min-w-0">
            <p className="text-[10px] uppercase tracking-[0.16em] text-stone-500 font-medium">
              {m.label}
            </p>
            <p className="mono text-stone-100 text-sm mt-1.5 truncate">
              {m.value}
            </p>
            {m.sub && (
              <p className="text-stone-500 text-[11px] mt-0.5 truncate">
                {m.sub}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
