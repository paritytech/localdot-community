import type { LucideIcon } from "lucide-react";

export type PillTone =
  | "blue"
  | "amber"
  | "emerald"
  | "stone"
  | "rose"
  | "purple"
  | "sky";

const TONE_DOT: Record<PillTone, string> = {
  blue: "bg-blue-400",
  amber: "bg-amber-400",
  emerald: "bg-emerald-400",
  stone: "bg-stone-500",
  rose: "bg-rose-400",
  purple: "bg-purple-400",
  sky: "bg-sky-400",
};

const TONE_TEXT: Record<PillTone, string> = {
  blue: "text-blue-200",
  amber: "text-amber-200",
  emerald: "text-emerald-200",
  stone: "text-stone-400",
  rose: "text-rose-200",
  purple: "text-purple-300",
  sky: "text-sky-200",
};

const TONE_BORDER_BG: Record<PillTone, string> = {
  blue: "border-blue-500/30 bg-blue-500/5",
  amber: "border-amber-500/30 bg-amber-500/5",
  emerald: "border-emerald-500/30 bg-emerald-500/5",
  stone: "border-stone-800 bg-stone-900/40 text-stone-400",
  rose: "border-rose-500/30 bg-rose-500/5",
  purple: "border-purple-500/40 bg-purple-500/5",
  sky: "border-sky-500/30 bg-sky-500/5",
};

/**
 * Tone-driven status indicator. Two display modes:
 *   - "dot" (default): tiny colored dot + label, no border. For dense tables.
 *   - "badge": uppercase chip with border, optional Icon. For type/role tags.
 */
export function Pill({
  tone,
  label,
  variant = "dot",
  icon: Icon,
  className = "",
}: {
  tone: PillTone;
  label: string;
  variant?: "dot" | "badge";
  icon?: LucideIcon;
  className?: string;
}): JSX.Element {
  if (variant === "badge") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] uppercase tracking-[0.14em] font-medium border ${TONE_BORDER_BG[tone]} ${TONE_TEXT[tone]} ${className}`}
      >
        {Icon && <Icon className="w-3 h-3" />}
        {label}
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[tone]}`} />
      <span className={TONE_TEXT[tone]}>{label}</span>
    </span>
  );
}
