/**
 * Tiny zero-dependency ANSI styling for the deploy CLI.
 *
 * Colour auto-disables when stdout isn't a TTY, when NO_COLOR is set, or under
 * TERM=dumb, so piped / redirected output stays clean and copy-pasteable. No
 * external dependency on purpose — the deploy flow bootstraps from a bare repo.
 */

const enabled =
  !!process.stdout.isTTY &&
  !process.env.NO_COLOR &&
  process.env.TERM !== "dumb";

type Wrap = (s: string) => string;
const RESET = "\x1b[0m";
const code = (open: string): Wrap =>
  enabled ? (s) => `${open}${s}${RESET}` : (s) => s;

export const bold = code("\x1b[1m");
export const dim = code("\x1b[2m");
export const red = code("\x1b[31m");
export const green = code("\x1b[32m");
export const yellow = code("\x1b[33m");
export const cyan = code("\x1b[36m");
export const gray = code("\x1b[90m");
// Polkadot-ish pink via 256-colour (widely supported, incl. over SSH).
export const pink = code("\x1b[38;5;198m");

const HR = "─";
function width(): number {
  return Math.max(24, Math.min(process.stdout.columns ?? 80, 64));
}

/** Pink rule + bold title (+ optional dim subtitle), framed top and bottom. */
export function banner(title: string, subtitle?: string): void {
  const bar = pink(HR.repeat(width()));
  console.log(`\n${bar}`);
  console.log(` ${pink(bold(title))}`);
  if (subtitle) console.log(` ${dim(subtitle)}`);
  console.log(bar);
}

/** Section header, e.g. "▸ Wallet". */
export function section(title: string): void {
  console.log(`\n${pink("▸")} ${bold(title)}`);
}

/** An in-progress action line. */
export function step(msg: string): void {
  console.log(`${cyan("→")} ${msg}`);
}

export function success(msg: string): void {
  console.log(`${green("✓")} ${msg}`);
}

export function warn(msg: string): void {
  console.log(`${yellow("⚠")} ${msg}`);
}

export function fail(msg: string): void {
  console.error(`${red("✗")} ${msg}`);
}

/** Indented, dim secondary detail. */
export function info(msg: string): void {
  console.log(`  ${dim(msg)}`);
}

/** A numbered menu choice, e.g. "  1) Generate a new wallet". */
export function choice(n: number | string, label: string): void {
  console.log(`  ${pink(`${n})`)} ${label}`);
}

/** Auto-aligned key/value block: dim labels, cyan values. */
export function kvBlock(pairs: Array<[string, string]>): void {
  const w = Math.max(0, ...pairs.map(([k]) => k.length));
  for (const [k, v] of pairs) {
    console.log(`  ${dim(`${k}:`.padEnd(w + 2))}${cyan(v)}`);
  }
}

/** Build a coloured readline prompt string ("? <question>"). */
export function ask(question: string): string {
  return `${cyan("?")} ${question}`;
}

const NOTICE_COLORS = { yellow, green, pink, cyan, red } as const;

/**
 * A framed notice for things that should stand out — the generated mnemonic
 * (yellow) or the final success summary (green). `lines` are printed verbatim
 * (already-styled), indented under the title.
 */
export function notice(
  title: string,
  lines: string[],
  color: keyof typeof NOTICE_COLORS = "yellow",
): void {
  const c = NOTICE_COLORS[color];
  const bar = c(HR.repeat(width()));
  console.log(`\n${bar}`);
  console.log(` ${c(bold(title))}`);
  for (const line of lines) console.log(line ? `   ${line}` : "");
  console.log(`${bar}`);
}
