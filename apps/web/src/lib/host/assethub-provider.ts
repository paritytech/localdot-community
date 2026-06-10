/**
 * Asset Hub Provider
 *
 * PAPI connection to Paseo Asset Hub for contract interactions, routed entirely
 * through the Polkadot host's chain-connection manager via `createPapiProvider`
 * (keyed by genesis hash). The host owns the transport, so the PApp opens no
 * socket of its own — meaning this only works inside a host environment
 * (Polkadot Desktop, mobile, dot.li), not a bare browser.
 */

import { createPapiProvider } from "@novasamatech/host-api-wrapper";
import type { PolkadotClient, TypedApi } from "polkadot-api";
import { createClient } from "polkadot-api";

import { paseohubnext } from "@polkadot-api/descriptors";
import { activeNetwork } from "./networks";

class AssetHubProviderManager {
  private client: PolkadotClient | null = null;
  private api: TypedApi<typeof paseohubnext> | null = null;
  private _nativeToEvmRatio: bigint | null = null;
  private initPromise: Promise<{
    client: PolkadotClient;
    api: TypedApi<typeof paseohubnext>;
  }> | null = null;

  async get(): Promise<{
    client: PolkadotClient;
    api: TypedApi<typeof paseohubnext>;
  }> {
    if (this.client && this.api) {
      return { client: this.client, api: this.api };
    }

    if (this.initPromise) {
      return await this.initPromise;
    }

    this.initPromise = (async () => {
      const provider = createPapiProvider(activeNetwork.assetHubGenesis);
      this.client = createClient(provider);
      this.api = this.client.getTypedApi(paseohubnext);

      // Read NativeToEthRatio from Revive pallet runtime constants.
      // This is the conversion factor between native planck and EVM wei.
      // On Paseo: 1e8 (18 EVM decimals - 10 native decimals = 8 digit difference).
      try {
        this._nativeToEvmRatio = BigInt(
          await this.api.constants.Revive.NativeToEthRatio(),
        );
      } catch (err) {
        console.warn(
          "[AssetHub] Failed to read NativeToEthRatio, falling back to 1e8:",
          err,
        );
        this._nativeToEvmRatio = BigInt(1e8);
      }

      return { client: this.client, api: this.api };
    })();

    return await this.initPromise;
  }

  /** Synchronous getter — returns cached ratio or null if chain not yet connected. */
  getNativeToEvmRatio(): bigint | null {
    return this._nativeToEvmRatio;
  }

  destroy(): void {
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
    this.api = null;
    this._nativeToEvmRatio = null;
    this.initPromise = null;
  }
}

// Singleton with HMR support
declare global {
  var __assetHubProviderManager: AssetHubProviderManager | undefined;
}

function getAssetHubProviderManager(): AssetHubProviderManager {
  if (typeof window !== "undefined") {
    if (!globalThis.__assetHubProviderManager) {
      globalThis.__assetHubProviderManager = new AssetHubProviderManager();
    }
    return globalThis.__assetHubProviderManager;
  }
  return new AssetHubProviderManager();
}

export const assetHubProvider = getAssetHubProviderManager();

/**
 * Synchronous getter for NativeToEthRatio.
 * Returns null if chain is not yet connected.
 */
export function getNativeToEvmRatio(): bigint | null {
  return assetHubProvider.getNativeToEvmRatio();
}

/**
 * Async getter — waits for chain connection, then returns the ratio.
 * Falls back to 1e8 (Paseo default) if chain init fails.
 */
export async function waitForNativeToEvmRatio(): Promise<bigint> {
  try {
    await assetHubProvider.get();
  } catch (err) {
    console.warn("[AssetHub] Chain init failed, using default ratio 1e8:", err);
  }
  return assetHubProvider.getNativeToEvmRatio() ?? BigInt(1e8);
}

/**
 * Compute EVM decimals from native token decimals and the on-chain ratio.
 * Falls back to 18 if the ratio is not yet loaded (safe for Paseo).
 */
export function getEvmDecimals(nativeDecimals: number): number {
  const ratio = assetHubProvider.getNativeToEvmRatio();
  if (!ratio) return 18;
  return nativeDecimals + Math.round(Math.log10(Number(ratio)));
}
