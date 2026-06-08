import { ethers } from "ethers";
import { AccountId } from "polkadot-api";

const EVM_DERIVED_MARKER = 0xee;

/**
 * Derive the H160 EVM address from an SS58 Substrate address.
 *
 * Asset Hub pallet-revive derivation rules:
 * - If EVM-derived account (last 12 bytes are 0xEE): strip padding → recover H160
 * - If native Substrate account: keccak256(publicKey) → last 20 bytes
 *
 * Based on mark3t's evmMapping.ts
 */
export function ss58ToEvmAddress(ss58Address: string): string {
  const publicKey = AccountId().enc(ss58Address);

  if (publicKey.length !== 32) {
    return "";
  }

  // Check if EVM-derived account (last 12 bytes are all 0xEE)
  const isEvmDerived = publicKey
    .slice(20)
    .every((b) => b === EVM_DERIVED_MARKER);

  if (isEvmDerived) {
    return (
      "0x" +
      Array.from(publicKey.slice(0, 20))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
    );
  }

  // Native account: keccak256(publicKey), last 20 bytes
  const hash = ethers.keccak256(publicKey);
  return "0x" + hash.slice(-40);
}

/**
 * Check if an SS58 address matches an EVM address (case-insensitive)
 */
export function isOwner(
  ss58Address: string | null,
  evmAddress: string,
): boolean {
  if (!ss58Address) return false;
  const derived = ss58ToEvmAddress(ss58Address);
  return derived.toLowerCase() === evmAddress.toLowerCase();
}

/**
 * Derive the H160 EVM address from a 32-byte sr25519/ed25519 public key.
 * Mirrors `ss58ToEvmAddress`'s logic for the same pubkey/SS58 pair: for
 * native accounts it's `keccak256(pubkey)[-20:]`; for EVM-derived accounts
 * (last 12 bytes = 0xEE) it's the first 20 bytes directly. Lowercase hex.
 *
 * Used by message-store's signer validation to compare the proof signer's
 * derived address against the wire payload's claimed `from` field.
 */
export function pubkeyToH160(pubkey: Uint8Array): string {
  if (pubkey.length !== 32) {
    throw new Error(
      `pubkeyToH160: expected 32-byte pubkey, got ${pubkey.length}`,
    );
  }
  const isEvmDerived = pubkey.slice(20).every((b) => b === EVM_DERIVED_MARKER);
  if (isEvmDerived) {
    let hex = "0x";
    for (const b of pubkey.slice(0, 20)) hex += b.toString(16).padStart(2, "0");
    return hex;
  }
  const hash = ethers.keccak256(pubkey);
  return "0x" + hash.slice(-40);
}

/** Hex string `0x…` (or unprefixed) → byte array. Returns null on bad input. */
export function hexToBytesOrNull(hex: unknown): Uint8Array | null {
  if (typeof hex !== "string") return null;
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) return null;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const n = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(n)) return null;
    bytes[i] = n;
  }
  return bytes;
}
