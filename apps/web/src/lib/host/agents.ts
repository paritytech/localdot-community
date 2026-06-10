/**
 * Agent reads and writes against the P2PMarket contract,
 * including agent insurance staking.
 */

import { ethers } from "ethers";
import type { PolkadotSigner } from "polkadot-api";
import { Binary } from "polkadot-api";

import P2PMarketArtifact from "../../abi/P2PMarket.json";
import { env } from "../../env";
import { ZERO_ADDRESS } from "../format";
import { addressToH160, ALICE_SS58_ADDRESS, toEvmAddress } from "./_internal";
import { encodeP2PMarketCall, submitP2PMarketCall } from "./_p2p-market-call";
import { assetHubProvider } from "./assethub-provider";

export interface ContractAgent {
  wallet: string;
  name: string;
  metadataCID: string;
  flatFee: bigint;
  active: boolean;
  registeredAt: bigint;
  stakedAmount: bigint;
  holdHours: number;
  extraHourFee: bigint;
}

export interface RegisterAgentParams {
  name: string;
  metadataCID: string;
  flatFee: bigint;
  holdHours: number;
  extraHourFee: bigint;
}

function decodeAgent(a: unknown[]): ContractAgent {
  return {
    wallet: a[0] as string,
    name: a[1] as string,
    metadataCID: a[2] as string,
    flatFee: a[3] as bigint,
    active: a[4] as boolean,
    registeredAt: a[5] as bigint,
    stakedAmount: a[6] as bigint,
    holdHours: Number(a[7]),
    extraHourFee: a[8] as bigint,
  };
}

/** Query all active agents (read-only). */
export async function getAllAgents(): Promise<ContractAgent[]> {
  const contractAddress = env.VITE_P2PMARKET_ADDRESS;
  if (!contractAddress || contractAddress === ZERO_ADDRESS) {
    return [];
  }

  const { api } = await assetHubProvider.get();
  const iface = new ethers.Interface(P2PMarketArtifact.abi);
  const calldata = iface.encodeFunctionData("getAllAgents", []);

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
      `getAllAgents failed: ${JSON.stringify(result.result.value)}`,
    );
  }

  const returnData = Binary.toHex(result.result.value.data);
  const decoded = iface.decodeFunctionResult("getAllAgents", returnData);
  return (decoded[0] as unknown[][]).map(decodeAgent);
}

/** Get a single agent by wallet address (returns active AND inactive agents). */
export async function getAgent(
  walletAddress: string,
): Promise<ContractAgent | null> {
  const contractAddress = env.VITE_P2PMARKET_ADDRESS;
  if (!contractAddress || contractAddress === ZERO_ADDRESS) {
    return null;
  }

  const { api } = await assetHubProvider.get();
  const iface = new ethers.Interface(P2PMarketArtifact.abi);
  const calldata = iface.encodeFunctionData("getAgent", [
    toEvmAddress(walletAddress),
  ]);

  const result = await api.apis.ReviveApi.call(
    ALICE_SS58_ADDRESS,
    addressToH160(contractAddress),
    BigInt(0),
    undefined,
    undefined,
    Binary.fromHex(calldata),
  );

  if (!result.result.success) {
    return null;
  }

  const returnData = Binary.toHex(result.result.value.data);
  try {
    const decoded = iface.decodeFunctionResult("getAgent", returnData);
    return decodeAgent(decoded[0]);
  } catch {
    return null;
  }
}

/** Register as a handoff agent (requires signer). msg.value optionally stakes insurance. */
export async function registerAgent(
  originAddress: string,
  signer: PolkadotSigner,
  params: RegisterAgentParams,
  stakeAmount: bigint = 0n,
): Promise<{ txHash: string }> {
  const calldata = encodeP2PMarketCall("registerAgent", [
    params.name,
    params.metadataCID,
    params.flatFee,
    params.holdHours,
    params.extraHourFee,
  ]);
  return await submitP2PMarketCall(
    originAddress,
    signer,
    calldata,
    stakeAmount,
  );
}

/** Update agent info (requires signer, must be the agent). */
export async function updateAgent(
  originAddress: string,
  signer: PolkadotSigner,
  params: RegisterAgentParams,
): Promise<{ txHash: string }> {
  const calldata = encodeP2PMarketCall("updateAgent", [
    params.name,
    params.metadataCID,
    params.flatFee,
    params.holdHours,
    params.extraHourFee,
  ]);
  return await submitP2PMarketCall(originAddress, signer, calldata);
}

/** Deactivate agent — temporary, links preserved (requires signer). */
export async function deactivateAgent(
  originAddress: string,
  signer: PolkadotSigner,
): Promise<{ txHash: string }> {
  const calldata = encodeP2PMarketCall("deactivateAgent", []);
  return await submitP2PMarketCall(originAddress, signer, calldata);
}

/** Reactivate a previously deactivated agent (requires signer). */
export async function reactivateAgent(
  originAddress: string,
  signer: PolkadotSigner,
): Promise<{ txHash: string }> {
  const calldata = encodeP2PMarketCall("reactivateAgent", []);
  return await submitP2PMarketCall(originAddress, signer, calldata);
}

/** Permanently remove agent — cleans all offer links (requires signer). */
export async function removeAgent(
  originAddress: string,
  signer: PolkadotSigner,
): Promise<{ txHash: string }> {
  const calldata = encodeP2PMarketCall("removeAgent", []);
  return await submitP2PMarketCall(originAddress, signer, calldata);
}

/** Get all offer IDs for a specific agent (read-only). */
export async function getOffersByAgent(
  agentAddress: string,
): Promise<bigint[]> {
  const contractAddress = env.VITE_P2PMARKET_ADDRESS;
  if (!contractAddress || contractAddress === ZERO_ADDRESS) {
    return [];
  }

  const { api } = await assetHubProvider.get();
  const iface = new ethers.Interface(P2PMarketArtifact.abi);
  const calldata = iface.encodeFunctionData("getOffersByAgent", [
    toEvmAddress(agentAddress),
  ]);

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
      `getOffersByAgent failed: ${JSON.stringify(result.result.value)}`,
    );
  }

  const returnData = Binary.toHex(result.result.value.data);
  const decoded = iface.decodeFunctionResult("getOffersByAgent", returnData);
  return decoded[0] as bigint[];
}

/** Add insurance stake to an existing agent (requires signer). */
export async function stakeInsurance(
  originAddress: string,
  signer: PolkadotSigner,
  amount: bigint,
): Promise<{ txHash: string }> {
  const calldata = encodeP2PMarketCall("stakeInsurance", []);
  return await submitP2PMarketCall(originAddress, signer, calldata, amount);
}

/** Withdraw insurance stake from an agent (requires signer). */
export async function unstakeInsurance(
  originAddress: string,
  signer: PolkadotSigner,
  amount: bigint,
): Promise<{ txHash: string }> {
  const calldata = encodeP2PMarketCall("unstakeInsurance", [amount]);
  return await submitP2PMarketCall(originAddress, signer, calldata);
}
