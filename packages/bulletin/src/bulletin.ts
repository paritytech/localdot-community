import { bulletin } from "@polkadot-api/descriptors";
import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import {
  DEV_PHRASE,
  entropyToMiniSecret,
  mnemonicToEntropy,
} from "@polkadot-labs/hdkd-helpers";
import { createClient } from "polkadot-api";
import { getPolkadotSigner } from "polkadot-api/signer";
import { getWsProvider } from "polkadot-api/ws";

import { calculateCID } from "./cid.js";

export interface UploadOptions {
  accountSeed?: string;
  ipfsGateway?: string;
  bulletinEndpoint?: string;
}

export interface UploadResult {
  cid: string;
  blockHash: string;
  gatewayUrl: string;
}

/**
 * Create a signer for dev accounts (//Alice, //Bob, etc.)
 */
function createDevSigner(derivationPath: string) {
  const entropy = mnemonicToEntropy(DEV_PHRASE);
  const miniSecret = entropyToMiniSecret(entropy);
  const derive = sr25519CreateDerive(miniSecret);
  const keypair = derive(derivationPath);

  return getPolkadotSigner(keypair.publicKey, "Sr25519", keypair.sign);
}

/**
 * Check transaction result for errors and extract block hash
 */
function checkTransactionResult(result: unknown): { blockHash: string } {
  const resultWithError = result as {
    dispatchError?: unknown;
    block: { hash: string };
  };
  if (
    resultWithError.dispatchError !== undefined &&
    resultWithError.dispatchError !== null
  ) {
    const errorDetails =
      typeof resultWithError.dispatchError === "object"
        ? JSON.stringify(resultWithError.dispatchError)
        : String(resultWithError.dispatchError);
    throw new Error(`Transaction dispatch error: ${errorDetails}`);
  }
  return { blockHash: resultWithError.block.hash };
}

/**
 * Upload file bytes to Bulletin Chain
 * @param fileBytes - The file content as Uint8Array
 * @param options - Upload options including account seed
 * @returns Upload result with CID, block hash, and gateway URL
 */
export async function uploadToBulletin(
  fileBytes: Uint8Array,
  options: UploadOptions = {} as UploadOptions,
): Promise<UploadResult> {
  const { accountSeed = "//Alice" } = options;

  if (!options.bulletinEndpoint) {
    throw new Error(
      "bulletinEndpoint is required. Please set environment variable.",
    );
  }
  if (!options.ipfsGateway) {
    throw new Error(
      "ipfsGateway is required. Please set environment variable.",
    );
  }

  console.log("Calculating CID...");
  const cid = calculateCID(fileBytes);

  console.log("Connecting to Bulletin...");

  const wsProvider = getWsProvider(options.bulletinEndpoint);
  const client = createClient(wsProvider);

  try {
    const api = client.getTypedApi(bulletin);
    const signer = createDevSigner(accountSeed);

    console.log("Submitting to blockchain...");

    const storeCall = api.tx.TransactionStorage.store({
      data: fileBytes,
    });

    const result = await storeCall.signAndSubmit(signer);
    const { blockHash } = checkTransactionResult(result);

    console.log("Transaction included in block");

    return {
      cid,
      blockHash,
      gatewayUrl: `${options.ipfsGateway}${cid}`,
    };
  } finally {
    try {
      client.destroy();
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.warn("Failed to destroy client:", err);
      }
    }
  }
}
