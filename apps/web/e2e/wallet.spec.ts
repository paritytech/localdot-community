/**
 * Wallet / host login flow.
 *
 * LocalDOT's WalletContext auto-connects on mount by:
 *   1. Subscribing to `accounts.subscribeAccountConnectionStatus` and waiting
 *      for `"connected"`.
 *   2. Calling `accounts.getProductAccount(window.location.host, 0)` to get the
 *      product-derived account.
 *
 * Both of those are host-API protocol calls that broke across the 0.7.0
 * (`ProductAccountId` shape) and 0.8.0 (`createTransaction` shape) releases.
 * These tests are the canary for that protocol surface.
 */
import { test, expect } from "./fixtures";
import { waitForAppReady } from "./helpers";

test.describe("Wallet connects via host", () => {
  test('"Connecting..." indicator clears once host returns an account', async ({
    testHost,
  }) => {
    const frame = await waitForAppReady(testHost);

    // While `accounts.getProductAccount` is in flight the header shows a
    // "Connecting..." note. Once the product account resolves the connected
    // pill (with the status dot) replaces it. We assert the latter is visible
    // — that means the full host handshake completed end-to-end.
    await expect(frame.getByText("Connecting...")).toHaveCount(0, {
      timeout: 30_000,
    });

    // The connected profile pill (only rendered when `isConnected && address`)
    // links to /profile. We use the title attribute (set to the SS58 address)
    // as the most stable selector.
    const profilePill = frame.locator('a[href="#/profile"]').first();
    await expect(profilePill).toBeVisible({ timeout: 30_000 });
  });

  test("chain badge shows the configured chain name", async ({ testHost }) => {
    const frame = await waitForAppReady(testHost);
    // VITE_CHAIN_ID defaults to Paseo Asset Hub Next (420420417).
    await expect(
      frame.getByText("Paseo Asset Hub Next").first(),
    ).toBeVisible({ timeout: 30_000 });
  });
});
