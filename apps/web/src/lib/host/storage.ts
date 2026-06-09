/**
 * Bulletin Chain storage adapter
 *
 * Upload: preimageManager.submit() under the host's RFC-0010 Bulletin allowance.
 * Host-only — there is no dev-key fallback; uploading outside the host throws.
 *
 * Fetch: host-routed via `preimageManager.lookup` when in-host (the host owns
 * the Bulletin connection); public IPFS gateways as a standalone fallback.
 */

import { blake2b } from "@noble/hashes/blake2b";
import type { HexString } from "@novasamatech/host-api";
import { CID } from "multiformats/cid";
import * as multihash from "multiformats/hashes/digest";

import { env } from "../../env";
import { isHosted } from "./detect";
import type { HostStorageUploadResult } from "./types";

function calculateCID(data: Uint8Array): string {
  const hash = blake2b(data, { dkLen: 32 });
  const digest = multihash.create(0xb220, hash);
  const cid = CID.createV1(0x55, digest);
  return cid.toString();
}

/** Extract the blake2b-256 preimage key (host lookup key) embedded in a CIDv1. */
function cidToPreimageKey(cid: string): HexString {
  const digest = CID.parse(cid).multihash.digest;
  let hex = "0x";
  for (const b of digest) hex += b.toString(16).padStart(2, "0");
  return hex as HexString;
}

async function uploadViaPreimage(data: Uint8Array): Promise<void> {
  const { preimageManager } = await import("@novasamatech/host-api-wrapper");
  await preimageManager.submit(data);
}

/**
 * Read a blob from the host by CID via `preimageManager.lookup` (host-only).
 * `lookup` is a subscription: it fires with the bytes once the host resolves
 * the preimage, so wrap it in a promise that settles on the first hit (or a
 * timeout) and tears the subscription down either way.
 */
async function fetchViaPreimage(cid: string): Promise<Uint8Array> {
  const { preimageManager } = await import("@novasamatech/host-api-wrapper");
  const key = cidToPreimageKey(cid);
  return await new Promise<Uint8Array>((resolve, reject) => {
    let settled = false;
    let sub: { unsubscribe: () => void } | null = null;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      sub?.unsubscribe();
      reject(new Error(`Preimage lookup timed out for CID ${cid}`));
    }, 15000);
    sub = preimageManager.lookup(key, (preimage) => {
      if (settled || preimage === null) return;
      settled = true;
      clearTimeout(timer);
      sub?.unsubscribe();
      resolve(preimage);
    });
  });
}

export async function uploadToHostStorage(
  data: Uint8Array,
  _type: "bulletin" | "ipfs" = "bulletin",
  _filename?: string,
): Promise<HostStorageUploadResult> {
  const cid = calculateCID(data);

  if (!isHosted()) {
    throw new Error(
      "Bulletin upload requires the Polkadot host (Desktop or dot.li).",
    );
  }
  await uploadViaPreimage(data);

  return { cid };
}

export async function uploadJsonToHostStorage(
  data: unknown,
  _filename = "data.json",
): Promise<string> {
  const jsonString = JSON.stringify(data, null, 2);
  const bytes = new TextEncoder().encode(jsonString);
  const result = await uploadToHostStorage(bytes, "bulletin");
  return result.cid;
}

/** Fetch a blob by CID from public IPFS gateways (standalone fallback). */
async function fetchFromGateway(cid: string): Promise<Uint8Array> {
  const configuredGateway = env.VITE_IPFS_GATEWAY || "";
  const gateways = [
    ...(configuredGateway
      ? [`${configuredGateway.replace(/\/$/, "")}/${cid}`]
      : [`https://paseo-bulletin-next-ipfs.polkadot.io/ipfs/${cid}`]),
    `https://dweb.link/ipfs/${cid}`,
    `https://ipfs.io/ipfs/${cid}`,
  ];

  let lastError: Error | null = null;

  for (const url of gateways) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15000),
      });

      if (response.ok) {
        return new Uint8Array(await response.arrayBuffer());
      }

      lastError = new Error(
        `Gateway ${response.status} ${response.statusText}`,
      );
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw new Error(
    `All gateways failed. Last: ${lastError?.message || "Unknown"}`,
  );
}

/**
 * Fetch a blob by CID. In-host: routed through the host via preimage lookup
 * (the host owns the Bulletin connection). Standalone: public IPFS gateways,
 * since there's no host to serve the blob.
 */
export async function fetchFromHostStorage(cid: string): Promise<Uint8Array> {
  if (isHosted()) {
    return await fetchViaPreimage(cid);
  }
  return await fetchFromGateway(cid);
}

export async function fetchJsonFromHostStorage<T>(cid: string): Promise<T> {
  const data = await fetchFromHostStorage(cid);
  const text = new TextDecoder().decode(data);
  return JSON.parse(text) as T;
}
