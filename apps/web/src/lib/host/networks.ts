/**
 * Network registry — the set of chains a deployment runs against, selected at
 * build time via `VITE_NETWORK` (defaults to `paseo-next-v2`).
 *
 * Because connections are host-routed (`createPapiProvider` keys off the genesis
 * hash), a network's hashes MUST match the host's environment registry for the
 * same network id — otherwise the host rejects the chain ("Host doesn't support
 * it"). Keep these aligned with polkadot-desktop's `paseo-next-v2` entry.
 *
 * Add a network: append an entry to `NETWORKS`, then deploy with
 * `VITE_NETWORK=<key>`. Genesis hashes come from `.papi/polkadot-api.json`;
 * regenerate them with the papi sync tooling if a chain is re-genesised.
 */

import type { HexString } from "@novasamatech/host-api";

import { env } from "../../env";

export interface NetworkConfig {
  key: string;
  /** Human-readable label for diagnostics / UI. */
  displayName: string;
  /** Asset Hub (pallet-revive contracts) genesis — chain id for createPapiProvider. */
  assetHubGenesis: HexString;
  /** People chain (pallet-statement) genesis — for the statement-store connection. */
  peopleGenesis: HexString;
  /** Bulletin chain (blob storage) genesis. */
  bulletinGenesis: HexString;
}

export const NETWORKS = {
  "paseo-next-v2": {
    key: "paseo-next-v2",
    displayName: "Paseo Asset Hub Next (v2)",
    // ⚠ polkadot-desktop / w3s-conference use 0xbf0488… for this network id
    // (re-genesised 2026-06-01). If host routing rejects the chain, refresh
    // these via the papi sync tooling and update them here.
    assetHubGenesis:
      "0x173cea9df45656cf612c8b8ece56e04e9a693c69cfaac47d3628dae735067af8",
    peopleGenesis:
      "0x053e1a785bb0990b98768124d9609e963d9ca3558f5ac6e90a4297aaa0a0bd4b",
    bulletinGenesis:
      "0x8cfe6717dc4becfda2e13c488a1e2061ff2dfee96e7d031157f72d36716c0a22",
  },
} satisfies Record<string, NetworkConfig>;

export type NetworkKey = keyof typeof NETWORKS;
export const DEFAULT_NETWORK: NetworkKey = "paseo-next-v2";

/**
 * The active network for this build. `VITE_NETWORK` selects it; an unknown key
 * throws at module load so a misconfigured deploy fails loudly at boot rather
 * than silently running against the default chain.
 */
function resolveActiveNetwork(): NetworkConfig {
  const key = env.VITE_NETWORK ?? DEFAULT_NETWORK;
  if (key in NETWORKS) {
    return NETWORKS[key as NetworkKey];
  }
  throw new Error(
    `Unknown VITE_NETWORK "${key}". Known networks: ${Object.keys(NETWORKS).join(", ")}`,
  );
}

export const activeNetwork: NetworkConfig = resolveActiveNetwork();
