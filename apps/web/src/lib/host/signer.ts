/**
 * Host API signer — Paseo Next v2 / Polkadot Desktop 0.7.9+ / Polkadot App iOS v2.
 *
 * Uses the product-account flow with the modern `createTransaction` slot:
 *  - `accounts.getProductAccount(window.location.host, 0)` resolves the
 *    product-derived account from the host.
 *  - `accounts.getProductAccountSigner(account, 'createTransaction')` returns a
 *    `PolkadotSigner` whose `signTx` forwards EVERY signed-extension's real
 *    `extra` + `additionalSigned` bytes (computed by PAPI against the live
 *    Asset Hub Next metadata) to `host.createTransaction`. The host rebuilds
 *    and signs the extrinsic from those exact bytes.
 *
 * Why not the legacy `signPayload` slot:
 *  Asset Hub Next declares custom signed-extensions — `AuthorizeCall`,
 *  `AsPgas`, `AsRingAlias`, `EthSetOrigin`, … — that PAPI's pjs-signer can't
 *  encode. The old workaround zeroed those out and relied on the iOS app to
 *  reconstruct them from its own runtime metadata, but the iOS legacy
 *  `signPayload` builder only knows a hardcoded minimal extension set
 *  (ChargeAssetTxPayment + the standard Check* ones). It silently drops
 *  `EthSetOrigin` (the EVM/H160 origin needed for `Revive.call`) and the
 *  PGAS/alias extensions, so the signed payload diverges from what the chain
 *  recomputes → `BadProof`. The `createTransaction` slot — now fully wired on
 *  both iOS (native + SSO `createTransactionRequest`) and Desktop
 *  (`handleCreateTransaction`) — avoids this entirely by transmitting the
 *  complete extension bytes.
 */

import { accounts } from "@novasamatech/host-api-wrapper";
import { AccountId } from "polkadot-api";
import type { PolkadotSigner } from "polkadot-api/signer";

const accountIdCodec = AccountId();
const DERIVATION_INDEX = 0;

interface HostAccount {
  signer: PolkadotSigner;
  address: string;
  name: string;
}

let cachedAccount: HostAccount | null = null;

function getProductIdentifier(): string {
  if (typeof window === "undefined") {
    throw new Error("Host signer requires a window context");
  }
  const identifier = window.location.host;
  if (!identifier) {
    throw new Error(
      "Could not determine product identifier from window.location.host",
    );
  }
  return identifier;
}

async function buildHostSigner(): Promise<HostAccount> {
  if (cachedAccount) return cachedAccount;

  const identifier = getProductIdentifier();
  const result = await accounts.getProductAccount(identifier, DERIVATION_INDEX);

  const productAccount = result.match(
    (v) => v,
    (e) => {
      throw new Error(
        `Failed to fetch product account from host (identifier=${identifier}): ${JSON.stringify(e)}`,
      );
    },
  );

  const signer = accounts.getProductAccountSigner(
    productAccount,
    "createTransaction",
  );

  const address = accountIdCodec.dec(productAccount.publicKey);
  const name = `Triangle (${identifier})`;

  cachedAccount = { signer, address, name };
  return cachedAccount;
}

export async function getHostSigner(): Promise<PolkadotSigner> {
  const { signer } = await buildHostSigner();
  return signer;
}

export async function getHostAddress(): Promise<string> {
  const { address } = await buildHostSigner();
  return address;
}

export async function getHostSignerAndAddress(): Promise<{
  signer: PolkadotSigner;
  address: string;
}> {
  const { signer, address } = await buildHostSigner();
  return { signer, address };
}

export async function getHostAccount(): Promise<{
  address: string;
  name: string;
  polkadotSigner: PolkadotSigner;
}> {
  const { signer, address, name } = await buildHostSigner();
  return { address, name, polkadotSigner: signer };
}
