/**
 * Deploy P2PMarket via pallet-revive instantiate_with_code (PAPI).
 *
 * LocalDOT's contract is normally deployed with Hardhat/ethers over the eth-rpc
 * proxy (see packages/contracts/scripts/deploy.ts). This module is the
 * Substrate-native path used by the one-shot interactive deploy (scripts/deploy.ts):
 * it signs the instantiate with the SAME 12/24-word mnemonic that polkadot-app-deploy
 * later uses to publish the frontend, so a single secret takes an operator from
 * nothing to a live product.
 *
 * The deployer is supplied as a PolkadotSigner bundle derived from a mnemonic.
 * We do NOT call Revive.map_account: Asset Hub Next runs pallet-revive's
 * AutoMapper, so the SS58 ↔ H160 mapping is created on first use (the instantiate
 * itself). The deployer's H160 is keccak256(pubkey)[12:32] — pallet-revive's
 * `to_address` for a plain AccountId32 — which is the address AutoMapper assigns.
 *
 * On success it writes the deployed P2PMarket H160 into apps/web/.env.local so
 * the next `vite build` inlines it.
 *
 * Usage (standalone):
 *   DEPLOYER_SEED="twelve or twenty-four words ..." pnpm tsx scripts/deploy-p2pmarket.ts
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, Binary } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws";
import { getPolkadotSigner, type PolkadotSigner } from "polkadot-api/signer";
import { sr25519CreateDerive } from "@polkadot-labs/hdkd";
import {
  entropyToMiniSecret,
  mnemonicToEntropy,
} from "@polkadot-labs/hdkd-helpers";
import { keccakAsU8a, encodeAddress } from "@polkadot/util-crypto";

import * as ui from "./lib/style";

const REPO_ROOT = resolve(__dirname, "..");
// Hardhat + resolc writes the PolkaVM blob into the standard artifact `bytecode`
// field. Compile first (pnpm download:binaries && pnpm contracts:compile) — the
// interactive deploy does this automatically.
const ARTIFACT_PATH = resolve(
  REPO_ROOT,
  "packages/contracts/artifacts/contracts/P2PMarket.sol/P2PMarket.json",
);
const WEB_ENV_PATH = resolve(REPO_ROOT, "apps/web/.env.local");

const GAS_MULTIPLIER = 4n;
const CONTRACT_LABEL = "P2PMarket";

/** Target chain — Paseo Asset Hub Next (v2), where pallet-revive contracts live. */
export const NETWORK = {
  key: "paseo-next-v2",
  displayName: "Paseo Asset Hub Next (v2)",
  wsUrl: "wss://paseo-asset-hub-next-rpc.polkadot.io",
  genesisHash:
    "0xbf0488dbe9daa1de1c08c5f743e26fdc2a4ecd74cf87dd1b4b1eeb99ae4ef19f",
  /** EVM chainId surfaced to the app (display / wrong-network badge). */
  chainId: 420420417,
  /** eth-rpc proxy — stored in .env.local for the app; not used for contract I/O. */
  rpcUrl: "https://eth-rpc-paseo-next.polkadot.io",
  nativeToken: { symbol: "PAS", decimals: 10 },
} as const;

export interface DeployResult {
  contractAddress: `0x${string}`;
  txHash: string;
  ss58: string;
  h160: `0x${string}`;
}

/** What deployP2PMarket needs to sign: a PolkadotSigner plus its addresses. */
export interface Deployer {
  signer: PolkadotSigner;
  ss58: string;
  h160: `0x${string}`;
}

interface SignerBundle extends Deployer {
  publicKey: Uint8Array;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** pallet-revive maps a native AccountId32 -> H160 as keccak256(pubkey)[12..32]. */
function deriveH160(publicKey: Uint8Array): `0x${string}` {
  return `0x${bytesToHex(keccakAsU8a(publicKey).slice(12, 32))}` as `0x${string}`;
}

/** SS58 (generic substrate prefix 42) + H160 for a public key. */
export function accountFromPublicKey(publicKey: Uint8Array): {
  ss58: string;
  h160: `0x${string}`;
} {
  return { ss58: encodeAddress(publicKey, 42), h160: deriveH160(publicKey) };
}

function createSigner(seed: string): SignerBundle {
  const miniSecret = entropyToMiniSecret(mnemonicToEntropy(seed));
  const derive = sr25519CreateDerive(miniSecret);
  const keyPair = derive("");
  const publicKey = keyPair.publicKey;
  const { ss58, h160 } = accountFromPublicKey(publicKey);
  return {
    signer: getPolkadotSigner(publicKey, "Sr25519", keyPair.sign),
    publicKey,
    ss58,
    h160,
  };
}

/** Build a deployer (signer + addresses) from a 12/24-word mnemonic. */
export function deployerFromSeed(seed: string): Deployer {
  const { signer, ss58, h160 } = createSigner(seed);
  return { signer, ss58, h160 };
}

/** Derive the deployer's SS58 + H160 addresses from a seed (for display). */
export function deriveAccount(seed: string): { ss58: string; h160: `0x${string}` } {
  const { ss58, h160 } = createSigner(seed);
  return { ss58, h160 };
}

/**
 * Read the deployer's free balance on Asset Hub Next — the chain where the
 * deployer holds PAS and where the contract instantiates. Opens a short-lived
 * PAPI client so the interactive deploy can gate on funding before it spends.
 */
export async function fetchBalance(
  ss58: string,
): Promise<{ planck: bigint; decimals: number; symbol: string }> {
  const client = createClient(getWsProvider(NETWORK.wsUrl));
  try {
    const api = client.getUnsafeApi();
    const account = (await api.query.System.Account.getValue(ss58)) as any;
    const free = (account?.data?.free ?? 0n) as bigint;
    return {
      planck: free,
      decimals: NETWORK.nativeToken.decimals,
      symbol: NETWORK.nativeToken.symbol,
    };
  } finally {
    client.destroy();
  }
}

/** Read the compiled PolkaVM bytecode from the Hardhat artifact. */
function loadBytecode(): `0x${string}` {
  if (!existsSync(ARTIFACT_PATH)) {
    throw new Error(
      `Missing P2PMarket artifact at ${ARTIFACT_PATH}.\n` +
        "Compile first: pnpm download:binaries && pnpm contracts:compile",
    );
  }
  const artifact = JSON.parse(readFileSync(ARTIFACT_PATH, "utf8"));
  const raw = artifact.bytecode;
  const hex: string | undefined =
    typeof raw === "string" ? raw : typeof raw?.object === "string" ? raw.object : undefined;
  if (!hex || hex === "0x" || hex.length <= 2) {
    throw new Error(
      `P2PMarket artifact has no bytecode — re-run pnpm contracts:compile.`,
    );
  }
  return (hex.startsWith("0x") ? hex : `0x${hex}`) as `0x${string}`;
}

function stringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
}

function extractHex(value: unknown): `0x${string}` | undefined {
  if (typeof value === "string" && value.startsWith("0x")) return value as `0x${string}`;
  if (value && typeof (value as { asHex?: unknown }).asHex === "function") {
    return (value as { asHex(): `0x${string}` }).asHex();
  }
  if (value instanceof Uint8Array) return `0x${bytesToHex(value)}` as `0x${string}`;
  return undefined;
}

async function deployContract(
  api: any,
  signer: PolkadotSigner,
  origin: string,
  dryRunDeposit: bigint,
): Promise<{ contractAddress: `0x${string}`; txHash: string }> {
  const code = loadBytecode();

  ui.step("Deploying via Revive.instantiate_with_code…");

  // P2PMarket's constructor takes no arguments (see packages/contracts deploy),
  // so the constructor data is "0x".
  const dryRun = await api.apis.ReviveApi.instantiate(
    origin,
    0n,
    undefined,
    dryRunDeposit,
    { type: "Upload", value: Binary.fromHex(code) },
    Binary.fromHex("0x"),
    undefined,
  );

  if (!dryRun.result.success) {
    throw new Error(`${CONTRACT_LABEL} dry-run failed: ${stringify(dryRun.result.value)}`);
  }
  if (dryRun.result.value.result?.flags & 1) {
    throw new Error(`${CONTRACT_LABEL} constructor reverted during dry-run.`);
  }

  const weightLimit = {
    ref_time: dryRun.weight_required.ref_time * GAS_MULTIPLIER,
    proof_size: dryRun.weight_required.proof_size * GAS_MULTIPLIER,
  };
  const storageDepositLimit =
    dryRun.storage_deposit.type === "Charge" && dryRun.storage_deposit.value > 0n
      ? dryRun.storage_deposit.value * GAS_MULTIPLIER
      : dryRunDeposit;

  ui.info(`gas ref_time=${weightLimit.ref_time} proof_size=${weightLimit.proof_size}`);
  ui.info(`storage deposit limit ${storageDepositLimit}`);

  const tx = api.tx.Revive.instantiate_with_code({
    value: 0n,
    weight_limit: weightLimit,
    storage_deposit_limit: storageDepositLimit,
    code: Binary.fromHex(code),
    data: Binary.fromHex("0x"),
    salt: undefined,
  });

  const result = await tx.signAndSubmit(signer);
  if (!result.ok) {
    throw new Error(`${CONTRACT_LABEL} deployment failed: ${stringify(result.dispatchError)}`);
  }

  let contractAddress: `0x${string}` | undefined;
  for (const event of result.events) {
    if (event.type !== "Revive") continue;
    const value = event.value as any;
    if (value?.type !== "Instantiated") continue;
    contractAddress = extractHex(value.value?.contract);
    if (contractAddress) break;
  }
  if (!contractAddress) contractAddress = extractHex(dryRun.result.value.account_id);
  if (!contractAddress) {
    throw new Error("Could not determine deployed contract address from events or dry-run.");
  }

  return { contractAddress, txHash: result.txHash as string };
}

/**
 * Idempotently merge `values` into the dotenv file at `path`, preserving
 * comments, blanks, and unrelated keys. Creates the file if it doesn't exist.
 */
function upsertEnvFile(path: string, values: Record<string, string>): void {
  let content = existsSync(path) ? readFileSync(path, "utf8") : "";
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=.*$`, "m");
    if (re.test(content)) content = content.replace(re, line);
    else {
      if (content.length && !content.endsWith("\n")) content += "\n";
      content += `${line}\n`;
    }
  }
  writeFileSync(path, content);
}

/**
 * Deploy a fresh P2PMarket to Asset Hub Next and persist the resulting H160
 * into apps/web/.env.local. Exported so the interactive orchestrator
 * (scripts/deploy.ts) can drive it in-process.
 */
export async function deployP2PMarket(deployer: Deployer): Promise<DeployResult> {
  const { signer, ss58, h160 } = deployer;
  const dryRunDeposit = 50n * 10n ** BigInt(NETWORK.nativeToken.decimals);

  ui.section("Contract");
  ui.kvBlock([
    ["Network", `${NETWORK.displayName} (${NETWORK.key})`],
    ["WS URL", NETWORK.wsUrl],
    ["Deployer SS58", ss58],
    ["Deployer H160", h160],
  ]);

  const client = createClient(getWsProvider(NETWORK.wsUrl));
  try {
    const api = client.getUnsafeApi();
    // No Revive.map_account: Asset Hub Next's AutoMapper creates the SS58 -> H160
    // mapping on first use (this instantiate).
    const { contractAddress, txHash } = await deployContract(api, signer, ss58, dryRunDeposit);

    upsertEnvFile(WEB_ENV_PATH, {
      VITE_P2PMARKET_ADDRESS: contractAddress,
      VITE_CHAIN_ID: String(NETWORK.chainId),
      VITE_RPC_URL: NETWORK.rpcUrl,
    });
    ui.success(`Contract deployed — ${contractAddress}`);
    ui.info(`tx ${txHash}`);
    ui.info("updated apps/web/.env.local");

    return { contractAddress, txHash, ss58, h160 };
  } finally {
    client.destroy();
  }
}

async function main(): Promise<void> {
  const { cryptoWaitReady } = await import("@polkadot/util-crypto");
  await cryptoWaitReady();
  const seed = process.env.DEPLOYER_SEED;
  if (!seed) {
    throw new Error(
      "DEPLOYER_SEED is not set. Export your 12/24-word mnemonic, e.g.\n" +
        '  DEPLOYER_SEED="word1 word2 ... word12" pnpm tsx scripts/deploy-p2pmarket.ts',
    );
  }
  await deployP2PMarket(deployerFromSeed(seed));
}

// Only run when invoked directly (not when imported by the orchestrator).
if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  main().catch((error) => {
    ui.fail(`Deployment failed: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
