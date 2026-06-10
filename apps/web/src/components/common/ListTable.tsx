/**
 * Generic chrome for the profile's sortable/filterable list tables (Active
 * trades, Completed trades, My Offers). These primitives carry no domain
 * meaning — each tab supplies its own columns, filters and rows and reuses
 * these so the three tables look and behave identically (filter chips,
 * sortable headers, ↑↓/↵ keyboard navigation, focus styling).
 */

import { useEffect, useState } from "react";

export type SortDir = "asc" | "desc";

// ─── Filter chip ──────────────────────────────────────────────────────────

export function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors ${
        active
          ? "bg-stone-100 text-stone-950"
          : "text-stone-400 hover:bg-stone-900 hover:text-stone-200"
      }`}
    >
      {label}
      <span
        className={`mono text-[10px] ${active ? "text-stone-500" : "text-stone-600"}`}
      >
        {count}
      </span>
    </button>
  );
}

// ─── Keyboard hint key ──────────────────────────────────────────────────────

export function Kbd({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <kbd
      className={`rounded border border-stone-800 bg-stone-900 px-1.5 py-0.5 mono text-[10px] text-stone-400 ${className}`}
    >
      {children}
    </kbd>
  );
}

/** The "↑↓ navigate ↵ open" hint shown on the right of a table toolbar. */
export function KeyboardHints(): JSX.Element {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-stone-500">
      <Kbd>↑↓</Kbd>
      <span>navigate</span>
      <Kbd className="ml-2">↵</Kbd>
      <span>open</span>
    </div>
  );
}

// ─── Sortable header cell ───────────────────────────────────────────────────

export function SortableHeader({
  label,
  active,
  dir,
  onSort,
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onSort: () => void;
}): JSX.Element {
  return (
    <button
      onClick={onSort}
      className={`flex items-center gap-1 text-[10px] font-medium uppercase tracking-[0.1em] ${
        active ? "text-stone-300" : "text-stone-500 hover:text-stone-300"
      }`}
    >
      {label}
      {active && (
        <svg
          className={`h-2.5 w-2.5 transition-transform ${dir === "desc" ? "rotate-180" : ""}`}
          viewBox="0 0 12 12"
          fill="none"
        >
          <path
            d="M3 5l3 3 3-3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

// ─── Keyboard navigation hook ───────────────────────────────────────────────

/**
 * ↑/↓ move the focused row, ↵ activates it. Generic over the row item — the
 * caller decides what "activate" means (usually navigate to a detail page).
 * Returns the focused index and a setter (for mouse hover).
 */
export function useRowKeyboardNav<T>(
  items: T[],
  onActivate: (item: T) => void,
): readonly [number, (index: number) => void] {
  const [focused, setFocused] = useState(0);

  useEffect(() => {
    setFocused((f) => Math.min(f, Math.max(0, items.length - 1)));
  }, [items.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null;
      if (
        tgt &&
        (tgt.tagName === "INPUT" ||
          tgt.tagName === "TEXTAREA" ||
          tgt.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocused((f) => Math.min(items.length - 1, f + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocused((f) => Math.max(0, f - 1));
      } else if (e.key === "Enter" && items[focused] !== undefined) {
        onActivate(items[focused]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, focused, onActivate]);

  return [focused, setFocused] as const;
}
