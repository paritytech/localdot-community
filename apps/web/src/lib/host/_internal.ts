/**
 * Shared internals for the Host contract modules.
 * Not part of the public API — consumers should import from `./index` instead.
 */

import type { SizedHex, TypedApi } from "polkadot-api";
import { Binary } from "polkadot-api";

import type { paseohubnext } from "@polkadot-api/descriptors";
import { env } from "../../env";
import { ss58ToEvmAddress } from "../address";
import { DEFAULT_CHAIN, MIN_GAS_BALANCE_NATIVE } from "../constants";

/**
 * SS58 origin used as the caller for read-only `ReviveApi.call` dry-runs.
 * On Paseo Next v2 every SS58 is auto-mapped to its H160 by pallet-revive's
 * AutoMapper, so any valid SS58 works; default to Alice. Override via
 * `VITE_READONLY_ORIGIN` if needed.
 */
export const ALICE_SS58_ADDRESS = env.VITE_READONLY_ORIGIN;

/**
 * Convert a hex address string to the `SizedHex<20>` form `Revive.call` /
 * `ReviveApi.call` expect for the `dest` argument under polkadot-api v2 (a
 * fixed-size hex string, not a `Binary`). Parses to bytes first to validate the
 * 20-byte H160, then re-encodes to canonical lower-case hex.
 */
export function addressToH160(address: string): SizedHex<20> {
  const hex = address.startsWith("0x") ? address.slice(2) : address;
  const bytes = new Uint8Array(
    hex.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)),
  );
  return Binary.toHex(bytes) as SizedHex<20>;
}

/**
 * Coerce any wallet identifier to the H160 form ethers' ABI encoder needs.
 * H160 inputs pass through; SS58 inputs are derived to H160 via the same
 * keccak/AutoMap rule pallet-revive uses on Paseo Next v2.
 */
export function toEvmAddress(address: string): string {
  if (/^0x[0-9a-fA-F]{40}$/.test(address)) return address;
  const derived = ss58ToEvmAddress(address);
  if (!derived) {
    throw new Error(`Cannot convert address to H160: ${address}`);
  }
  return derived;
}

/** Thrown when the deployed contract doesn't expose the requested function. */
export class FunctionMissingError extends Error {
  constructor(public readonly functionName: string) {
    super(
      `Function "${functionName}" returned no data — the deployed contract may be an older version.`,
    );
    this.name = "FunctionMissingError";
  }
}

/**
 * Pre-flight gas-balance hint shared by every contract write (P2PMarket +
 * ZKPassportRegistry). Contract-call gas is paid from the product account's
 * native balance — on-chain PGAS does NOT sponsor gas (the `AsPgas` signed
 * extension is unwired; see lib/host/allowances.ts header) — so a low balance
 * means the `Revive.call` may revert with a payment error.
 *
 * Non-blocking by design: we only `console.warn` (the threshold is heuristic
 * and faucet-funding is the expected testnet flow, and the value-bearing
 * escrow/agent calls need more than this flat gas floor anyway). A failed
 * balance read is swallowed so a transient RPC blip can never block a submit.
 */
export async function warnIfLowGasBalance(
  api: TypedApi<typeof paseohubnext>,
  originAddress: string,
): Promise<void> {
  try {
    const accountInfo = await api.query.System.Account.getValue(originAddress);
    if (accountInfo.data.free < MIN_GAS_BALANCE_NATIVE) {
      const symbol = DEFAULT_CHAIN.nativeCurrency.symbol;
      console.warn(
        `[Contract] Low native ${symbol} balance (${accountInfo.data.free} planck) on ${originAddress}. ` +
          `Contract-call gas is paid from this native balance (PGAS does not sponsor gas), so the call may revert. ` +
          `Fund via the ${DEFAULT_CHAIN.name} faucet if it fails with a payment error.`,
      );
    }
  } catch {
    /* balance read failed — non-fatal; proceed with the submit */
  }
}
