/**
 * Bulletin Chain storage adapter
 *
 * Upload: preimageManager.submit() under the host's RFC-0010 Bulletin allowance.
 * Host-only — there is no dev-key fallback; uploading outside the host throws.
 *
 * Fetch: IPFS gateways with configured gateway first.
 */

import { blake2b } from "@noble/hashes/blake2b";
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

async function uploadViaPreimage(data: Uint8Array): Promise<void> {
  const { preimageManager } = await import("@novasamatech/host-api-wrapper");
  await preimageManager.submit(data);
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

export async function fetchFromHostStorage(cid: string): Promise<Uint8Array> {
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

export async function fetchJsonFromHostStorage<T>(cid: string): Promise<T> {
  const data = await fetchFromHostStorage(cid);
  const text = new TextDecoder().decode(data);
  return JSON.parse(text) as T;
}
