/**
 * Environment variables with runtime validation.
 *
 * Chain-specific defaults come from `lib/constants.ts` — overriding the
 * default chain there propagates to env fallbacks automatically.
 */

import { DEFAULT_CHAIN } from "./lib/constants";

interface Env {
  VITE_RPC_URL: string;
  VITE_CHAIN_ID: number;
  /** Network key selecting the chain set (see lib/host/networks.ts). Defaults to paseo-next-v2. */
  VITE_NETWORK?: string;
  VITE_P2PMARKET_ADDRESS?: string;
  VITE_ZKPASSPORT_REGISTRY_ADDRESS?: string;
  VITE_IPFS_GATEWAY?: string;
  /** SS58 address used as origin for read-only contract queries (on Paseo Next v2 every account is auto-mapped, so any valid SS58 works). */
  VITE_READONLY_ORIGIN: string;
  /** Set to false to force standalone mode even when Host API is detected */
  VITE_USE_HOST_API?: boolean;
  /** zkpassport domain for verification (defaults to demo.zkpassport.id in dev) */
  VITE_ZKPASSPORT_DOMAIN?: string;
  /**
   * Canonical DotNS product identifier the host knows this product by — the bare
   * registered domain (e.g. `mylocaldot.dot`). Baked at build time by the deploy
   * (set to the chosen domain, the same value the manifest is published with) and
   * used as the product-account identifier for host signing. When unset, the host
   * signer falls back to `window.location.host` so local dev / e2e keep working.
   */
  VITE_DOTNS_ID?: string;
}

// Alice's well-known SS58 — always pre-mapped on Substrate testnets, used as
// the origin for read-only queries that don't sign. Override via env on
// production / non-testnet chains where Alice isn't mapped.
const DEFAULT_READONLY_ORIGIN =
  "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY";

function getEnv(): Env {
  const rawChainId = import.meta.env.VITE_CHAIN_ID;
  const rawUseHostApi = import.meta.env.VITE_USE_HOST_API;

  return {
    VITE_RPC_URL: import.meta.env.VITE_RPC_URL || DEFAULT_CHAIN.rpcUrl,
    VITE_CHAIN_ID: rawChainId ? Number(rawChainId) : DEFAULT_CHAIN.chainId,
    VITE_NETWORK: import.meta.env.VITE_NETWORK,
    VITE_P2PMARKET_ADDRESS: import.meta.env.VITE_P2PMARKET_ADDRESS,
    VITE_ZKPASSPORT_REGISTRY_ADDRESS: import.meta.env
      .VITE_ZKPASSPORT_REGISTRY_ADDRESS,
    VITE_IPFS_GATEWAY: import.meta.env.VITE_IPFS_GATEWAY,
    VITE_READONLY_ORIGIN:
      import.meta.env.VITE_READONLY_ORIGIN || DEFAULT_READONLY_ORIGIN,
    // Defaults to undefined (auto-detect), set to 'false' to force standalone
    VITE_USE_HOST_API: rawUseHostApi === "false" ? false : undefined,
    // zkpassport domain - defaults to demo in dev
    VITE_ZKPASSPORT_DOMAIN:
      import.meta.env.VITE_ZKPASSPORT_DOMAIN || "demo.zkpassport.id",
    // Bare DotNS domain for host signing; falls back to window.location.host in dev
    VITE_DOTNS_ID: import.meta.env.VITE_DOTNS_ID,
  };
}

export const env = getEnv();
