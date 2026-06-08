---
name: deploy-frontend
description: "Deploy frontend to Bulletin Chain + DotNS. Triggers: deploy frontend, bulletin, dotns, .dot domain, decentralized hosting"
---

# Deploy Frontend to Bulletin Chain + DotNS

## When to Activate

- Deploying frontend to decentralized storage
- Registering a .dot domain
- Updating content on an existing domain
- Setting up personhood verification

## Global Invariants

| Rule | Enforcement |
|------|-------------|
| Use `base: './'` in Vite config | REQUIRED (IPFS-compatible paths) — already set |
| Never commit the mnemonic / `MNEMONIC` secret | FORBIDDEN |
| Target Paseo Next v2 chains (not legacy `asset-hub-paseo`) | REQUIRED |
| Set Personhood (PoP) before domain registration | dotns-sdk CLI path only — NOT required by `bulletin-deploy` on dev signers |
| Authorize for Bulletin before upload | dotns-sdk CLI path only — NOT required by `bulletin-deploy` |

## Prerequisites

1. **Node.js 22+** (pnpm ≥ 10; repo pins `pnpm@10.8.0`). Bun is only needed for the lower-level `dotns-sdk` CLI path.
2. **`bulletin-deploy`** (`npm install -g bulletin-deploy@latest`) — the tool the live deploy uses. The `dotns-sdk` CLI (https://github.com/paritytech/dotns-sdk) is an optional lower-level alternative.
3. **Wallet with PAS tokens** on **Asset Hub Next** (Paseo Next v2). Native token is PAS (10 decimals); fund from the testnet faucet.
4. **Vite config** with `base: './'` — already set in [`apps/web/vite.config.ts`](../../../apps/web/vite.config.ts) for Bulletin / IPFS static hosting.

## Chains Involved

| Chain | Purpose | Endpoint |
|-------|---------|----------|
| Asset Hub Next (Paseo) | Domain registration, content hash | `wss://paseo-asset-hub-next-rpc.polkadot.io` |
| Bulletin Next (Paseo) | Decentralized storage | `wss://paseo-bulletin-next-rpc.polkadot.io` |

> NOTE — RPC endpoint: this repo targets the **Paseo Next v2** stack. Any
> `wss://asset-hub-paseo-rpc.n.dwellir.com` / `asset-hub-paseo` endpoint points at
> the **legacy (non-Next)** Asset Hub and must not be used. dotNS registration
> here happens on **Asset Hub Next** (`wss://paseo-asset-hub-next-rpc.polkadot.io`,
> EVM chainId `420420417`, eth-rpc `https://eth-rpc-paseo-next.polkadot.io`). The
> `bulletin-deploy --env paseo-next-v2` flag selects the correct Next chains for
> you, so you do not pass these WSS endpoints by hand.

## First-Time Setup (REQUIRED)

> NOTE — how THIS repo deploys: the live path is the manual `bulletin-deploy`
> flow documented in [`/deploy`](../../commands/deploy.md) (wrapped by the
> one-command `pnpm run deploy`), which uses the
> `bulletin-deploy --env paseo-next-v2` tool — not the `dotns-sdk` CLI directly.
> On the Paseo Next v2 dev signers, the chosen domain label (≥9 alphanumeric chars
> + 2 trailing digits) needs **no PoP**, so Steps 1–2 below are only needed if you
> drive the lower-level `dotns-sdk` CLI yourself. The `dotns-sdk` commands here are
> kept as generic reference for that path. All `dotns-sdk` examples assume you have
> cloned the SDK separately and run them from its `packages/cli` directory.

### Step 1: Set Personhood (PoP) Lite

**Only when driving the `dotns-sdk` CLI directly. `bulletin-deploy` does not require this on dev signers.**

```bash
# From your local clone of the dotns-sdk (path is yours, not part of this repo):
# cd <dotns-sdk>/packages/cli

# Set PoP Lite verification
bun run src/cli/index.ts pop set lite -m "$DOTNS_MNEMONIC"
```

Verify PoP status:
```bash
bun run src/cli/index.ts pop status -m "$DOTNS_MNEMONIC"
```

### Step 2: Authorize for Bulletin Storage

**This is REQUIRED before uploading to Bulletin. Self-service authorization.**

```bash
# First, find your Substrate address (run any command to see it)
bun run src/cli/index.ts --help

# Authorize yourself for Bulletin storage
bun run src/cli/index.ts bulletin authorize <your-substrate-address> -m "$DOTNS_MNEMONIC"
```

## Authentication Methods

```bash
# Option 1: Mnemonic (direct)
--mnemonic "your 12 word mnemonic here"
# or
-m "$DOTNS_MNEMONIC"

# Option 2: Keystore (recommended for repeated use)
export DOTNS_KEYSTORE_PATH=~/.dotns/keystore
export DOTNS_KEYSTORE_PASSWORD=your-password
dotns auth set --account default --mnemonic "your 12 words..."

# Option 3: Dev key URI (local/dev signers only)
--key-uri //Alice
```

## Deployment Workflow

### Step 1: Build Frontend

```bash
# base: './' is already set in apps/web/vite.config.ts
pnpm --filter @localdot/web build
# Output: apps/web/dist/
```

### Step 2: Check Domain Status

```bash
bun run src/cli/index.ts lookup name <domain-name>
```

### Step 3: Register Domain (if not registered)

```bash
bun run src/cli/index.ts register domain \
  --name <domain-label> \
  -m "$DOTNS_MNEMONIC"
```

**Domain naming rules:**
- `myapp` -> `myapp.dot`
- `my-app` -> `my-app.dot` (hyphens allowed)
- Reserved names (<=5 chars) require `--governance` flag
- Dev signers WITHOUT PoP must use the workaround label form: ≥9 alphanumeric chars + 2 trailing digits. With PoP (personhood) set on the signer, clean human-readable labels are accepted.

> NOTE — domain: the **live** dotNS label is `localdot.dot`, per the manual
> `bulletin-deploy` flow in [`/deploy`](../../commands/deploy.md). This is possible
> because the deploy signer has PoP set; earlier drafts used the digit-suffixed
> workaround (`localdott33.dot`, `localdot10.dot`) and one said `local-dot.dot`.
> Treat the `/deploy` command doc as the source of truth. The examples below use
> `localdot.dot` to match.

### Step 4: Upload to Bulletin Chain

```bash
bun run src/cli/index.ts bulletin upload \
  ./apps/web/dist \
  --parallel \
  --concurrency 5 \
  --print-contenthash \
  -m "$DOTNS_MNEMONIC"
```

**Output:**
```
CID: bafybeig...
ContentHash: 0xe3010170...
```

Save the CID for the next step.

### Step 5: Set Content Hash on Domain

```bash
bun run src/cli/index.ts content set <domain-name> <cid> \
  -m "$DOTNS_MNEMONIC"
```

### Step 6: Verify Deployment

```bash
# Check content hash is set
bun run src/cli/index.ts content view <domain-name>
```

**Access your site:**
- **dot.li (recommended):** `https://localdot.dot.li/` (client-side resolution, no proxy)
- Paseo gateway: `https://localdot.paseo.li/`
- Bulletin Next IPFS gateway: `https://paseo-bulletin-next-ipfs.polkadot.io/ipfs/<cid>` (this is the gateway the app uses; matches `VITE_IPFS_GATEWAY` in [`.github/env`](../../../.github/env))
- public fallback: `https://dweb.link/ipfs/<cid>`

**See also:** [`../dotli/SKILL.md`](../dotli/SKILL.md) for understanding client-side resolution architecture.

## Vite Configuration

**REQUIRED** for IPFS-compatible paths:

```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',  // REQUIRED for IPFS/Bulletin
  // ... rest of config
});
```

## Quick Deploy (recommended)

The live deploy uses `bulletin-deploy` (build + Bulletin upload + dotNS content-hash
in one command). Run from the **repo root**:

```bash
#!/bin/bash
set -e

DOMAIN="localdot.dot"

echo "Building..."
pnpm --filter @localdot/web build   # output: apps/web/dist

echo "Publishing to Bulletin + dotNS..."
npm install -g bulletin-deploy@latest
MNEMONIC="$DOTNS_MNEMONIC" bulletin-deploy --env paseo-next-v2 './apps/web/dist' "$DOMAIN"

echo "Done! https://${DOMAIN%.dot}.dot.li/"
```

> A single one-click deploy script that wraps **both** halves of a release — compile +
> deploy the contracts ([`packages/contracts/scripts/deploy.ts`](../../../packages/contracts/scripts/deploy.ts) →
> writes addresses into `.github/env` and `apps/web/.env.local`) **and** publish the
> frontend via `bulletin-deploy` — is in progress and will wrap the steps above.
> Until it lands, run the contract deploy (`pnpm contracts:deploy`) and the frontend
> publish (above) separately.

**Note:** Requires Node.js 22+ (use `fnm use 22` / `nvm use 22`). The lower-level
`dotns-sdk` `bulletin upload` + `content set` flow below is generic reference for
driving the SDK CLI directly.

### Low-level alternative (dotns-sdk CLI)

```bash
# From your local dotns-sdk clone's packages/cli directory:
CID=$(bun run src/cli/index.ts bulletin upload ./apps/web/dist \
  --parallel --concurrency 5 --print-contenthash \
  -m "$DOTNS_MNEMONIC" 2>&1 | grep "cid:" | awk '{print $2}')
echo "CID: $CID"

bun run src/cli/index.ts content set localdot.dot "$CID" -m "$DOTNS_MNEMONIC"
```

## Environment Variables

The CI deploy reads the signing seed from the `MNEMONIC` GitHub secret (used by
`bulletin-deploy`). When driving a CLI locally:

```bash
# Add to .env (NEVER COMMIT)
DOTNS_MNEMONIC="your 12 word mnemonic"

# Optional — for the dotns-sdk CLI path only.
# Must be the Paseo NEXT Asset Hub, NOT the legacy asset-hub-paseo endpoint.
DOTNS_RPC=wss://paseo-asset-hub-next-rpc.polkadot.io
DOTNS_KEYSTORE_PATH=~/.dotns/keystore
DOTNS_KEYSTORE_PASSWORD=your-password
```

Build-time `VITE_*` config (including `VITE_IPFS_GATEWAY=https://paseo-bulletin-next-ipfs.polkadot.io/ipfs/`)
lives in [`.github/env`](../../../.github/env), not here.

## Troubleshooting

| Error | Solution |
|-------|----------|
| "Requires Personhood Lite verification" | Run `pop set lite` (see First-Time Setup) |
| "Account is not authorized for Bulletin" | Run `bulletin authorize` (see First-Time Setup) |
| Assets return 404 on IPFS | Add `base: './'` to Vite config, rebuild |
| "Missing WebSocket class" | Use Node.js 22+ or Bun |
| "Insufficient balance" | Fund the signing account with PAS from the Paseo Next faucet (no PGAS gas sponsorship is wired) |
| Domain already registered | Check owner: `dotns lookup owner-of <domain>` |

## Common Commands Reference

```bash
# View content hash on domain
bun run src/cli/index.ts content view <domain-name>

# View upload history
bun run src/cli/index.ts bulletin history

# Check PoP status
bun run src/cli/index.ts pop status -m "$DOTNS_MNEMONIC"

# Lookup domain info
bun run src/cli/index.ts lookup name <domain-name>
```

## Anti-Patterns

| Pattern | Status | Reason |
|---------|--------|--------|
| Commit the mnemonic / `MNEMONIC` to git | FORBIDDEN | Security risk |
| Use absolute paths in build (`base: '/'`) | FORBIDDEN | Breaks on IPFS gateways; repo uses `base: './'` |
| Point dotNS at legacy `asset-hub-paseo` | FORBIDDEN | Must use Asset Hub **Next** (Paseo Next v2) |
| Deploy to mainnet first | FORBIDDEN | Test on Paseo Next first |
| Skip PoP / Bulletin auth on the dotns-sdk CLI path | FORBIDDEN | Registration / upload will fail (N/A for `bulletin-deploy` on dev signers) |
