# /scaffold - Project Scaffolding

Set up the LocalDOT monorepo from scratch.

> Note: the repo is already scaffolded — this command documents how the existing
> layout was bootstrapped. The real workspace packages are `config`, `types`,
> `contracts`, and `bulletin` (there is **no** `shared` and **no** `bulletin-sdk`).
> Reconcile against the live [`package.json`](../../package.json),
> [`pnpm-workspace.yaml`](../../pnpm-workspace.yaml), and
> [`apps/web/package.json`](../../apps/web/package.json) before changing anything.

## Turborepo Configuration

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", "typechain-types/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": []
    },
    "lint": {
      "outputs": []
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": []
    }
  }
}
```

```json
// package.json (root) — matches the real root package.json
{
  "name": "localdot",
  "version": "1.0.0",
  "private": true,
  "description": "Peer-to-peer cash-to-Hollar exchange on Polkadot",
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "test": "turbo run test",
    "lint": "turbo run lint",
    "lint:fix": "turbo run lint:fix",
    "format": "prettier --write \"**/*.{ts,tsx,md,json,sol}\"",
    "typecheck": "turbo run typecheck",
    "clean": "turbo run clean && rm -rf node_modules",
    "contracts:compile": "pnpm --filter @localdot/contracts compile",
    "contracts:test": "pnpm --filter @localdot/contracts test",
    "contracts:deploy": "pnpm --filter @localdot/contracts deploy",
    "contracts:seed": "pnpm --filter @localdot/contracts seed",
    "download:binaries": "pnpm --filter @localdot/contracts download:binaries",
    "web:dev": "pnpm --filter @localdot/web dev",
    "web:build": "pnpm --filter @localdot/web build",
    "web:preview": "pnpm --filter @localdot/web preview"
  },
  "devDependencies": {
    "turbo": "^2.9.14",
    "typescript": "^5.9.3"
  },
  "engines": {
    "node": ">=22.0.0",
    "pnpm": ">=10.0.0"
  },
  "packageManager": "pnpm@10.8.0"
}
```

## Phase 1 Commands

```bash
# Initialize monorepo
mkdir localdot && cd localdot
pnpm init

# Create workspace config
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - "apps/*"
  - "packages/*"
EOF

# Add Turborepo and shared TypeScript config (Node >= 22, pnpm@10.8.0)
pnpm add -D turbo@^2.9.14 typescript -w

# Create turbo.json (copy from Turborepo Configuration section above)

# Create shared TypeScript base config
# (in this repo it lives in the @localdot/config package as tsconfig.base.json)
cat > tsconfig.base.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  }
}
EOF

# Create structure — real packages are config / types / contracts / bulletin
mkdir -p apps/web packages/{config,types,contracts,bulletin} docs
mkdir -p .github/workflows

# Initialize config package (shared eslint / prettier / tsconfig.base.json)
cd packages/config
pnpm init
# Set name to @localdot/config in package.json

# Initialize types package (shared TypeScript types)
cd ../types
pnpm init
# Set name to @localdot/types in package.json

# Initialize bulletin package (Bulletin Chain + Statement Store client)
cd ../bulletin
pnpm init
# Set name to @localdot/bulletin in package.json

# Initialize contracts
cd ../contracts
pnpm init
# Set name to @localdot/contracts in package.json
# Hardhat + @parity/hardhat-polkadot (NOT Foundry — there is no forge/anvil/foundry.toml).
# Note: @openzeppelin/contracts is installed but UNUSED in source — the contracts
# do not inherit any OZ base. Reentrancy is a custom `noReentrant` bool-guard modifier,
# access control is per-function msg.sender checks (no Ownable / owner / admin).
pnpm add -D hardhat @parity/hardhat-polkadot @nomicfoundation/hardhat-toolbox \
  @nomicfoundation/hardhat-verify @typechain/hardhat typechain @typechain/ethers-v6 \
  hardhat-contract-sizer solidity-coverage typescript ts-node dotenv ethers@6 solhint
npx hardhat init # Select TypeScript

# Fetch the resolc (Revive) compiler binary into packages/contracts/bin/
# (hardhat.config.ts uses resolc.compilerSource:binary + resolcPath:./bin/resolc)
pnpm download:binaries

# Initialize web app
cd ../../apps/web
pnpm create vite . --template react-ts
# Set name to @localdot/web in package.json

# Runtime deps — Host-injected Spektr only (no @polkadot-onboard, no window.ethereum).
# PAPI v2 over WSS; ethers v6 is used ONLY to ABI encode/decode calldata, never as a wallet.
pnpm add react react-dom react-router-dom @tanstack/react-query \
  polkadot-api @polkadot-api/descriptors ethers@6 \
  @novasamatech/host-api @novasamatech/host-api-wrapper @novasamatech/sdk-statement \
  @zkpassport/sdk dexie dexie-react-hooks leaflet react-leaflet \
  multiformats @noble/hashes

pnpm add -D tailwindcss postcss autoprefixer @types/react @types/react-dom \
  @types/leaflet @vitejs/plugin-react @polkadot-api/cli @playwright/test vite
npx tailwindcss init -p

# Generate PAPI descriptors for the Paseo Next v2 chains (WSS, not bundled Smoldot
# light-client specs): paseohubnext / bulletinnext / peoplenext, output to apps/web/.papi/
# (papi runs as part of `pnpm --filter @localdot/web build`).

# Return to root and install all deps
cd ../..
pnpm install
```

## Phase 1 Tasks

- [ ] Initialize pnpm monorepo with workspace config (`apps/*`, `packages/*`)
- [ ] Create `tsconfig.base.json` in `@localdot/config` for shared TypeScript settings
- [ ] Set up `packages/contracts` with Hardhat + @parity/hardhat-polkadot (solc 0.8.28, optimizer runs 200, viaIR, resolc binary)
- [ ] Write [`P2PMarket.sol`](../../packages/contracts/contracts/P2PMarket.sol) — native-token escrow with the 5-state machine (LOCKED, RELEASED, COMPLETED, REFUNDED, CANCELLED)
- [ ] Write [`ZKPassportRegistry.sol`](../../packages/contracts/contracts/ZKPassportRegistry.sol) — on-chain proof-of-personhood registry
- [ ] Write contract tests (happy path, 24h refund timeout, agent-mediated + direct paths, edge cases) via `hardhat test`
- [ ] Deploy to local Hardhat node (chainId 31337)
- [ ] Deploy to Asset Hub Next testnet (chainId 420420417, `https://eth-rpc-paseo-next.polkadot.io`)

## Phase 1 Acceptance Criteria

- [ ] `pnpm install` succeeds from root
- [ ] `turbo build` succeeds with no warnings
- [ ] `turbo test` passes with 100% contract coverage (`hardhat coverage`)
- [ ] `turbo lint` passes with zero errors/warnings (`solhint` for contracts)
- [ ] `turbo typecheck` passes with zero errors
- [ ] `P2PMarket` deployed to Asset Hub Next with a verified address (Blockscout: `https://blockscout-paseo-next.polkadot.io`)
- [ ] All contract functions have NatSpec documentation
