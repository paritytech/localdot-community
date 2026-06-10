/**
 * Canonical DotNS product identifier used for host product-account signing.
 *
 * The host knows this product by its **bare** registered domain (e.g.
 * `mylocaldot.dot`) — the domain the manifest is published on. polkadot-app-deploy
 * publishes the runnable app on the `app.<domain>` subname while the manifest
 * lives on the bare domain, so at runtime `window.location.host` can be
 * `app.<domain>` (or the bare domain) depending on how the host loaded the page.
 * The host grants the product account / SmartContractAllowance against the bare
 * domain, so reading the raw origin mismatches in a real deploy:
 *
 *   expected: 'mylocaldot.dot'      (what the host granted — the manifest domain)
 *   got:      'app.mylocaldot.dot'  (window.location.host of the executable)
 *   → CreateTransactionErr::PermissionDenied
 *
 * To avoid this we use the build-time `VITE_DOTNS_ID` (baked by the deploy to the
 * chosen domain, the same value the manifest publishes with). When it's unset —
 * local dev, e2e — we fall back to `window.location.host`, which the host
 * emulator maps the same way (e.g. `localhost:5199/0` → the test account), so
 * local flows keep working without configuring anything.
 */

import { env } from "../../env";

export function getProductIdentifier(): string {
  const configured = env.VITE_DOTNS_ID;
  if (configured) return configured;

  if (typeof window === "undefined") {
    throw new Error(
      "Product identifier requires VITE_DOTNS_ID or a window context",
    );
  }
  const host = window.location.host;
  if (!host) {
    throw new Error(
      "Could not determine product identifier (no VITE_DOTNS_ID and empty window.location.host)",
    );
  }
  return host;
}
