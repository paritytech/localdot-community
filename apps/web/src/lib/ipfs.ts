import { env } from "../env";
import { isHosted } from "./host";
import { fetchFromHostStorage, fetchJsonFromHostStorage } from "./host/storage";

/**
 * Constructs IPFS gateway URL from CID
 *
 * Note: In Host mode, direct gateway access is not available.
 * Use fetchFromIPFS() or fetchJSONFromIPFS() instead.
 */
/**
 * Default IPFS gateway for the Paseo Next v2 stack. Override via
 * `VITE_IPFS_GATEWAY` for local dev or alternative gateways.
 */
const DEFAULT_IPFS_GATEWAY =
  "https://paseo-bulletin-next-ipfs.polkadot.io/ipfs/";

export function getIPFSUrl(cid: string): string {
  const gateway = env.VITE_IPFS_GATEWAY || DEFAULT_IPFS_GATEWAY;
  const baseUrl = gateway.endsWith("/") ? gateway : `${gateway}/`;
  return `${baseUrl}${cid}`;
}

/**
 * Fetches data from IPFS gateway with timeout
 *
 * Supports both Host mode (via Host API) and standalone mode (direct fetch).
 * CRITICAL: In Host mode, direct fetch() calls will fail - this function
 * automatically routes through the Host API.
 */
export async function fetchFromIPFS(
  cid: string,
  timeout = 5000,
): Promise<Response> {
  // Host mode: use Host API storage
  if (isHosted()) {
    const bytes = await fetchFromHostStorage(cid);
    // Create a Response from the bytes - convert to ArrayBuffer explicitly
    const arrayBuffer = new ArrayBuffer(bytes.length);
    new Uint8Array(arrayBuffer).set(bytes);
    return new Response(arrayBuffer, {
      status: 200,
      statusText: "OK",
      headers: {
        "Content-Type": "application/octet-stream",
      },
    });
  }

  // Standalone mode: direct fetch
  const ipfsUrl = getIPFSUrl(cid);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(ipfsUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      return response;
    }

    throw new Error(
      `Failed to fetch from gateway: ${response.status} ${response.statusText}`,
    );
  } catch (error) {
    clearTimeout(timeoutId);
    throw new Error(
      `Failed to fetch from gateway: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Fetches and parses JSON from IPFS gateway
 *
 * Supports both Host mode (via Host API) and standalone mode (direct fetch).
 */
export async function fetchJSONFromIPFS<T>(cid: string): Promise<T> {
  // Host mode: use Host API storage directly for JSON
  if (isHosted()) {
    return await fetchJsonFromHostStorage<T>(cid);
  }

  // Standalone mode: fetch and parse
  const response = await fetchFromIPFS(cid);
  return (await response.json()) as T;
}
