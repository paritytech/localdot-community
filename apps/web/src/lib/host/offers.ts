/**
 * Offer reads and writes against the P2PMarket contract.
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

export interface CreateOfferParams {
  offerType: number;
  amountAvailable: bigint;
  minAmount: bigint;
  flatFee: bigint;
  fiatCurrency: string;
  metadataCID: string;
  agentAddresses: string[];
}

export interface ContractOffer {
  id: bigint;
  owner: string;
  offerType: number;
  amountAvailable: bigint;
  minAmount: bigint;
  pricePerToken: bigint;
  fiatCurrency: string;
  flatFee: bigint;
  active: boolean;
  metadataCID: string;
  createdAt: bigint;
  agentAddresses: string[];
}

/** Query all offers (read-only). Returns [] when the contract isn't deployed. */
export async function getAllOffers(): Promise<ContractOffer[]> {
  const contractAddress = env.VITE_P2PMARKET_ADDRESS;
  if (!contractAddress || contractAddress === ZERO_ADDRESS) {
    console.warn(
      "[Contract] Smart contract not deployed yet, returning empty offers",
    );
    return [];
  }

  const { api } = await assetHubProvider.get();
  const iface = new ethers.Interface(P2PMarketArtifact.abi);
  const calldata = iface.encodeFunctionData("getAllOffers", []);

  const result = await api.apis.ReviveApi.call(
    ALICE_SS58_ADDRESS,
    addressToH160(contractAddress),
    BigInt(0),
    undefined,
    undefined,
    Binary.fromHex(calldata),
  );

  if (!result.result.success) {
    console.error("[Contract] getAllOffers failed:", result);
    throw new Error(`Query failed: ${JSON.stringify(result.result.value)}`);
  }

  const returnData = Binary.toHex(result.result.value.data);
  const decoded = iface.decodeFunctionResult("getAllOffers", returnData);
  const offers = decoded[0];

  return offers.map((o: unknown[]) => {
    return {
      id: o[0] as bigint,
      owner: o[1] as string,
      offerType: Number(o[2]),
      amountAvailable: o[3] as bigint,
      minAmount: o[4] as bigint,
      pricePerToken: o[5] as bigint,
      fiatCurrency: o[6] as string,
      flatFee: o[7] as bigint,
      active: o[8] as boolean,
      metadataCID: o[9] as string,
      createdAt: o[10] as bigint,
      agentAddresses: o[11] as string[],
    };
  });
}

/** Create a new offer (requires signer). */
export async function createOffer(
  originAddress: string,
  signer: PolkadotSigner,
  params: CreateOfferParams,
): Promise<{ offerId: bigint; txHash: string }> {
  // Gas-balance pre-flight is centralized in submitP2PMarketCall (shared by
  // every P2PMarket write), so there's no per-action check here. Gas is paid
  // from native balance — PGAS does not sponsor it; see lib/host/allowances.ts.
  const calldata = encodeP2PMarketCall("createOffer", [
    params.offerType,
    params.amountAvailable,
    params.minAmount,
    params.flatFee,
    params.fiatCurrency,
    params.metadataCID,
    params.agentAddresses.map(toEvmAddress),
  ]);

  // The frontend can query getAllOffers to find the new offer ID.
  const { txHash } = await submitP2PMarketCall(originAddress, signer, calldata);
  return { offerId: 0n, txHash };
}

/** Remove an offer (requires signer, must be offer owner). */
export async function removeOffer(
  originAddress: string,
  signer: PolkadotSigner,
  offerId: bigint,
): Promise<{ txHash: string }> {
  const calldata = encodeP2PMarketCall("removeOffer", [offerId]);
  return await submitP2PMarketCall(originAddress, signer, calldata);
}

/** Add an agent to an existing offer (requires signer, must be offer owner).
 *  Lets a provider opt into agents that registered after the offer existed. */
export async function addAgentToOffer(
  originAddress: string,
  signer: PolkadotSigner,
  offerId: bigint,
  agent: string,
): Promise<{ txHash: string }> {
  const calldata = encodeP2PMarketCall("addAgentToOffer", [
    offerId,
    toEvmAddress(agent),
  ]);
  return await submitP2PMarketCall(originAddress, signer, calldata);
}

/** Query offer ids that are past their TTL but still in contract storage. */
export async function getExpiredOfferIds(): Promise<bigint[]> {
  const contractAddress = env.VITE_P2PMARKET_ADDRESS;
  if (!contractAddress || contractAddress === ZERO_ADDRESS) {
    return [];
  }

  const { api } = await assetHubProvider.get();
  const iface = new ethers.Interface(P2PMarketArtifact.abi);
  const calldata = iface.encodeFunctionData("getExpiredOfferIds", []);

  const result = await api.apis.ReviveApi.call(
    ALICE_SS58_ADDRESS,
    addressToH160(contractAddress),
    BigInt(0),
    undefined,
    undefined,
    Binary.fromHex(calldata),
  );

  if (!result.result.success) {
    console.warn("[Contract] getExpiredOfferIds failed:", result);
    return [];
  }

  const returnData = Binary.toHex(result.result.value.data);
  // Empty response (0x) means the deployed bytecode predates this function —
  // older deploys simply have no prune surface. Degrade silently.
  if (returnData === "0x") return [];

  const decoded = iface.decodeFunctionResult("getExpiredOfferIds", returnData);
  return (decoded[0] as bigint[]) ?? [];
}

/** Batch-prune expired offers (requires signer). Silently no-op for ids that
 *  aren't expired, so passing a stale list is safe. */
export async function pruneExpiredOffers(
  originAddress: string,
  signer: PolkadotSigner,
  offerIds: bigint[],
): Promise<{ txHash: string }> {
  const calldata = encodeP2PMarketCall("pruneExpiredOffers", [offerIds]);
  return await submitP2PMarketCall(originAddress, signer, calldata);
}
