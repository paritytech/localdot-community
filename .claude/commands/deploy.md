# /deploy - Deployment

Deploy LocalDOT to Bulletin Chain via dotNS.

---

## Deployment Process

Deployment is **manual / scripted** — this repo ships no CI. There are two paths, both publishing the static web bundle to the Bulletin Chain via `polkadot-app-deploy` and pointing a dotNS domain at the resulting CID.

### One-command deploy (recommended)

From the repo root:

```bash
pnpm run deploy
```

This runs [`scripts/deploy-bootstrap.mjs`](../../scripts/deploy-bootstrap.mjs), which installs workspace dependencies if needed and hands off to the interactive [`scripts/deploy.ts`](../../scripts/deploy.ts). The one command walks an operator from nothing to a live `.dot` product: generate or paste a mnemonic, fund the printed address, compile + deploy the `P2PMarket` contract (PAPI / pallet-revive), build the web app (Vite static export), then publish it to a `.dot` domain via `polkadot-app-deploy`. A single Substrate mnemonic is used end-to-end and only ever lives in memory.

### Manual `polkadot-app-deploy` path

If you'd rather drive the steps yourself, build the web app and publish the bundle directly:

```bash
# Build the web app — output goes to apps/web/dist
pnpm --filter @localdot/web build

# Publish to Bulletin Chain + dotNS
npm install -g @parity/polkadot-app-deploy@latest
MNEMONIC="..." polkadot-app-deploy --env paseo-next-v2 ./apps/web/dist <domain>.dot
```

| Step | Purpose |
|------|---------|
| **Build** | `pnpm --filter @localdot/web build` produces the static bundle in `apps/web/dist` (Turborepo handles package ordering; Vite `base: './'` keeps paths IPFS-compatible) |
| **Publish** | `polkadot-app-deploy --env paseo-next-v2` uploads `apps/web/dist` to the Bulletin Chain and points the dotNS domain at the new CID. `--env paseo-next-v2` selects the correct Paseo Next v2 chains |

Build-time `VITE_*` config defaults live in `apps/web/src/env.ts`; the interactive deploy writes the freshly deployed contract address into `apps/web/.env.local` (gitignored) so the static build inlines it.

---

## dotNS Domain

The deploy signer has PoP/personhood set, so DotNS accepts clean human-readable labels (the old ≥9-alphanumeric + 2-trailing-digits dev-signer workaround no longer applies):

- **Production:** `localdot.dot`
- Publish your own instance under any label you control at the deploy prompt.

> NOTE — domain history: earlier drafts used `local-dot.dot`, `localdot10.dot`, then `localdott33.dot` (the digit-suffixed workaround for dev signers without PoP). The stable default is now `localdot.dot`.

---

## Manual Deployment

To deploy without the `pnpm run deploy` wrapper, run the build and publish steps yourself:

```bash
# Build the web app
pnpm --filter @localdot/web build

# Output is in apps/web/dist — publish to Bulletin Chain + dotNS
npm install -g @parity/polkadot-app-deploy@latest
MNEMONIC="..." polkadot-app-deploy --env paseo-next-v2 './apps/web/dist' "localdot.dot"
```

> The single-command deploy (`pnpm run deploy`) has shipped and is the recommended path — it wraps the contract deploy, the build, and the `polkadot-app-deploy` publish above. Use the manual commands here only when you want to run an individual step on its own.

---

## Deployment Checklist

Before deploying to production:

**Quality Gates:**
- [ ] All tests pass with required coverage: `pnpm test`
- [ ] Lint passes with zero warnings: `pnpm lint`
- [ ] TypeScript compiles with zero errors: `pnpm typecheck`
- [ ] Build succeeds with no warnings: `pnpm build`
- [ ] No high/critical vulnerabilities: `pnpm audit`

**Configuration:**
- [ ] `VITE_P2PMARKET_ADDRESS` / `VITE_ZKPASSPORT_REGISTRY_ADDRESS` in [`.github/env`](../../.github/env) match the target network
- [ ] `MNEMONIC` available to the deploy (passed in-memory to `polkadot-app-deploy`; never committed)
- [ ] dotNS domain is correct at the deploy prompt (or in `DEFAULT_DOMAIN` in `scripts/deploy.ts`)

**Security (Pre-Audit):**
- [ ] All contract functions have NatSpec documentation
- [ ] No TODO comments remain in contract code
- [ ] `msg.sender` checks tested on every state-changing function (there is no owner/admin/Ownable; access control is per-function caller checks)
- [ ] The `noReentrant` modifier (single-bool guard) is applied on all value transfers (escrow uses the native token via `msg.value` / `.call{value:}` — not an ERC-20)
- [ ] Event emission verified for all state changes

---

## Environment Variables

Wallet/signing is **Host-injected only** (Polkadot Triangle) — there is no WalletConnect or standalone browser wallet, so no `VITE_WC_PROJECT_ID`. There is no `VITE_ESCROW_ADDRESS` / `VITE_TOKEN_ADDRESS` (one contract, `P2PMarket`; escrow uses the native token, not an ERC-20).

```bash
# apps/web/.env  (deploy build reads these from .github/env)
VITE_RPC_URL=https://eth-rpc-paseo-next.polkadot.io   # EVM JSON-RPC (ABI calldata only, never a wallet)
VITE_CHAIN_ID=420420417
VITE_P2PMARKET_ADDRESS=                                # Deployed P2PMarket contract
VITE_ZKPASSPORT_REGISTRY_ADDRESS=                      # Deployed ZKPassportRegistry contract
VITE_NETWORK=paseo-next-v2                             # host-routed chain set: Asset Hub / People / Bulletin (see lib/host/networks.ts)
VITE_BULLETIN_ENDPOINT=wss://paseo-bulletin-next-rpc.polkadot.io   # contracts seed script only (Node); the web app reads Bulletin via the host
VITE_IPFS_GATEWAY=https://paseo-bulletin-next-ipfs.polkadot.io/ipfs/
VITE_READONLY_ORIGIN=                                  # SS58 used as ReviveApi.call origin (defaults to Alice)

# packages/contracts/.env
PRIVATE_KEY=                     # Deployer private key (testnet only!)
```

Note: the Paseo Next v2 parachains are **not** bundled as Smoldot light-client specs in `polkadot-api`. The frontend connects over **WSS via generated PAPI descriptors** (`paseohubnext` / `bulletinnext` / `peoplenext`), so each chain needs its `VITE_*_ENDPOINT` WSS URL above.
