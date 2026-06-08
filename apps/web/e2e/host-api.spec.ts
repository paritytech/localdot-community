/**
 * Host API protocol checks.
 *
 * These tests assert that the test host's observation surfaces are wired up
 * correctly against the LocalDOT product bundle. They're cheap and they fail
 * fast when an upstream `@novasamatech/*` bump breaks the message envelope.
 *
 * What we deliberately don't test here:
 *   - On-chain submission. The test SDK signs v4 extrinsics but does not
 *     broadcast — that's the dev-chain harness's job.
 *   - End-to-end trade flows. Without a real chain we can't observe state
 *     transitions past the signing boundary.
 */
import { test, expect } from "./fixtures";
import { dismissOnboarding, waitForAppReady } from "./helpers";

test.describe("Host API protocol", () => {
  test("test host exposes signing + permission logs", async ({ testHost }) => {
    await waitForAppReady(testHost);

    // Both observation APIs must be callable and return arrays. If the test
    // SDK's protocol layer is wired up, these resolve; if not (e.g. the
    // product never connected), they throw or hang.
    const signingLog = await testHost.getSigningLog();
    const permissionLog = await testHost.getPermissionLog();

    expect(Array.isArray(signingLog)).toBe(true);
    expect(Array.isArray(permissionLog)).toBe(true);
  });

  test("account switching reloads the product without errors", async ({
    testHost,
  }) => {
    await waitForAppReady(testHost);
    // `setAccounts` recreates the container and reloads the iframe. The
    // product should re-handshake under the new account name without throwing.
    await testHost.setAccounts(["alice"]);
    const frame = testHost.productFrame();
    await testHost.waitForConnection(60_000);
    // The reloaded product re-shows the onboarding gate for the new account.
    await dismissOnboarding(frame);
    await expect(
      frame.locator('a:has-text("LocalDOT")').first(),
    ).toBeVisible({ timeout: 60_000 });
  });
});
