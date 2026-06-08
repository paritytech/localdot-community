import { blake2b } from "@noble/hashes/blake2.js";
import { CID } from "multiformats/cid";
import * as raw from "multiformats/codecs/raw";
import type { MultihashDigest } from "multiformats/hashes/interface";

const BLAKE2B_256_CODE = 0xb220;

function encodeVarint(value: number): Uint8Array {
  const bytes: number[] = [];
  let num = value;
  while (num >= 0x80) {
    bytes.push((num & 0x7f) | 0x80);
    num >>= 7;
  }
  bytes.push(num & 0x7f);
  return new Uint8Array(bytes);
}

/**
 * Calculate CID (Content Identifier) for file bytes using Blake2b-256 hash
 * @param fileBytes - The file content as Uint8Array
 * @returns CID string in CIDv1 format
 */
export function calculateCID(fileBytes: Uint8Array): string {
  const hash = blake2b(fileBytes, { dkLen: 32 }); // 32 bytes = 256 bits

  const codeBytes = encodeVarint(BLAKE2B_256_CODE);
  const lengthBytes = encodeVarint(hash.length);

  const multihashBytes = new Uint8Array(
    codeBytes.length + lengthBytes.length + hash.length,
  );
  multihashBytes.set(codeBytes, 0);
  multihashBytes.set(lengthBytes, codeBytes.length);
  multihashBytes.set(hash, codeBytes.length + lengthBytes.length);

  const digest: MultihashDigest = {
    code: BLAKE2B_256_CODE,
    size: hash.length,
    bytes: multihashBytes,
    digest: hash,
  };

  const cid = CID.createV1(raw.code, digest);
  return cid.toString();
}
