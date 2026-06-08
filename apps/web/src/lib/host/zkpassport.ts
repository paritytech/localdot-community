/**
 * ZKPassportRegistry contract — verification attestations & lookups.
 */

import { ethers } from "ethers";
import type { PolkadotSigner } from "polkadot-api";
import { Binary } from "polkadot-api";

import ZKPassportRegistryArtifact from "../../abi/ZKPassportRegistry.json";
import { env } from "../../env";
import { ZERO_ADDRESS } from "../format";
import {
  addressToH160,
  ALICE_SS58_ADDRESS,
  FunctionMissingError,
  toEvmAddress,
  warnIfLowGasBalance,
} from "./_internal";
import { assetHubProvider } from "./assethub-provider";

const SIGN_TIMEOUT_MS = 60_000;
const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

export interface ZKPassportAttestation {
  uniqueIdHash: string;
  verifiedAt: bigint;
  countryCode: string;
}

function getZKPassportRegistryAddress(): string {
  const contractAddress = env.VITE_ZKPASSPORT_REGISTRY_ADDRESS;
  if (!contractAddress || contractAddress === ZERO_ADDRESS) {
    throw new Error("ZKPassportRegistry contract not deployed");
  }
  return contractAddress;
}

async function queryRegistry(
  functionName: string,
  params: unknown[],
): Promise<ethers.Result> {
  const contractAddress = getZKPassportRegistryAddress();

  const { api } = await assetHubProvider.get();
  const iface = new ethers.Interface(ZKPassportRegistryArtifact.abi);
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
  if (returnData === "0x") {
    throw new FunctionMissingError(functionName);
  }
  return iface.decodeFunctionResult(functionName, returnData);
}

async function submitRegistryCall(
  originAddress: string,
  signer: PolkadotSigner,
  calldata: string,
): Promise<{ txHash: string }> {
  const contractAddress = getZKPassportRegistryAddress();

  const { api } = await assetHubProvider.get();

  // Non-blocking gas-balance hint for every registry write (gas is paid from
  // native balance — PGAS does not sponsor it).
  await warnIfLowGasBalance(api, originAddress);

  // Accounts are auto-mapped by pallet-revive's AutoMapper on Paseo Next v2,
  // so we no longer pre-flight `map_account`.

  const tx = api.tx.Revive.call({
    dest: addressToH160(contractAddress),
    value: BigInt(0),
    weight_limit: {
      ref_time: BigInt("50000000000"),
      proof_size: BigInt("1000000"),
    },
    storage_deposit_limit: BigInt("10000000000"),
    data: Binary.fromHex(calldata),
  });

  // Use a timeout flag so a late wallet approval doesn't double-resolve.
  return await new Promise<{ txHash: string }>((resolve, reject) => {
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      reject(
        new Error(
          "Transaction signing timed out. Check your wallet - if you approved, the transaction may still complete.",
        ),
      );
    }, SIGN_TIMEOUT_MS);

    tx.signAndSubmit(signer, { mortality: { mortal: true, period: 2048 } })
      .then((result: unknown) => {
        if (timedOut) return;
        clearTimeout(timeout);

        const r = result as {
          dispatchError?: unknown;
          block: { hash: string };
        };
        if (r.dispatchError !== undefined && r.dispatchError !== null) {
          reject(
            new Error(`Transaction failed: ${JSON.stringify(r.dispatchError)}`),
          );
          return;
        }
        resolve({ txHash: r.block.hash });
      })
      .catch((err: unknown) => {
        if (timedOut) return;
        clearTimeout(timeout);
        reject(err);
      });
  });
}

/** Check if a wallet has a verified zkpassport attestation. */
export async function isZKPassportVerified(
  walletAddress: string,
): Promise<boolean> {
  try {
    const decoded = await queryRegistry("isVerified", [
      toEvmAddress(walletAddress),
    ]);
    return decoded[0] as boolean;
  } catch (err) {
    if (err instanceof FunctionMissingError) return false;
    if (err instanceof Error && err.message.includes("contract not deployed")) {
      return false;
    }
    throw err;
  }
}

/** Get attestation details for a wallet (read-only). */
export async function getZKPassportAttestation(
  walletAddress: string,
): Promise<ZKPassportAttestation | null> {
  try {
    const decoded = await queryRegistry("getAttestation", [
      toEvmAddress(walletAddress),
    ]);
    const uniqueIdHash = decoded[0] as string;
    const verifiedAt = decoded[1] as bigint;
    const countryCode = decoded[2] as string;

    if (uniqueIdHash === ZERO_BYTES32) return null;

    return { uniqueIdHash, verifiedAt, countryCode };
  } catch (err) {
    if (err instanceof Error && err.message.includes("contract not deployed")) {
      return null;
    }
    throw err;
  }
}

/** Check if a uniqueIdHash is already used (read-only). */
export async function isUniqueIdUsed(uniqueIdHash: string): Promise<boolean> {
  try {
    const decoded = await queryRegistry("isUniqueIdUsed", [uniqueIdHash]);
    return decoded[0] as boolean;
  } catch (err) {
    if (err instanceof Error && err.message.includes("contract not deployed")) {
      return false;
    }
    throw err;
  }
}

/** Get the wallet address associated with a uniqueIdHash (read-only). */
export async function getWalletByUniqueId(
  uniqueIdHash: string,
): Promise<string | null> {
  try {
    const decoded = await queryRegistry("getWalletByUniqueId", [uniqueIdHash]);
    const wallet = decoded[0] as string;
    if (wallet === ZERO_ADDRESS) return null;
    return wallet;
  } catch (err) {
    if (err instanceof Error && err.message.includes("contract not deployed")) {
      return null;
    }
    throw err;
  }
}

/**
 * Submit a zkpassport attestation (requires signer).
 *
 * @param uniqueIdHash keccak256 hash of the zkpassport unique identifier
 * @param countryCode 2-byte country code (e.g., "0x5553" for "US") or "0x0000" for none
 */
export async function submitZKPassportAttestation(
  originAddress: string,
  signer: PolkadotSigner,
  uniqueIdHash: string,
  countryCode: string,
): Promise<{ txHash: string }> {
  const iface = new ethers.Interface(ZKPassportRegistryArtifact.abi);
  const calldata = iface.encodeFunctionData("submitAttestation", [
    uniqueIdHash,
    countryCode,
  ]);
  return await submitRegistryCall(originAddress, signer, calldata);
}

/** Revoke the caller's zkpassport attestation (requires signer). */
export async function revokeZKPassportAttestation(
  originAddress: string,
  signer: PolkadotSigner,
): Promise<{ txHash: string }> {
  const iface = new ethers.Interface(ZKPassportRegistryArtifact.abi);
  const calldata = iface.encodeFunctionData("revokeAttestation", []);
  return await submitRegistryCall(originAddress, signer, calldata);
}
