// Shared presentational primitives for the redesigned Create flows
// (Create Offer + Register Agent). Scoped to these two forms only — amber is the
// primary accent, emerald marks "via agent" / insured semantics. No global
// styles are touched; everything here is inline Tailwind on DM Sans/DM Serif.

import type { LucideIcon } from "lucide-react";
import { Check } from "lucide-react";
import type { KeyboardEvent, ReactElement, ReactNode } from "react";
import { cloneElement, isValidElement, useId } from "react";

import { groupSchedule } from "../../lib/agent-hours";
import type { WeeklySchedule } from "../common/WorkingHoursPicker";

export type Accent = "amber" | "emerald";

// ─── Section header — icon badge + title/desc + big serif index number ──────
interface SectionHeadProps {
  n: string;
  title: string;
  desc?: string;
  icon: LucideIcon;
}

export function SectionHead({
  n,
  title,
  desc,
  icon: Icon,
}: SectionHeadProps): JSX.Element {
  return (
    <div className="flex items-start gap-3.5">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-stone-800 bg-stone-900/60 text-stone-500">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold leading-tight text-stone-100">
          {title}
        </h3>
        {desc && <p className="mt-0.5 text-xs text-stone-500">{desc}</p>}
      </div>
      <span className="ml-auto select-none font-serif text-2xl leading-none text-stone-800">
        {n}
      </span>
    </div>
  );
}

// ─── Labelled field wrapper ─────────────────────────────────────────────────
interface FieldProps {
  label?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({
  label,
  hint,
  required,
  children,
  className = "",
}: FieldProps): JSX.Element {
  // Associate the visible label with the control so screen readers announce it
  // and clicking the label focuses the input. The single child is always a
  // TokenInput, which forwards the injected `id` onto its <input>.
  const id = useId();
  const control =
    label !== undefined && isValidElement(children)
      ? cloneElement(children as ReactElement<{ id?: string }>, { id })
      : children;
  return (
    <div className={className}>
      {label && (
        <label
          htmlFor={id}
          className="mb-2 flex items-center gap-1 text-[10.5px] font-medium uppercase tracking-[0.13em] text-stone-500"
        >
          {label}
          {required && <span className="text-amber-400/80">*</span>}
        </label>
      )}
      {control}
      {hint && (
        <p className="mt-2 text-xs leading-relaxed text-stone-500">{hint}</p>
      )}
    </div>
  );
}

// ─── Text / number input with optional inline prefix + suffix tokens ────────
interface TokenInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  mono?: boolean;
  accent?: Accent;
  inputMode?: "numeric" | "decimal" | "text";
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  maxLength?: number;
  ariaLabel?: string;
}

export function TokenInput({
  id,
  value,
  onChange,
  placeholder,
  prefix,
  suffix,
  mono = false,
  accent = "amber",
  inputMode = "text",
  onKeyDown,
  maxLength,
  ariaLabel,
}: TokenInputProps): JSX.Element {
  const ring =
    accent === "emerald"
      ? "focus-within:border-emerald-400/60 focus-within:ring-emerald-400/15"
      : "focus-within:border-amber-400/60 focus-within:ring-amber-400/15";
  return (
    <div
      className={`group flex items-center gap-2.5 rounded-xl border border-stone-800 bg-stone-950/60 px-3.5 transition-all focus-within:bg-stone-950 focus-within:ring-4 ${ring}`}
    >
      {prefix && (
        <span className="shrink-0 font-mono text-xs font-medium uppercase tracking-wide text-stone-500">
          {prefix}
        </span>
      )}
      <input
        id={id}
        type="text"
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        maxLength={maxLength}
        aria-label={ariaLabel}
        className={`min-w-0 flex-1 bg-transparent py-3 text-[15px] text-stone-100 placeholder:text-stone-600 focus:outline-none ${
          mono ? "font-mono tabular-nums" : ""
        }`}
      />
      {suffix && (
        <span className="shrink-0 text-xs font-medium text-stone-500">
          {suffix}
        </span>
      )}
    </div>
  );
}

// ─── Segmented control with sliding thumb ───────────────────────────────────
interface SegmentedOption {
  value: string;
  label: string;
  sub?: string;
}

interface SegmentedProps {
  options: SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  accent?: "light" | Accent;
  size?: "sm" | "md";
}

export function Segmented({
  options,
  value,
  onChange,
  accent = "light",
  size = "md",
}: SegmentedProps): JSX.Element {
  const pad = size === "sm" ? "py-2 text-[13px]" : "py-3 text-sm";
  const n = options.length;
  const idx = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const thumb =
    accent === "amber"
      ? "bg-amber-400"
      : accent === "emerald"
        ? "bg-emerald-400"
        : "bg-stone-100";
  return (
    <div
      className="relative grid rounded-2xl border border-stone-800 bg-stone-900/50 p-1"
      style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}
    >
      <span
        className={`absolute bottom-1 top-1 rounded-xl ${thumb} shadow-lg shadow-black/30 transition-[left] duration-300`}
        style={{
          left: `calc(${idx} * (100% - 8px) / ${n} + 4px)`,
          width: `calc((100% - 8px) / ${n})`,
        }}
      />
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`relative z-10 flex flex-col items-center justify-center gap-0.5 rounded-xl px-3 font-medium leading-tight transition-colors ${pad} ${
              active ? "text-stone-950" : "text-stone-400 hover:text-stone-200"
            }`}
          >
            <span>{o.label}</span>
            {o.sub && (
              <span
                className={`whitespace-nowrap text-[11px] font-normal ${
                  active ? "text-stone-700" : "text-stone-500"
                }`}
              >
                {o.sub}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Method choice card (Via Agent / Direct) ────────────────────────────────
interface MethodCardProps {
  icon: LucideIcon;
  title: string;
  sub: string;
  selected: boolean;
  tone: Accent;
  onClick: () => void;
}

export function MethodCard({
  icon: Icon,
  title,
  sub,
  selected,
  tone,
  onClick,
}: MethodCardProps): JSX.Element {
  const ring = selected
    ? tone === "emerald"
      ? "border-emerald-500/60 bg-emerald-500/[0.07] ring-1 ring-emerald-500/30"
      : "border-amber-500/60 bg-amber-500/[0.07] ring-1 ring-amber-500/30"
    : "border-stone-800 bg-stone-900/30 hover:border-stone-600 hover:bg-stone-900/70";
  const iconC = selected
    ? tone === "emerald"
      ? "text-emerald-400"
      : "text-amber-400"
    : "text-stone-500";
  const iconBox = selected
    ? tone === "emerald"
      ? "border-emerald-500/40 bg-emerald-500/10"
      : "border-amber-500/40 bg-amber-500/10"
    : "border-stone-800 bg-stone-950/50";
  const checkBox = selected
    ? tone === "emerald"
      ? "border-emerald-400 bg-emerald-400 text-stone-950"
      : "border-amber-400 bg-amber-400 text-stone-950"
    : "border-stone-700";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-3.5 rounded-2xl border p-4 text-left transition-all ${ring}`}
    >
      <span
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border ${iconBox} ${iconC}`}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="flex-1">
        <span className="block text-[15px] font-semibold text-stone-100">
          {title}
        </span>
        <span className="block text-xs text-stone-500">{sub}</span>
      </span>
      <span
        className={`grid h-6 w-6 place-items-center rounded-full border transition-colors ${checkBox}`}
      >
        {selected && <Check className="h-3.5 w-3.5" />}
      </span>
    </button>
  );
}

// ─── "Live preview" pulse dot ───────────────────────────────────────────────
export function LivePulse(): JSX.Element {
  return (
    <span className="relative flex h-2 w-2">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
    </span>
  );
}

// ─── Availability strip (shared by both preview cards) ──────────────────────
const DAY_KEYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"] as const;

/** "5 days · 09:00–17:00", or "No days selected". */
export function scheduleSummary(schedule: WeeklySchedule): string {
  const count = Object.keys(schedule).length;
  if (count === 0) return "No days selected";
  const groups = groupSchedule(schedule);
  const hours =
    groups.length === 1 && groups[0]
      ? `${groups[0].open}–${groups[0].close}`
      : "varied hours";
  return `${count} ${count === 1 ? "day" : "days"} · ${hours}`;
}

interface AvailabilityStripProps {
  schedule: WeeklySchedule;
  accent?: Accent;
  label?: string;
}

export function AvailabilityStrip({
  schedule,
  accent = "amber",
  label = "Availability",
}: AvailabilityStripProps): JSX.Element {
  const on =
    accent === "emerald"
      ? "bg-emerald-400/20 text-emerald-300"
      : "bg-amber-400/20 text-amber-300";
  return (
    <div>
      <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-stone-500">
        {label}
      </div>
      <div className="flex gap-1">
        {DAY_KEYS.map((key, i) => {
          const active = key in schedule;
          return (
            <span
              key={key}
              className={`grid h-7 flex-1 place-items-center rounded-md text-[10px] font-medium ${
                active ? on : "bg-stone-900/60 text-stone-600"
              }`}
            >
              {DAY_LABELS[i]}
            </span>
          );
        })}
      </div>
      <div className="mt-2 font-mono text-[11px] text-stone-500">
        {scheduleSummary(schedule)}
      </div>
    </div>
  );
}
