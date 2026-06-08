/**
 * Runtime detection for Host API environment
 *
 * Products running in the Polkadot Triangle are sandboxed in iframes (web
 * host) or embedded in a native webview (desktop). The wrapper's
 * `sandboxProvider.isCorrectEnvironment()` returns true in either case.
 */

import { accounts, sandboxProvider } from "@novasamatech/host-api-wrapper";

import { env } from "../../env";

const HOST_CONNECT_TIMEOUT_MS = 5_000;

let hostDetectionResult: boolean | null = null;
let hostDetectionPromise: Promise<boolean> | null = null;

/**
 * Synchronous check if we're likely in a Host environment.
 * Used to decide whether to initialize Web3Modal BEFORE React renders.
 * `initHostDetection()` confirms this later via the host handshake.
 */
export function isLikelyHosted(): boolean {
  if (typeof window === "undefined") return false;
  if (env.VITE_USE_HOST_API === false) return false;

  if (
    (window as unknown as Record<string, unknown>).__HOST_WEBVIEW_MARK__ !==
    undefined
  )
    return true;

  if (window.parent !== window) return true;

  return false;
}

/**
 * Initialize Host detection. Must be called early in app lifecycle.
 * Waits up to 5s for the host to report a "connected" account session.
 */
export async function initHostDetection(): Promise<boolean> {
  if (typeof window === "undefined") {
    hostDetectionResult = false;
    return false;
  }

  if (env.VITE_USE_HOST_API === false) {
    hostDetectionResult = false;
    return false;
  }

  if (hostDetectionResult !== null) {
    return hostDetectionResult;
  }

  if (hostDetectionPromise) {
    return await hostDetectionPromise;
  }

  hostDetectionPromise = (async () => {
    if (!sandboxProvider.isCorrectEnvironment()) {
      hostDetectionResult = false;
      return false;
    }

    const connected = await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        try {
          sub.unsubscribe();
        } catch {
          /* no-op */
        }
        resolve(ok);
      };

      const sub = accounts.subscribeAccountConnectionStatus((status) => {
        if (status === "connected") finish(true);
      });

      setTimeout(() => finish(false), HOST_CONNECT_TIMEOUT_MS);
    });

    hostDetectionResult = connected;
    return connected;
  })();

  return await hostDetectionPromise;
}

/**
 * Check if the app is running inside a Host environment.
 * Uses synchronous iframe/webview detection (no async dependency).
 */
export function isHosted(): boolean {
  if (hostDetectionResult !== null) return hostDetectionResult;
  return isLikelyHosted();
}
