import { test as base, expect } from "@playwright/test";
import {
  createTestHostFixture,
  PASEO_ASSET_HUB,
  type TestHost,
} from "@parity/host-api-test-sdk/playwright";

const PRODUCT_URL = "http://localhost:5199";

// LocalDOT derives its DotNS identifier from `window.location.host`, so under
// Playwright the product account key is `localhost:5199/0`. We also map the
// canonical `.dot` identifier so the same Bob signer is used regardless of
// which host name the iframe loads under.
const bobFixture = createTestHostFixture({
  productUrl: PRODUCT_URL,
  accounts: ["bob"],
  chain: PASEO_ASSET_HUB,
  productAccounts: {
    "localdot.dot/0": "bob",
    "localhost:5199/0": "bob",
  },
});

// The landing page auto-opens a fullscreen "Set location" modal when no
// location is saved in localStorage. The modal sits at z-[2000] and blocks
// every click on the rest of the UI. We use `context.addInitScript` so the
// seed runs in the iframe's origin before any product script — including
// LocationContext's storage read.
const SEEDED_LOCATION = {
  lat: 52.52,
  lon: 13.405,
  city: "Berlin",
  country: "Germany",
};

const test = base.extend<{ testHost: TestHost }>(bobFixture).extend({
  page: async ({ page }, use) => {
    await page.context().addInitScript((loc) => {
      try {
        localStorage.setItem("localdot_user_location", JSON.stringify(loc));
      } catch {
        /* iframes from sandboxed/cross-origin contexts may throw — fine */
      }
    }, SEEDED_LOCATION);
    await use(page);
  },
});

export { test, expect };
