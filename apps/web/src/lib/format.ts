export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function isZeroAddress(addr: string | null | undefined): boolean {
  return !addr || addr.toLowerCase() === ZERO_ADDRESS;
}

export function shortenAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDay(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function fmtDateTime(ms: number): string {
  return `${fmtDay(ms)} · ${fmtTime(ms)}`;
}

export function fmtShortDateTime(ms: number): string {
  const d = new Date(ms);
  return `${d.toLocaleDateString(undefined, {
    weekday: "short",
  })} · ${d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

const HOUR_MS = 3_600_000;
const MIN_MS = 60_000;
const CONFIRMATION_WINDOW_MS = 24 * HOUR_MS;

export function timeRemaining(lockedAt: bigint): string {
  const remaining =
    Number(lockedAt) * 1000 + CONFIRMATION_WINDOW_MS - Date.now();
  if (remaining <= 0) return "Expired";
  const h = Math.floor(remaining / HOUR_MS);
  const m = Math.floor((remaining % HOUR_MS) / MIN_MS);
  return `${h}h ${m}m`;
}

export function lockedAgo(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < MIN_MS) return "just now";
  if (diff < HOUR_MS) return `${Math.floor(diff / MIN_MS)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / HOUR_MS)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

/** "HH:mm" → minutes-since-midnight (used by availability schedule overlap math). */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Fiat currency code → display symbol. V1 supports USD only; falls back to "<CODE> ". */
export function fiatSymbol(currency: string): string {
  const c = currency.toUpperCase();
  if (c === "USD") return "$";
  return c + " ";
}

/** Format a Date for an `<input type="datetime-local">` value (local time, no timezone). */
export function toDateTimeLocalString(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Format a bigint amount with two decimal places. */
export function formatAmount(amount: bigint, decimals: number): string {
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const frac = amount % divisor;
  if (frac === 0n) return `${whole}.00`;
  const fracStr = frac.toString().padStart(decimals, "0").slice(0, 2);
  return `${whole}.${fracStr}`;
}
