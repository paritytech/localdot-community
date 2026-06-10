import type { TestHost } from "@parity/host-api-test-sdk/playwright";
import { type FrameLocator } from "@playwright/test";

/**
 * Dismiss the first-run onboarding gate if present.
 *
 * When hosted, `OnboardingGate` renders an allowances/permissions screen over
 * the app until the user grants allowances ("Enter app") or skips ("Skip for
 * now"); only then is the product (header, routes) revealed. A returning user
 * skips it via a per-account localStorage flag. In tests each fresh account is
 * un-onboarded, so we click through the gate to reach the product UI. No-op if
 * the gate isn't shown (already onboarded / not hosted).
 */
export async function dismissOnboarding(
  frame: FrameLocator,
  timeout = 15_000,
): Promise<void> {
  const dismiss = frame.getByRole("button", {
    name: /Skip for now|Enter app/,
  });
  try {
    await dismiss.first().click({ timeout });
  } catch {
    /* gate not shown — nothing to dismiss */
  }
}

export async function waitForAppReady(
  testHost: TestHost,
  options?: { timeout?: number },
): Promise<FrameLocator> {
  const timeout = options?.timeout ?? 90_000;
  const frame = testHost.productFrame();
  await testHost.waitForConnection(timeout);
  await dismissOnboarding(frame);
  await frame
    .locator('a:has-text("LocalDOT")')
    .first()
    .waitFor({ state: "visible", timeout });
  return frame;
}
