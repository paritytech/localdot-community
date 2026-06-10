# Deploying LocalDOT

LocalDOT ships as two on-chain artifacts and nothing else: the **P2PMarket** smart contract, instantiated on **Asset Hub Next** (Paseo Next v2) via pallet-revive, and the **frontend bundle**, published to the **Bulletin** chain and served under a **.dot** (DotNS) domain. There is no backend, no pinning service, and no telemetry — Parity does not operate, host, or phone-home any deployment. A single Substrate mnemonic signs both the contract instantiate and the frontend publish, and it never touches disk.

---

## Prerequisites

| Requirement | Detail |
|-------------|--------|
| **Node** | `>= 22.0.0` (see [`package.json`](package.json) `engines`). |
| **pnpm** | `>= 10.0.0`; the repo pins `pnpm@10.8.0` via `packageManager`. |
| **resolc PolkaVM compiler** | The Revive compiler binary (~170 MB) is required to compile `P2PMarket`. The guided `pnpm run deploy` auto-fetches it on first run (it fetches only `resolc` via `RESOLC_ONLY=1 pnpm download:binaries` when `packages/contracts/bin/resolc` is missing). For the manual Hardhat path you must fetch it yourself with `pnpm download:binaries` — a bare `pnpm contracts:compile` does **not** fetch it. Hardhat is wired to it via `resolc.compilerSource: 'binary'` + `settings.resolcPath: './bin/resolc'` in [`packages/contracts/hardhat.config.ts`](packages/contracts/hardhat.config.ts). |
| **Funded Paseo Next account** | One Substrate mnemonic (12 or 24 words) holding native **PAS** on Paseo Asset Hub Next. The guided deploy waits until the on-chain balance clears a floor of **>= 20 PAS** (`MIN_FUNDING_PAS` in `scripts/deploy.ts`; covers the contract deploy **and** the .dot registration) before spending. Gas is **not** sponsored. Fund it at `https://faucet.polkadot.io/?parachain=1500`. |
| **A .dot domain** | The frontend publish registers and publishes under a DotNS name. The publish account (your mnemonic) **owns** the name. For a plain wallet (no personhood), the base label must be **9+ characters** and end with **zero or exactly two trailing digits** (e.g. `mydappname` or `mydappname42`). |
| **IPFS / kubo (optional)** | If `kubo` is not usable on your machine (the deploy probes it with `ipfs repo stat`), the publish falls back to `polkadot-app-deploy`'s pure-JS merkleizer (`--js-merkle`). Installing kubo only speeds up large publishes. |
| **polkadot-app-deploy (auto-installed)** | The external `polkadot-app-deploy` CLI (`>= 0.8.3`) is resolved automatically by the guided deploy: if a recent one is not present, it runs `npm install -g @parity/polkadot-app-deploy@latest`, falling back to `npx -y @parity/polkadot-app-deploy@latest`. |

---

## 1. Get the code

```bash
git clone <repo-url> localdot
cd localdot
pnpm install --frozen-lockfile
```

Sanity-check the workspace before deploying:

```bash
pnpm build
pnpm typecheck
```

> Tip: `pnpm run deploy` runs [`scripts/deploy-bootstrap.mjs`](scripts/deploy-bootstrap.mjs), which uses only Node built-ins and will run `pnpm install` itself on a freshly cloned repo if `node_modules` is missing — so the install step above is optional for the guided path, but explicit is better.

---

## 2. Configure

**Defaults target Paseo Next v2. No configuration is needed for a default deploy** — `pnpm run deploy` writes the contract address into `apps/web/.env.local` for you, and every other value falls back to a sensible Paseo Next default. Configure only if you are overriding a default or running a manual/lower-level path.

### Frontend build-time vars (`apps/web/.env.local`)

Read and validated in [`apps/web/src/env.ts`](apps/web/src/env.ts) (env.ts supplies the defaults). [`apps/web/.env.example`](apps/web/.env.example) is a starter template covering the most common overrides — it does **not** list every variable below; the ones it omits (e.g. `VITE_READONLY_ORIGIN`, `VITE_USE_HOST_API`, `VITE_ZKPASSPORT_DOMAIN`, `VITE_DOTNS_ID`) fall back to the defaults baked into `env.ts`.

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_P2PMARKET_ADDRESS` | _(none)_ | P2PMarket contract H160. Required to load any on-chain data; without it the app runs in read-only/empty mode. **Written automatically by the deploy.** |
| `VITE_CHAIN_ID` | `420420417` | EVM chain id for display / wrong-network badge (Paseo Asset Hub Next). |
| `VITE_RPC_URL` | `https://eth-rpc-paseo-next.polkadot.io` | Stored for chain-id display only; **not** used for contract I/O (the contract layer goes through PAPI `Revive.call`). |
| `VITE_NETWORK` | `paseo-next-v2` | Host-routed chain set (Asset Hub / People / Bulletin) selected from `lib/host/networks.ts`. |
| `VITE_NETWORK_NAME` | `Paseo Asset Hub Next` | Human-readable network label (present in `.env.example`). |
| `VITE_IPFS_GATEWAY` | `https://paseo-bulletin-next-ipfs.polkadot.io/ipfs/` | Bulletin-backed IPFS gateway for standalone, read-only CID reads. |
| `VITE_DOTNS_ID` | `window.location.host` (dev fallback) | Bare registered domain (e.g. `mydappname.dot`) used as the product identifier for host signing. **Baked at build time by the deploy** (set to the chosen domain). |
| `VITE_READONLY_ORIGIN` | `5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY` (Alice) | SS58 origin for read-only `ReviveApi.call` queries. Auto-mapped on Paseo Next; override only on chains where Alice is not mapped. |
| `VITE_USE_HOST_API` | _(auto-detect)_ | Set to the string `false` to force standalone mode and skip the Polkadot Host. |
| `VITE_ZKPASSPORT_REGISTRY_ADDRESS` | _(none)_ | ZKPassportRegistry H160. Optional — only for identity verification. Deployed separately. |
| `VITE_ZKPASSPORT_DOMAIN` | `demo.zkpassport.id` | zkpassport verification domain. |

### Contracts vars (`packages/contracts/.env`)

For the lower-level Hardhat path only; see [`packages/contracts/.env.example`](packages/contracts/.env.example). The guided `pnpm run deploy` uses an in-memory mnemonic instead and reads none of these.

| Variable | Default | Purpose |
|----------|---------|---------|
| `PRIVATE_KEY` | _(empty)_ | Deployer key — **required** for the Hardhat `paseo` deploy. |
| `PASEO_RPC_URL` | `https://eth-rpc-paseo-next.polkadot.io` | Optional eth-rpc override. |
| `REPORT_GAS` | `false` | Enable gas reporting in tests. |
| `AGENT1_KEY` / `AGENT2_KEY` | _(empty)_ | Seed-account keys for `pnpm contracts:seed` / `pnpm --filter @localdot/contracts fund-seed`. |
| `PROVIDER1_KEY` / `PROVIDER2_KEY` | _(empty)_ | Seed-account keys for `pnpm contracts:seed` / `pnpm --filter @localdot/contracts fund-seed`. |

> The seed script (`packages/contracts/scripts/seed.ts`) reads `VITE_BULLETIN_ENDPOINT` and `VITE_IPFS_GATEWAY` from `process.env` (load `apps/web/.env.local`), plus `VITE_P2PMARKET_ADDRESS` (via `loadDeploymentFromEnv`), when uploading offer metadata to Bulletin. Note `VITE_BULLETIN_ENDPOINT` is **not** in `.env.example` — add it to `apps/web/.env.local` yourself before seeding.

---

## 3. Deploy

### Path A — Guided one-command deploy (recommended)

A single command compiles + deploys the contract, wires the address into `apps/web/.env.local`, builds the SPA, and publishes it to your .dot domain — all from one mnemonic.

```bash
pnpm run deploy
```

> Use `pnpm run deploy`, **not** bare `pnpm deploy` — `deploy` is a reserved pnpm command and will not work.

The interactive flow ([`scripts/deploy.ts`](scripts/deploy.ts), bootstrapped by [`scripts/deploy-bootstrap.mjs`](scripts/deploy-bootstrap.mjs)) walks five steps:

1. **Wallet** — generate a fresh 12-word mnemonic, or paste an existing 12/24-word one. A newly generated phrase is shown once; write it down. The mnemonic is held in memory only and never written to disk.
2. **Funding** — derives and prints your SS58 + H160 and the faucet link, then polls the chain over WSS (`wss://paseo-asset-hub-next-rpc.polkadot.io`) until your balance reaches **>= 20 PAS** before continuing.
3. **Contract** — fetches `resolc` on first run (`pnpm download:binaries` with `RESOLC_ONLY=1`), runs `pnpm contracts:compile`, then instantiates `P2PMarket` on Asset Hub Next via PAPI `Revive.instantiate_with_code` (see [`scripts/deploy-p2pmarket.ts`](scripts/deploy-p2pmarket.ts)). Writes `VITE_P2PMARKET_ADDRESS`, `VITE_CHAIN_ID`, and `VITE_RPC_URL` into `apps/web/.env.local`.
4. **Domain** — prompts for the `.dot` label, enforcing the naming rules (9+ characters; end with zero or exactly two trailing digits). There is **no** default — you must enter a name; the prompt rejects an empty answer.
5. **Build & Publish** — runs `pnpm --filter @localdot/web build` (baking in `VITE_DOTNS_ID` = your chosen domain), then publishes `apps/web/dist` to your domain via `polkadot-app-deploy --env paseo-next-v2` (with `MNEMONIC`, `POLKADOT_APP_DEPLOY_DOMAIN`, and `NODE_OPTIONS=--max-old-space-size=8192` in the environment).

On success it prints the contract address and the live URL `https://<name>.dot.li` (where `<name>` is your domain with `.dot` stripped).

> **Note:** `ZKPassportRegistry` is **not** part of this flow. Deploy it separately if needed (see Path B).

### Path B — Manual: contracts, then frontend

Use the lower-level Hardhat + standalone publish path when you want each step under your control. Configure `packages/contracts/.env` (`PRIVATE_KEY`) first, and fetch the `resolc` compiler once with `pnpm download:binaries` if you haven't already (the manual compile does **not** auto-fetch it).

**Deploy the contract (Hardhat / eth-rpc):**

```bash
pnpm contracts:compile
pnpm contracts:deploy
```

`pnpm contracts:deploy` runs `hardhat run scripts/deploy.ts --network paseo` (see [`packages/contracts/scripts/deploy.ts`](packages/contracts/scripts/deploy.ts)), deploys **only** `P2PMarket`, and writes `VITE_P2PMARKET_ADDRESS`, `VITE_CHAIN_ID`, and `VITE_RPC_URL` into `apps/web/.env.local` (and `VITE_P2PMARKET_ADDRESS` into `.github/env` if present).

**Optional — register demo agents + offers:**

```bash
pnpm contracts:seed
```

Requires `AGENT1_KEY` / `AGENT2_KEY` / `PROVIDER1_KEY` / `PROVIDER2_KEY` and the Bulletin/IPFS vars described in §2.

**Optional — deploy the ZKPassport registry** (no packaged script; run directly via [`packages/contracts/scripts/deploy-zkpassport.ts`](packages/contracts/scripts/deploy-zkpassport.ts)):

```bash
pnpm --filter @localdot/contracts exec hardhat run scripts/deploy-zkpassport.ts --network paseo
```

**Build and publish the frontend:**

```bash
pnpm --filter @localdot/web build
npm install -g @parity/polkadot-app-deploy@latest
MNEMONIC="your twelve or twenty-four words ..." polkadot-app-deploy --env paseo-next-v2 ./apps/web/dist <domain>.dot
```

The Vite build emits a static export to `apps/web/dist` (with relative asset paths, IPFS-friendly). `--env paseo-next-v2` selects both Asset Hub Next and Bulletin Next so you never pass WSS endpoints by hand. `MNEMONIC` is the signing seed that owns the .dot name. Add `--js-merkle` if `kubo` is not installed.

> The published manifest (icon, displayName, app subname) is driven by [`apps/web/polkadot-app-deploy.config.ts`](apps/web/polkadot-app-deploy.config.ts); its `domain` must match the domain you publish to. It reads `POLKADOT_APP_DEPLOY_DOMAIN` from the environment and falls back to `localdotapp.dot` only for a manual standalone publish — set `POLKADOT_APP_DEPLOY_DOMAIN=<domain>.dot` (or edit the fallback) so they match.

### Path C — Local / quick look

To run the app locally without deploying anything:

```bash
pnpm web:dev
```

To produce and inspect a production build without publishing:

```bash
pnpm web:build
pnpm web:preview
```

You can also run the deploy-time contract step standalone (against a seed you supply in memory) via [`scripts/deploy-p2pmarket.ts`](scripts/deploy-p2pmarket.ts):

```bash
DEPLOYER_SEED="your twelve or twenty-four words ..." pnpm tsx scripts/deploy-p2pmarket.ts
```

---

## 4. Verify

1. **Contract instantiated & address wired.** The guided deploy prints `✓ Contract deployed — <address>` and the final `Deployment complete` notice with `Contract <address> (paseo-next-v2)`. Confirm the address landed in `apps/web/.env.local` as `VITE_P2PMARKET_ADDRESS=<H160>`. You can inspect the deployed contract on the explorer at `https://blockscout-paseo-next.polkadot.io`.
2. **Frontend reachable.** Open the printed URL `https://<name>.dot.li/` (where `<name>` is your domain with the trailing `.dot` stripped). The content is also addressable by CID via the Bulletin IPFS gateway `https://paseo-bulletin-next-ipfs.polkadot.io/ipfs/<cid>`.
3. **App loads against the contract.** With `VITE_P2PMARKET_ADDRESS` set, the app loads on-chain offers instead of showing the "contract not deployed" empty state. Browse the Exchange / Explore pages to confirm offers resolve.

There is **no** telemetry or crash-reporting verification step — LocalDOT ships none.

---

## Troubleshooting

| Symptom | Cause & fix |
|---------|-------------|
| `InvalidTransaction::Payment` during contract deploy or a write | The deployer/product account is **empty**. There is no gas sponsorship — fund the account with native PAS at `https://faucet.polkadot.io/?parachain=1500` (>= 20 PAS for the guided deploy) and retry. |
| App shows **"contract not deployed"** / empty offers | `VITE_P2PMARKET_ADDRESS` is missing from `apps/web/.env.local`. Run `pnpm run deploy` (or set it manually from your Path B deploy) and rebuild. |
| `pnpm deploy` does nothing / errors | `deploy` is a reserved pnpm command. Use `pnpm run deploy`. |
| Compile fails / resolc binary missing | The `resolc` PolkaVM compiler is not present at `packages/contracts/bin/resolc`. Fetch it with `pnpm download:binaries` (or `RESOLC_ONLY=1 pnpm download:binaries` to skip the dev-node/eth-rpc/anvil tooling), then retry. |
| Funding step never proceeds | The balance loop will not continue below 20 PAS. Top up at the faucet using the printed SS58/H160 address, then press Enter to re-check. |
| Publish uses a **different account** than your mnemonic | A leftover `polkadot-app-deploy` mobile (QR) login session exists at `~/.polkadot-apps/dot-cli_SsoSessions.json`. The deploy offers to run `polkadot-app-deploy logout` so the publish signs with your mnemonic — choose that, or clear the session manually. |
| Domain rejected at the prompt / publish aborts on the manifest domain | The label fails the naming rules (needs 9+ chars and zero or exactly two trailing digits for a plain wallet), or the [`apps/web/polkadot-app-deploy.config.ts`](apps/web/polkadot-app-deploy.config.ts) `domain` (from `POLKADOT_APP_DEPLOY_DOMAIN`, fallback `localdotapp.dot`) does not match the domain you published to. Pick a compliant name and ensure they match. |
| Domain not owned / cannot register | The publish registers and owns the .dot name as your `MNEMONIC` account. If the name is already taken by another account, choose a different label. |
| Publish slow or OOM on large bundles | Install `kubo` for native merkleization (the deploy probes it with `ipfs repo stat`); otherwise it falls back to `--js-merkle`. The guided publish also sets `NODE_OPTIONS=--max-old-space-size=8192`. |
| Build fails with "did not produce dist/index.html" | The Vite build did not complete. Re-run `pnpm --filter @localdot/web build` and check the build output for the underlying error. |
