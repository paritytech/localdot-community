/**
 * Shared presentational primitives for agent profile surfaces — used by both
 * the public agent detail page (AgentDetail) and the owner's "My Agency" tab
 * so the two stay visually identical.
 */

// ─── Hero avatar — deterministic gradient from the wallet + name initial ────

export function AgentAvatar({
  name,
  wallet,
  size = "lg",
}: {
  name: string;
  wallet: string;
  size?: "sm" | "lg";
}): JSX.Element {
  // Address-derived aliases ("0x12ab…cd") would all collapse to "0"; show the
  // first two hex chars instead. Real agent names use their first letter.
  const trimmed = name.trim();
  const initial = /^0x/i.test(trimmed)
    ? trimmed.slice(2, 4).toUpperCase()
    : (trimmed[0] ?? "?").toUpperCase();
  let hue = 0;
  for (let i = 2; i < Math.min(wallet.length, 14); i++) {
    hue = (hue * 31 + wallet.charCodeAt(i)) % 360;
  }
  const dim = size === "sm" ? "w-9 h-9 rounded-lg" : "w-16 h-16 rounded-2xl";
  const text = size === "sm" ? "text-sm" : "text-2xl";
  return (
    <div
      className={`${dim} flex items-center justify-center border border-stone-700 shrink-0`}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 40% 32%), hsl(${(hue + 40) % 360} 42% 22%))`,
      }}
      aria-hidden
    >
      <span className={`font-serif ${text} text-stone-50`}>{initial}</span>
    </div>
  );
}

// ─── Status pill ────────────────────────────────────────────────────────────

export function StatusPill({
  isOpen,
  label,
}: {
  isOpen: boolean;
  label: string;
}): JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${
        isOpen
          ? "bg-green-500/10 text-green-400 border border-green-500/20"
          : "bg-stone-800 text-stone-400 border border-stone-700"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${isOpen ? "bg-green-400" : "bg-stone-500"}`}
      />
      {label}
    </span>
  );
}

// ─── Stat tile ──────────────────────────────────────────────────────────────

export function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  tone = "stone",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub: string;
  tone?: "stone" | "green";
}): JSX.Element {
  return (
    <div className="rounded-2xl border border-stone-800 bg-stone-900/40 p-4">
      <div className="flex items-center gap-1.5 text-stone-500">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[10px] uppercase tracking-[0.12em] font-medium">
          {label}
        </span>
      </div>
      <p
        className={`mono text-xl font-medium mt-2 tabular-nums ${
          tone === "green" ? "text-green-300" : "text-stone-100"
        }`}
      >
        {value}
      </p>
      <p className="text-[11px] text-stone-500 mt-0.5">{sub}</p>
    </div>
  );
}
