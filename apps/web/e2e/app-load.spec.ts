import { test, expect } from "./fixtures";
import { waitForAppReady } from "./helpers";

test.describe("App loads", () => {
  test("mounts product via test host and renders header", async ({
    testHost,
  }) => {
    const frame = await waitForAppReady(testHost);

    // Brand mark
    await expect(frame.locator('a:has-text("LocalDOT")').first()).toBeVisible();

    // Main nav items rendered — scope to the header nav because the landing
    // body also renders an "Explore →" link.
    const headerNav = frame.locator("header nav").first();
    await expect(
      headerNav.getByRole("link", { name: "Exchange", exact: true }),
    ).toBeVisible();
    await expect(
      headerNav.getByRole("link", { name: "Explore", exact: true }),
    ).toBeVisible();
    await expect(
      headerNav.getByRole("link", { name: "Create", exact: true }),
    ).toBeVisible();
    // Profile moved into the nav. It carries a connection-status dot whose
    // aria-label folds into the accessible name, so match by partial name.
    await expect(
      headerNav.getByRole("link", { name: "Profile" }),
    ).toBeVisible();
    // About is now an icon-only link in the header actions, outside <nav>.
    await expect(
      frame.locator("header").getByRole("link", { name: "About", exact: true }),
    ).toBeVisible();
  });

  test("renders landing page below header", async ({ testHost }) => {
    const frame = await waitForAppReady(testHost);
    await expect(frame.locator("main")).toBeVisible();
  });
});
