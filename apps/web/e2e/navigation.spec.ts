/**
 * Page-level smoke tests.
 *
 * Each route is a lazy chunk that wires up its own host-API consumers
 * (`useP2PMarket`, `useOffersContext`, etc.). A regression in the host-API
 * wrapper that crashes any one of these hooks at mount time would surface
 * here as a navigation failure or a missing page heading.
 */
import { test, expect } from "./fixtures";
import { waitForAppReady } from "./helpers";

const ROUTES: Array<{ name: string }> = [
  { name: "Exchange" },
  { name: "Explore" },
  { name: "Create" },
  { name: "About" },
];

test.describe("Navigation", () => {
  for (const route of ROUTES) {
    test(`navigates to ${route.name}`, async ({ testHost }) => {
      const frame = await waitForAppReady(testHost);
      // Scope to <header> — it covers both the nav links and the About icon,
      // which lives in the header actions outside <nav> — while still avoiding
      // duplicate links in the landing page body (e.g. "Explore →").
      const header = frame.locator("header").first();
      await header
        .getByRole("link", { name: route.name, exact: true })
        .click();
      await expect(frame.locator("main")).toBeVisible({ timeout: 30_000 });
      await expect(frame.getByRole("heading").first()).toBeVisible({
        timeout: 30_000,
      });
    });
  }
});
