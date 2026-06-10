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
    // Genesis hashes verified against the live chains on 2026-06-09, after the
    // 2026-06-01 re-genesis. These MUST match the host's environment registry
    // (polkadot-desktop's `paseo-next-v2` entry) or host routing rejects the
    // chain with "Host doesn't support it". Re-verify with
    // `chain_getBlockHash(0)` against each RPC if routing starts failing.
    assetHubGenesis:
      "0xbf0488dbe9daa1de1c08c5f743e26fdc2a4ecd74cf87dd1b4b1eeb99ae4ef19f",
    peopleGenesis:
      "0xc5af1826b31493f08b7e2a823842f98575b806a784126f28da9608c68665afa5",
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
