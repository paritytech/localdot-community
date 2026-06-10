/**
 * Shared P2PMarket contract call helpers (read + write).
 */

import { ethers } from "ethers";
import type { PolkadotSigner } from "polkadot-api";
import { Binary } from "polkadot-api";

import P2PMarketArtifact from "../../abi/P2PMarket.json";
import { env } from "../../env";
import { ss58ToEvmAddress } from "../address";
import { ZERO_ADDRESS } from "../format";
import {
  addressToH160,
  ALICE_SS58_ADDRESS,
  FunctionMissingError,
  warnIfLowGasBalance,
} from "./_internal";
import { assetHubProvider } from "./assethub-provider";

const SIGN_TIMEOUT_MS = 60_000;

/** Friendly copy for the P2PMarket custom errors, so a revert reads as a
 *  sentence instead of "ContractReverted". Unmapped errors fall back to the
 *  raw error name. */
const REVERT_MESSAGES: Record<string, string> = {
  AgentAlreadyRegistered: "This wallet is already registered as an agent.",
  AgentNotRegistered: "That agent isn't registered.",
  AgentNotActive: "That agent is not active.",
  AgentAlreadyActive: "That agent is already active.",
  AgentAlreadyOnOffer: "That agent is already on this offer.",
  AgentHasActiveTrades: "The agent still has active trades.",
  FlatFeeTooHigh: "The fee exceeds the maximum allowed (1000).",
  InvalidHoldHours: "Hold hours must be between 2 and 72.",
  InvalidName: "A name is required.",
  InvalidMetadataCID: "Listing details failed to upload — please retry.",
  InvalidAmount: "The amount is invalid.",
  InvalidMinAmount: "The minimum amount is invalid.",
  CurrencyNotSupported: "That currency isn't supported.",
  InsufficientInsurance: "Not enough staked insurance.",
  NoInsuranceToWithdraw: "There's no staked insurance to withdraw.",
  OfferNotFound: "That offer no longer exists.",
  OfferExpiredError: "This offer has expired.",
  NotOfferOwner: "Only the offer owner can do this.",
  TradeNotFound: "That trade doesn't exist.",
  TradeNotLocked: "This trade isn't in a lockable state.",
  TradeNotReleased: "The cash hasn't been released yet.",
  NotAgent: "Only the trade's agent can do this.",
  NotLocker: "Only the party who locked the trade can do this.",
  TimeoutReached: "The 24-hour confirmation window has passed.",
  TimeoutNotReached: "The timeout hasn't been reached yet.",
};

/**
 * Best-effort decode of a contract revert into a human reason. The PAPI submit
 * path only surfaces `ContractReverted` with no detail, so on failure we
 * replay the call via eth_call (which returns the revert bytes) and decode it
 * against the ABI. Returns null if the reason can't be determined — callers
 * then fall back to the generic message, so this never blocks a write.
 */
async function decodeRevertReason(
  contractAddress: string,
  originSs58: string,
  calldata: string,
  value: bigint,
): Promise<string | null> {
  if (!env.VITE_RPC_URL) return null;
  try {
    const from = ss58ToEvmAddress(originSs58);
    if (!from) return null;
    const rpc = new ethers.JsonRpcProvider(env.VITE_RPC_URL);
    await rpc.call({ to: contractAddress, from, data: calldata, value });
    return null; // didn't revert in simulation — inconclusive
  } catch (err: unknown) {
    const e = err as {
      revert?: { name?: string };
      data?: unknown;
      info?: { error?: { data?: unknown } };
      error?: { data?: unknown };
    };
    const named = e.revert?.name;
    if (named) return REVERT_MESSAGES[named] ?? `Reverted: ${named}`;
    const raw = e.data ?? e.info?.error?.data ?? e.error?.data;
    if (typeof raw === "string" && raw.startsWith("0x") && raw.length >= 10) {
      try {
        const parsed = new ethers.Interface(P2PMarketArtifact.abi).parseError(
          raw,
        );
        if (parsed)
          return REVERT_MESSAGES[parsed.name] ?? `Reverted: ${parsed.name}`;
      } catch {
        // not a recognizable custom error
      }
    }
    return null;
  }
}

/** Get and validate the P2PMarket contract address (throws if not deployed). */
export function getP2PMarketAddress(): string {
  const contractAddress = env.VITE_P2PMARKET_ADDRESS;
  if (!contractAddress || contractAddress === ZERO_ADDRESS) {
    throw new Error("Smart contract not deployed yet");
  }
  return contractAddress;
}

/** True when the P2PMarket address is configured (non-zero). */
export function isP2PMarketDeployed(): boolean {
  const contractAddress = env.VITE_P2PMARKET_ADDRESS;
  return Boolean(contractAddress) && contractAddress !== ZERO_ADDRESS;
}

/** Read-only call against the P2PMarket contract; decodes the function result. */
export async function queryP2PMarket(
  functionName: string,
  params: unknown[],
): Promise<ethers.Result> {
  const contractAddress = getP2PMarketAddress();

  const { api } = await assetHubProvider.get();
  const iface = new ethers.Interface(P2PMarketArtifact.abi);
  const calldata = iface.encodeFunctionData(functionName, params);

  const result = await api.apis.ReviveApi.call(
    ALICE_SS58_ADDRESS,
    addressToH160(contractAddress),
    BigInt(0),
    undefined,
    undefined,
    Binary.fromHex(calldata),
  );

  if (!result.result.success) {
    throw new Error(
      `${functionName} failed: ${JSON.stringify(result.result.value)}`,
    );
  }

  const returnData = Binary.toHex(result.result.value.data);
  // Empty response (0x) means the function isn't on the deployed contract —
  // typically because the deployed bytecode is older than the local ABI.
  if (returnData === "0x") {
    throw new FunctionMissingError(functionName);
  }
  return iface.decodeFunctionResult(functionName, returnData);
}

/** Write transaction against the P2PMarket contract (signs and submits). */
export async function submitP2PMarketCall(
  originAddress: string,
  signer: PolkadotSigner,
  calldata: string,
  value: bigint = BigInt(0),
): Promise<{ txHash: string }> {
  const contractAddress = getP2PMarketAddress();

  const { api } = await assetHubProvider.get();

  // Non-blocking gas-balance hint for every P2PMarket write (gas is paid from
  // native balance — PGAS does not sponsor it).
  await warnIfLowGasBalance(api, originAddress);

  // Accounts are auto-mapped by pallet-revive's AutoMapper on Paseo Next v2,
  // so we no longer pre-flight `map_account`.

  const tx = api.tx.Revive.call({
    dest: addressToH160(contractAddress),
    value,
    weight_limit: {
      ref_time: BigInt("50000000000"),
      proof_size: BigInt("1000000"),
    },
    storage_deposit_limit: BigInt("10000000000"),
    data: Binary.fromHex(calldata),
  });

  const result = await Promise.race([
    tx.signAndSubmit(signer, { mortality: { mortal: true, period: 2048 } }),
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(new Error("Transaction signing timed out. Please try again.")),
        SIGN_TIMEOUT_MS,
      ),
    ),
  ]);

  const r = result as {
    dispatchError?: unknown;
    block: { hash: string };
  };
  if (r.dispatchError !== undefined && r.dispatchError !== null) {
    const reason = await decodeRevertReason(
      contractAddress,
      originAddress,
      calldata,
      value,
    ).catch(() => null);
    throw new Error(
      reason ?? `Transaction failed: ${JSON.stringify(r.dispatchError)}`,
    );
  }

  return { txHash: r.block.hash };
}

/** Encode a P2PMarket function call. Convenience wrapper for write helpers. */
export function encodeP2PMarketCall(
  functionName: string,
  params: unknown[],
): string {
  const iface = new ethers.Interface(P2PMarketArtifact.abi);
  return iface.encodeFunctionData(functionName, params);
}
