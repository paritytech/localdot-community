/**
 * Escrow / trade reads and writes against the P2PMarket contract.
 */

import type { PolkadotSigner } from "polkadot-api";

import { FunctionMissingError, toEvmAddress } from "./_internal";
import {
  encodeP2PMarketCall,
  queryP2PMarket,
  submitP2PMarketCall,
} from "./_p2p-market-call";

export interface ContractTrade {
  id: bigint;
  offerId: bigint;
  locker: string;
  counterparty: string;
  agent: string;
  amount: bigint;
  /** 0=LOCKED, 1=RELEASED, 2=COMPLETED, 3=REFUNDED, 4=CANCELLED */
  state: number;
  lockerConfirmed: boolean;
  counterpartyConfirmed: boolean;
  lockerCancelRequested: boolean;
  counterpartyCancelRequested: boolean;
  lockedAt: bigint;
  pickupDeadline: bigint;
  evidenceCID: string;
}

function decodeTrade(t: unknown[]): ContractTrade {
  return {
    id: t[0] as bigint,
    offerId: t[1] as bigint,
    locker: t[2] as string,
    counterparty: t[3] as string,
    agent: t[4] as string,
    amount: t[5] as bigint,
    state: Number(t[6]),
    lockerConfirmed: t[7] as boolean,
    counterpartyConfirmed: t[8] as boolean,
    lockerCancelRequested: t[9] as boolean,
    counterpartyCancelRequested: t[10] as boolean,
    lockedAt: t[11] as bigint,
    pickupDeadline: t[12] as bigint,
    evidenceCID: (t[13] as string) ?? "",
  };
}

/** Get a single trade by ID (read-only). */
export async function getTrade(tradeId: bigint): Promise<ContractTrade> {
  const decoded = await queryP2PMarket("getTrade", [tradeId]);
  return decodeTrade(decoded[0]);
}

/**
 * Get all trade IDs for a user (read-only).
 * Returns [] if escrow isn't on the deployed contract yet.
 */
export async function getUserTrades(userAddress: string): Promise<bigint[]> {
  try {
    const decoded = await queryP2PMarket("getUserTrades", [
      toEvmAddress(userAddress),
    ]);
    return decoded[0] as bigint[];
  } catch (err) {
    if (err instanceof FunctionMissingError) {
      console.warn(
        `[Contract] getUserTrades not on deployed contract — escrow not deployed yet.`,
      );
      return [];
    }
    throw err;
  }
}

/** Lock native tokens for a trade (payable — sends `amount` planck to the contract). */
export async function lockTrade(
  originAddress: string,
  signer: PolkadotSigner,
  counterparty: string,
  offerId: bigint,
  agent: string,
  amount: bigint,
): Promise<{ txHash: string }> {
  const calldata = encodeP2PMarketCall("lockTrade", [
    toEvmAddress(counterparty),
    offerId,
    toEvmAddress(agent),
  ]);
  return await submitP2PMarketCall(originAddress, signer, calldata, amount);
}

/** Confirm trade handover (auto-releases when all required parties confirm). */
export async function confirmTrade(
  originAddress: string,
  signer: PolkadotSigner,
  tradeId: bigint,
): Promise<{ txHash: string }> {
  const calldata = encodeP2PMarketCall("confirmTrade", [tradeId]);
  return await submitP2PMarketCall(originAddress, signer, calldata);
}

/** Request mutual cancel (both locker and counterparty must request). */
export async function requestCancel(
  originAddress: string,
  signer: PolkadotSigner,
  tradeId: bigint,
): Promise<{ txHash: string }> {
  const calldata = encodeP2PMarketCall("requestCancel", [tradeId]);
  return await submitP2PMarketCall(originAddress, signer, calldata);
}

/** Refund locker after 24h timeout (anyone can call). */
export async function refundTrade(
  originAddress: string,
  signer: PolkadotSigner,
  tradeId: bigint,
): Promise<{ txHash: string }> {
  const calldata = encodeP2PMarketCall("refundTrade", [tradeId]);
  return await submitP2PMarketCall(originAddress, signer, calldata);
}

/** Agent confirms cash received from buyer → tokens release to buyer (agent trades only). */
export async function confirmCashReceived(
  originAddress: string,
  signer: PolkadotSigner,
  tradeId: bigint,
): Promise<{ txHash: string }> {
  const calldata = encodeP2PMarketCall("confirmCashReceived", [tradeId]);
  return await submitP2PMarketCall(originAddress, signer, calldata);
}

/** Provider confirms cash pickup from agent → trade complete (agent trades only). */
export async function confirmPickup(
  originAddress: string,
  signer: PolkadotSigner,
  tradeId: bigint,
): Promise<{ txHash: string }> {
  const calldata = encodeP2PMarketCall("confirmPickup", [tradeId]);
  return await submitP2PMarketCall(originAddress, signer, calldata);
}

/**
 * Attach a Bulletin Chain CID with handoff evidence (e.g. video) to a trade.
 * Either trade party (locker or counterparty) can call.
 */
export async function setEvidenceCID(
  originAddress: string,
  signer: PolkadotSigner,
  tradeId: bigint,
  cid: string,
): Promise<{ txHash: string }> {
  const calldata = encodeP2PMarketCall("setEvidenceCID", [tradeId, cid]);
  return await submitP2PMarketCall(originAddress, signer, calldata);
}
