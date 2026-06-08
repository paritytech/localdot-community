# AGENTS.md - LocalDOT P2P Market

> IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning for project-specific tasks.

This file provides persistent context for AI coding agents. Read this FIRST before any work.

---

## Critical Instructions

### 1. Skills First

Before implementation work, check `.claude/skills/` for relevant domain knowledge:

| Task Domain | Skill to Load |
|-------------|---------------|
| Contract implementation | `/contracts` |
| Contract deployment | `deploy-contracts/` |
| Frontend implementation | `/frontend` |
| Frontend deployment | `deploy-frontend/` |
| Project scaffolding | `/scaffold` |
| Chain integration (PAPI) | `/papi` |
| Trade signaling (Statement Store) | `/chat` |
| Host API / Triangle | `host-api.md` (early-stage) |
| dot.li resolution | `dotli/` |
| Solidity / TS testing | `/testing` |

Note: this repo's contract toolchain is **Hardhat + `@parity/hardhat-polkadot`**,
not Foundry. The `foundry-testing/` skill is generic reference only — use Hardhat
(`hardhat test` / `hardhat coverage`) for the real test workflow.

### 2. Polkadot Specifics

This product targets **Paseo Next v2** (Asset Hub Next). Native token is **PAS**
(10 decimals). There is no Previewnet and no local Anvil — local dev is the
Hardhat in-process network.

| Concept | Polkadot (this repo) | Ethereum Equivalent |
|---------|----------------------|---------------------|
| Native token | PAS | ETH |
| Dev network | Hardhat (in-process) | Hardhat |
| Testnet | Paseo Next v2 (Asset Hub Next) | Sepolia |
| Chain ID (local) | 31337 | 31337 |
| Chain ID (testnet) | 420420417 | 11155111 |
| eth-rpc (testnet) | `https://eth-rpc-paseo-next.polkadot.io` | — |
| Block explorer | Blockscout (`https://blockscout-paseo-next.polkadot.io`) | Etherscan |
| Block time | ~6 seconds | ~12 seconds |

### 3. Development Workflow

```
Hardhat (local, in-process) -> Paseo Next v2 (Asset Hub Next testnet) -> Mainnet (TBD)
        (fast)                          (public, faucet)                    (prod)
```

### 4. Deployment Protocol

Deploy with the Hardhat scripts against the `paseo` network (chainId 420420417):

```bash
pnpm --filter @localdot/contracts compile
hardhat run scripts/deploy.ts --network paseo            # deploys P2PMarket
hardhat run scripts/deploy-zkpassport.ts --network paseo # deploys ZKPassportRegistry
```

`scripts/deploy.ts` deploys only P2PMarket and writes its address to
`apps/web/.env.local` + `.github/env`; the registry is deployed separately.
Run `pnpm download:binaries` once first to fetch the `resolc` compiler binary.

---

## Safety Boundaries

### Safe to Execute

```bash
# Contracts (Hardhat + @parity/hardhat-polkadot)
pnpm --filter @localdot/contracts compile
pnpm --filter @localdot/contracts test       # hardhat test (Mocha/Chai/ethers)
pnpm --filter @localdot/contracts coverage    # solidity-coverage
pnpm --filter @localdot/contracts lint        # solhint
pnpm download:binaries                         # fetch resolc binary (once)

# Package managers
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test

# Git (read-only)
git status
git diff
git log
git branch
```

### Ask First

```bash
# Deployment (writes addresses to apps/web/.env.local + .github/env)
hardhat run scripts/deploy.ts --network paseo
hardhat run scripts/deploy-zkpassport.ts --network paseo
hardhat run scripts/seed.ts --network paseo   # registers demo agents + offers

# Git (write)
git add
git commit
git push
git checkout
git merge

# Destructive
rm -rf
hardhat clean
```

### Never Without Explicit User Request

```bash
git push --force
git reset --hard
hardhat run scripts/deploy.ts --network <mainnet>  # mainnet deploy
Expose private keys
```

---

## Directory Map

```
p2p-market/
├── .claude/                    # AI agent configuration (YOU ARE HERE)
│   ├── AGENTS.md               # This file
│   ├── settings.local.json     # Permissions (local, gitignored — not in repo)
│   ├── commands/               # Slash commands (skills)
│   └── skills/                 # Domain knowledge
├── CLAUDE.md                   # Project architecture
├── apps/
│   └── web/                    # React SPA
├── packages/
│   ├── contracts/              # Solidity: P2PMarket.sol + ZKPassportRegistry.sol
│   ├── config/                 # Shared tsconfig / eslint / prettier
│   ├── types/                  # Shared TypeScript types
│   └── bulletin/               # Bulletin Chain + Statement Store client
└── turbo.json                  # Turborepo config
```

---

## Invariants (Non-Negotiable)

### Code Philosophy

| Rule | Enforcement | Status |
|------|-------------|--------|
| Least code wins | Every feature with minimum code | MANDATORY |
| Exceptional organization | Clear structure, logical grouping | MANDATORY |
| No code bloat | Delete unused code immediately | MANDATORY |
| No over-engineering | Build exactly what's requested | MANDATORY |
| No premature abstraction | Wait for rule of 3 | MANDATORY |
| No speculative features | YAGNI | MANDATORY |

### Target Chain

| Rule | Enforcement | Status |
|------|-------------|--------|
| Primary chain: Paseo Next v2 (Asset Hub Next), chainId 420420417 | Development target | MANDATORY |
| Production chain: Polkadot Asset Hub | Mainnet target (TBD) | MANDATORY |
| No Moonbeam | Use Asset Hub EVM instead | FORBIDDEN |

### Monorepo Structure

| Rule | Enforcement | Status |
|------|-------------|--------|
| Use pnpm workspaces | `pnpm-workspace.yaml` | MANDATORY |
| Apps in `apps/` | web frontend | MANDATORY |
| Packages in `packages/` | contracts, config, types, bulletin | MANDATORY |
| Shared configs in `packages/config` | tsconfig, eslint, prettier | MANDATORY |

### Smart Contracts

> NOTE: The real contracts (`P2PMarket.sol` v7.1.0, `ZKPassportRegistry.sol`
> v1.0.0) are **non-upgradeable** — no proxy, no UUPS, no initializer, no storage
> gaps. They do **not** inherit OpenZeppelin (it is an unused devDependency).
> Reentrancy uses a custom `noReentrant` single-bool guard; access control is
> per-function `msg.sender` checks (no owner/admin/Ownable). Escrow holds the
> **native token** (PAS) via `msg.value` / `.call{value:}` — there is no ERC-20.
> Treat any UUPS / `_disableInitializers` / proxy-upgrade guidance below as
> generic reference only; it does not apply here.

| Rule | Enforcement | Status |
|------|-------------|--------|
| Non-upgradeable (no proxy/UUPS/initializer) | Single deployed contract | MANDATORY |
| Custom reentrancy guard | `noReentrant` modifier | MANDATORY |
| Test all access control | Revert tests | MANDATORY |
| Events on every state change | Solidity events | MANDATORY |

### Code Quality

| Rule | Enforcement | Status |
|------|-------------|--------|
| Solidity 0.8.28 | `pragma solidity ^0.8.28` | MANDATORY |
| SPDX license identifier | Every file | MANDATORY |
| No hardcoded addresses | Use environment/config | MANDATORY |
| No `console.log` in production | Remove before deploy | MANDATORY |
| Solhint clean | `solhint 'contracts/**/*.sol'` | MANDATORY |

### TypeScript

| Rule | Enforcement | Status |
|------|-------------|--------|
| Strict mode | `"strict": true` | MANDATORY |
| No `any` type | Use `unknown` + guards | MANDATORY |
| Explicit return types | On exports | MANDATORY |
| Minimal dependencies | Justify every addition | MANDATORY |

---

## Verification Matrix

Before considering any task complete:

### For Contracts

```bash
pnpm --filter @localdot/contracts compile   # Must compile (resolc -> PolkaVM)
pnpm --filter @localdot/contracts test      # Must pass all tests (hardhat test)
pnpm --filter @localdot/contracts lint      # solhint clean
```

### For Frontend

```bash
pnpm typecheck         # Must pass
pnpm lint              # Zero warnings
pnpm test              # Must pass
pnpm build             # Must build
```

---

## Operational Strategy

### For Simple Tasks

1. Read the relevant file
2. Make the change
3. Run verification
4. Done

### For Contract Work

1. **Load skill** - `/contracts`
2. **Understand existing** - Read `P2PMarket.sol` / `ZKPassportRegistry.sol`
3. **Implement** - Non-upgradeable, custom `noReentrant`, native-token escrow
4. **Test** - Write tests, run `hardhat test`
5. **Verify** - Full verification matrix

### For Deployment

1. **Load skill** - `deploy-contracts/`
2. **Fetch binary** - `pnpm download:binaries` (resolc), once
3. **Compile** - `pnpm --filter @localdot/contracts compile`
4. **Test locally** - Hardhat in-process network (chainId 31337)
5. **Deploy Paseo** - `hardhat run scripts/deploy.ts --network paseo` (chainId 420420417)
6. **Deploy registry** - `hardhat run scripts/deploy-zkpassport.ts --network paseo`
7. **Verify** - Blockscout (`https://blockscout-paseo-next.polkadot.io`)

### For Frontend Deployment

1. **Load skill** - `deploy-frontend/`
2. **Build** - `pnpm build`
3. **Upload to Bulletin** - via dotns CLI
4. **Set content hash** - link domain to CID
5. **Verify** - Check on dot.li

---

## Anti-Patterns (FORBIDDEN)

| Pattern | Why Forbidden | Instead |
|---------|---------------|---------|
| Use Moonbeam | Not our target chain | Use Asset Hub EVM |
| Code bloat | Maintenance burden | Minimal code always |
| Over-engineering | Wasted effort | Build what's requested |
| Premature abstraction | Unclear patterns | Wait for rule of 3 |
| Add a proxy / UUPS to these contracts | They are non-upgradeable by design | Deploy a fresh contract |
| ERC-20 escrow logic | Escrow holds native PAS | `msg.value` / `.call{value:}` |
| Hardcode addresses | Not portable | Use `.env` |
| Deploy to mainnet first | Costly mistakes | Paseo Next v2 testnet first |
| Commit `.env` | Secret exposure | Use `.gitignore` |
| `console.log` in production frontend | Style violation | Remove before deploy |

---

## Cross-References

- **Architecture**: See [`CLAUDE.md`](../CLAUDE.md) in project root
- **Domain Knowledge**: See `.claude/skills/`
- **Network Config**: see [`hardhat.config.ts`](../packages/contracts/hardhat.config.ts) (chainId 420420417, eth-rpc `https://eth-rpc-paseo-next.polkadot.io`) and [`apps/web/src/env.ts`](../apps/web/src/env.ts)

---

## Learnings

> Append corrections and discoveries here as they occur. Format: `[YYYY-MM-DD] Category: Learning`

| Date | Category | Learning |
|------|----------|----------|
| 2025-03-06 | Git | Follow the commit-message conventions in `CLAUDE.md` when contributing. |
| 2025-03-06 | Skills | All skills must have Anti-Patterns section for consistency |
| — | — | Add new learnings above this line |
