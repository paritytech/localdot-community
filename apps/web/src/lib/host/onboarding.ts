/**
 * Entry-time onboarding.
 *
 * On first entry — after the host handshake completes and the wallet reports
 * "connected" — the onboarding screen lets the user grant what the app needs
 * (on-chain allowances, then Location / Camera / Notifications) one step at a
 * time. Each step is triggered explicitly by the user via `runOnboardingPhase`,
 * so the host's native modal opens on demand — after they've read what the step
 * is for — rather than stacking prompts over the explanation.
 *
 * Phases (host-only; a no-op surface on plain localhost):
 *   - `allowances`: on-chain allowances + the `StatementSubmit` permission
 *     (`ensureBootstrap`). This is the one step that gates trading, so a
 *     rejection here is reported as a retryable error.
 *   - `location` / `camera` / `notifications`: device permissions, best-effort.
 *     A denial degrades the matching feature but never blocks the app, so it
 *     maps to "denied" rather than "error".
 *
 * Device permissions are requested here (post-connect) rather than from
 * `main.tsx`: by the time the wallet is "connected" the host's permission
 * handler is mounted, which sidesteps the silent-deny race documented in
 * `permissions.ts`.
 *
 * "Ask once" is layered: `ensureBootstrap` already gates the heavy allowance
 * modal per account, the host remembers granted device permissions, and the
 * onboarding *screen* is gated by a per-account localStorage flag
 * (`isOnboarded` / `markOnboarded`) so returning users skip it entirely.
 */

import { ensureBootstrap } from "./allowances";
import { isHosted } from "./detect";
import { ensureNotificationPermission } from "./notifications";
import { ensureDevicePermission } from "./permissions";

export type OnboardingPhase =
  | "allowances"
  | "location"
  | "camera"
  | "notifications";

export type PhaseStatus = "pending" | "running" | "done" | "denied" | "error";

export interface RunPhaseResult {
  /** Terminal status for the phase: "done", "denied" (a best-effort device
   *  opt-out) or "error" (allowance rejection / failure — retryable). */
  status: PhaseStatus;
  /** Present only when `status` is "error". */
  error?: string;
}

/**
 * Run a single onboarding phase on demand. Triggered per-step by the onboarding
 * screen so the host's native modal opens only after the user taps that step's
 * button — never stacked automatically over the explanation.
 *
 * Never rejects: any failure is captured in the returned status so the caller
 * can render Retry / move on rather than handle an unhandled rejection.
 */
export async function runOnboardingPhase(
  phase: OnboardingPhase,
): Promise<RunPhaseResult> {
  // Outside the host there is nothing to prompt: no on-chain allowances to
  // request, and the native browser flow handles device access at feature time.
  // Report every phase satisfied.
  if (!isHosted()) return { status: "done" };

  // The one gating step. `ensureBootstrap` clears its memo on throw, so the
  // button can simply call this again to re-open the modal.
  if (phase === "allowances") {
    try {
      await ensureBootstrap();
      return { status: "done" };
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Allowance setup failed.";
      return { status: "error", error: msg };
    }
  }

  // Device permissions — best-effort. A denial degrades the matching feature
  // but never blocks the app, so it maps to "denied" rather than "error".
  const granted = await runDeviceRequest(phase);
  return { status: granted ? "done" : "denied" };
}

/** Request one device permission. Never throws — a failure reads as not granted. */
async function runDeviceRequest(
  phase: "location" | "camera" | "notifications",
): Promise<boolean> {
  try {
    if (phase === "location") return await ensureDevicePermission("Location");
    if (phase === "camera") return await ensureDevicePermission("Camera");
    return await ensureNotificationPermission();
  } catch {
    return false;
  }
}

// ─── Per-account "seen onboarding" flag ──────────────────────────────────────
// Distinct from the allowance flag in `allowances.ts` (that records a host
// grant; this records that the user has been through the onboarding screen).
// Keyed by the connected SS58 address so a different account re-onboards.

const ONBOARDED_PREFIX = "localdot:onboarded:v1:";

function onboardedKey(account: string): string {
  return `${ONBOARDED_PREFIX}${account}`;
}

export function isOnboarded(account: string): boolean {
  if (!account) return false;
  try {
    return localStorage.getItem(onboardedKey(account)) === "1";
  } catch {
    return false;
  }
}

export function markOnboarded(account: string): void {
  if (!account) return;
  try {
    localStorage.setItem(onboardedKey(account), "1");
  } catch {
    /* storage unavailable — the screen will simply re-show next session */
  }
}
