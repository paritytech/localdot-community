# /papi - PAPI Chain Integration

Set up Polkadot-API (PAPI) over WSS for Substrate chain interactions on Paseo Next v2.

**Important — how THIS repo actually works:**
- PAPI talks to three Paseo Next v2 chains over **WSS**, using descriptors generated
  against those WSS endpoints: `paseohubnext` (Asset Hub Next), `bulletinnext`
  (Bulletin Next), and `peoplenext` (People Next System). These are **not** the
  well-known `paseo` / `paseoAssetHub` / `paseoPeople` chains, and they are **not**
  bundled as Smoldot light-client specs — none of the Next v2 chains ship as light-client
  specs in `polkadot-api` yet.
- Connection uses `getWsProvider` (from `polkadot-api/ws`) + `createClient`. There is
  **no** Smoldot here — no `getSmProvider`, no `startFromWorker`, no `?worker` import.
- Smart-contract reads and writes also go **through PAPI**, not through an ethers RPC
  transport. Reads are `ReviveApi.call` (dry-run), writes are the `Revive.call` extrinsic.
  ethers v6 is used **only** as an ABI codec (`new ethers.Interface(abi)`) to encode
  calldata and decode results — never as a wallet or JSON-RPC provider. See
  [`apps/web/src/lib/host/_p2p-market-call.ts`](../../apps/web/src/lib/host/_p2p-market-call.ts).

**papi v2 note:** with `polkadot-api` v2, `Binary` is a function namespace
(`Binary.fromHex(...)` / `Binary.toHex(...)`), **not** a class — do not `new Binary()`.

---

## Step 1: Generate Typed Descriptors (Build Time)

PAPI's CLI downloads chain metadata and generates fully-typed TypeScript descriptors.
The three descriptors are added by **WSS URL** (`-w`), not by well-known name (`-n`).
Run these from the `apps/web` directory:

```bash
# Install polkadot-api
pnpm add polkadot-api

# Add the three Paseo Next v2 chains by WSS endpoint
npx papi add paseohubnext -w wss://paseo-asset-hub-next-rpc.polkadot.io     # Asset Hub Next (contracts)
npx papi add bulletinnext -w wss://paseo-bulletin-next-rpc.polkadot.io      # Bulletin Next (storage)
npx papi add peoplenext   -w wss://paseo-people-next-system-rpc.polkadot.io # People Next (Statement Store RPC)

# Generate all type descriptors
npx papi
```

The chain entries above are recorded in
[`apps/web/.papi/polkadot-api.json`](../../apps/web/.papi/polkadot-api.json) (each with
its `wsUrl`, metadata `.scale` path, and genesis/code hash). The Solidity ABI for the
contract is registered there too (`sol.p2p_market`).

`papi` runs as part of the web build (`"build": "papi && tsc && vite build"` in
[`apps/web/package.json`](../../apps/web/package.json)), so descriptors regenerate on
every build. This emits the generated `@polkadot-api/descriptors` package under
`apps/web/.papi/descriptors/dist`, imported as `../../../.papi/descriptors/dist`.

---

## Step 2: Connect over WSS (Runtime)

Connect with `getWsProvider` + `createClient`. No Smoldot, no WebWorker, no chain specs.
This is the pattern used by
[`apps/web/src/lib/host/assethub-provider.ts`](../../apps/web/src/lib/host/assethub-provider.ts):

```typescript
// apps/web/src/lib/host/assethub-provider.ts (shape)
import type { PolkadotClient, TypedApi } from "polkadot-api";
import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws";

import { paseohubnext } from "../../../.papi/descriptors/dist";
import { env } from "../../env";

const ASSET_HUB_RPC =
  env.VITE_ASSET_HUB_ENDPOINT || "wss://paseo-asset-hub-next-rpc.polkadot.io";

const wsProvider = getWsProvider(ASSET_HUB_RPC);
const client: PolkadotClient = createClient(wsProvider);

// Typed API — autocomplete for pallets, storage, tx, runtime APIs, constants
const api: TypedApi<typeof paseohubnext> = client.getTypedApi(paseohubnext);

// e.g. read a Revive runtime constant
const nativeToEthRatio = await api.constants.Revive.NativeToEthRatio();
```

The provider is a lazily-initialized singleton (cached client + typed API, HMR-safe).
People Next is reached separately for the Statement Store — see
[`apps/web/src/lib/statement-store.ts`](../../apps/web/src/lib/statement-store.ts), which
subscribes via `@novasamatech/sdk-statement` over People Next JSON-RPC
(`VITE_PEOPLE_CHAIN_ENDPOINT`).

---

## Smart Contracts Through PAPI (not ethers transport)

P2PMarket runs on PolkaVM behind pallet-revive on Asset Hub Next. All contract traffic
goes through the same PAPI client above — ethers only encodes/decodes the ABI.

**Reads** dry-run via `ReviveApi.call` (origin = any SS58, defaults to
`VITE_READONLY_ORIGIN`, i.e. Alice):

```typescript
const iface = new ethers.Interface(P2PMarketArtifact.abi);
const calldata = iface.encodeFunctionData(functionName, params);

const result = await api.apis.ReviveApi.call(
  ALICE_SS58_ADDRESS,                 // origin (read-only)
  addressToH160(contractAddress),     // dest H160
  BigInt(0),                          // value
  undefined, undefined,               // gas / storage limits (estimated)
  Binary.fromHex(calldata),           // Binary is a namespace, not a class
);

const decoded = iface.decodeFunctionResult(functionName, Binary.toHex(result.result.value.data));
```

**Writes** use the `Revive.call` extrinsic, signed by the host-injected signer.
Native value (PAS) rides along via the `value` field — escrow uses the chain native token,
not an ERC-20:

```typescript
const tx = api.tx.Revive.call({
  dest: addressToH160(contractAddress),
  value,                              // native PAS (lockTrade is payable)
  weight_limit: { ref_time, proof_size },
  storage_deposit_limit,
  data: Binary.fromHex(calldata),
});
await tx.signAndSubmit(signer, { mortality: { mortal: true, period: 2048 } });
```

Accounts are auto-mapped by pallet-revive's `AutoMapper` on Paseo Next v2, so we do **not**
call `Revive.map_account`. Full implementation:
[`apps/web/src/lib/host/_p2p-market-call.ts`](../../apps/web/src/lib/host/_p2p-market-call.ts).

> Gas note: `SmartContractAllowance` only auto-signs `Revive.call` writes (skips the
> per-call modal) — it is **not** gas sponsorship. PGAS sponsorship is not wired, so the
> product account must hold native PAS (faucet on testnet) for any write.

---

## Step 3: Bulletin Chain Client

Bulletin Next is wired today. The Bulletin descriptor is generated against
`wss://paseo-bulletin-next-rpc.polkadot.io`; the upload/read client lives in the
[`packages/bulletin`](../../packages/bulletin) package
([`packages/bulletin/src/bulletin.ts`](../../packages/bulletin/src/bulletin.ts)), and the
app-side adapter is
[`apps/web/src/lib/host/storage.ts`](../../apps/web/src/lib/host/storage.ts).
There is no mock client and no Smoldot fallback — same WSS pattern as Asset Hub:

```typescript
// packages/bulletin/src/bulletin.ts (shape)
import { bulletin } from "@polkadot-api/descriptors";
import { createClient } from "polkadot-api";
import { getWsProvider } from "polkadot-api/ws";

const BULLETIN_RPC =
  options.bulletinEndpoint || "wss://paseo-bulletin-next-rpc.polkadot.io";

const client = createClient(getWsProvider(BULLETIN_RPC));
const api = client.getTypedApi(bulletin);
```

The endpoint env var is **`VITE_BULLETIN_ENDPOINT`** (optional override; defaults to the
Paseo Bulletin Next WSS). Bulletin uploads are signed with `//Alice` directly — the
host (dot.li) does not proxy Bulletin Chain, so this client bypasses the Host API.

---

## Chain Reference

This repo connects to exactly three Paseo Next v2 chains, all by WSS, all via generated
descriptors (no bundled light-client specs):

| Descriptor | Chain | WSS endpoint | Env override |
|------------|-------|--------------|--------------|
| `paseohubnext` | Asset Hub Next (contracts) | `wss://paseo-asset-hub-next-rpc.polkadot.io` | `VITE_ASSET_HUB_ENDPOINT` |
| `bulletinnext` | Bulletin Next (storage) | `wss://paseo-bulletin-next-rpc.polkadot.io` | `VITE_BULLETIN_ENDPOINT` |
| `peoplenext` | People Next System (Statement Store RPC) | `wss://paseo-people-next-system-rpc.polkadot.io` | `VITE_PEOPLE_CHAIN_ENDPOINT` |

EVM-side metadata for the same Asset Hub: chainId `420420417`, eth-rpc
`https://eth-rpc-paseo-next.polkadot.io`, explorer `https://blockscout-paseo-next.polkadot.io`.
Native token PAS (10 decimals). IPFS gateway default
`https://paseo-bulletin-next-ipfs.polkadot.io/ipfs/`.

Reference: https://papi.how/getting-started and https://papi.how/codegen/

---

## Key Architecture Notes

- **PAPI is the single transport for the chain** — Substrate reads/subscriptions
  (Bulletin storage, chain events) **and** smart-contract calls (via pallet-revive's
  `ReviveApi.call` for reads and `Revive.call` for writes) all go through the PAPI
  WSS client.
- **ethers v6 is only an ABI codec** — `new ethers.Interface(P2PMarketArtifact.abi)` to
  encode calldata and decode results. It is never a wallet, never a JSON-RPC provider,
  and there is no Ethereum JSON-RPC proxy in the live read/write path. (The eth-rpc
  endpoint and ethers `JsonRpcProvider` are used by the Hardhat deploy tooling, not the
  app runtime.)
- **No Smoldot, no WebWorker.** Connections are plain WSS via `getWsProvider`
  (`polkadot-api/ws`) + `createClient`. None of the Paseo Next v2 chains ship as
  light-client specs in `polkadot-api` yet, so there is no `?worker`/`startFromWorker`
  path to maintain.
- **`Binary` is a function namespace** in papi v2 — use `Binary.fromHex` / `Binary.toHex`,
  never `new Binary(...)`.
- **AutoMapper handles SS58 ↔ H160** on Asset Hub Next; the product does not call
  `Revive.map_account`.

> The contract is **P2PMarket** (escrowing the chain native token PAS via `msg.value`),
> not an `LocalDOTEscrow` ERC-20 escrow — see `/contracts`. Identity verification is
> **ZKPassport on Asset Hub** (off-chain ZK proof + on-chain `ZKPassportRegistry`), not a
> People-chain proof-of-personhood check.

---

## Phase 3 Tasks

- [ ] Add the three descriptors by WSS (`papi add ... -w`); confirm they regenerate on build
- [ ] Wire the Asset Hub WSS provider (`assethub-provider.ts`)
- [ ] Wire the Bulletin Next WSS client (`packages/bulletin/src/bulletin.ts`) + `apps/web/src/lib/host/storage.ts` adapter
- [ ] Connect Explore offer lists to on-chain data via `ReviveApi.call`
- [ ] Integrate P2PMarket contract — createOffer, lockTrade, confirm*, refundTrade
- [ ] Wire trade pages to `Revive.call` writes (host-injected signer)
- [ ] Add transaction status UI (pending, confirmed, failed)
- [ ] Persist pending transactions (Dexie message store / local state)

## Phase 3 Acceptance Criteria

- [ ] All quality gates pass (`turbo build && turbo test && turbo lint && turbo typecheck`)
- [ ] Can publish/read offers against Bulletin Next + Asset Hub Next (testnet)
- [ ] Explore shows offers read from chain
- [ ] Can create an offer and lock a trade via the contract (native PAS value)
- [ ] Can confirm a trade / refund after timeout via the contract
- [ ] Transaction states display correctly
- [ ] Error states handled gracefully (WSS failure, dispatch error)
- [ ] Hook tests cover all contract interactions
