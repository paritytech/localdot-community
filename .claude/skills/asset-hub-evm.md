# Asset Hub EVM Development

> **This repo is Hardhat-only.** Contracts use **Hardhat + [@parity/hardhat-polkadot](../../packages/contracts/hardhat.config.ts)** compiling Solidity → Revive (resolc) → PolkaVM — there is **no Foundry** here (no `forge`/`anvil`/`foundry.toml`/`*.s.sol`). See the `/contracts` skill and [packages/contracts/hardhat.config.ts](../../packages/contracts/hardhat.config.ts). Any `forge`/`anvil` snippet below is **generic EVM reference only** and is not how this project builds, tests, or deploys.

## Context
Use when deploying or interacting with contracts on Polkadot Asset Hub Next (Paseo v2) via the Revive EVM-compatibility layer.

## Network Configuration

> **Active target is Paseo Asset Hub Next (v2) only.** Earlier preview targets are retired; only Paseo Asset Hub Next is supported.

### Local Development (Hardhat node)
- In-process Hardhat network, chainId `31337` (`allowUnlimitedContractSize: true`)
- No faucet needed — pre-funded dev accounts
- Run `pnpm download:binaries` once to fetch the `resolc` binary before compiling

### Paseo Testnet — Asset Hub Next (Integration Testing)
- eth-rpc (ethers/EVM): `https://eth-rpc-paseo-next.polkadot.io`
- Chain ID: `420420417`
- Block Explorer (Blockscout): `https://blockscout-paseo-next.polkadot.io`
- Substrate WSS: `wss://paseo-asset-hub-next-rpc.polkadot.io`
- Native token: **PAS** (10 decimals) — get from `https://faucet.polkadot.io`
- AH Next runs an **AutoMapper**, so SS58 ↔ H160 mapping is automatic — we do **not** call `Revive.map_account`

### Mainnet (Production)
- TBD — not yet a target.

## Build / Compiler Configuration

> **No `foundry.toml` in this repo.** Compiler settings live in [packages/contracts/hardhat.config.ts](../../packages/contracts/hardhat.config.ts).

Actual config:

```ts
solidity: {
  version: '0.8.28',
  settings: {
    optimizer: { enabled: true, runs: 200 },
    viaIR: true,
  },
},
resolc: {
  compilerSource: 'binary',
  settings: {
    resolcPath: './bin/resolc',
    memoryConfig: { heapSize: 128000, stackSize: 128000 },
  },
},
```

- **solc 0.8.28** with **`viaIR: true`** and the **resolc** (Revive) backend → PolkaVM bytecode. There is no `evm_version: london` target — output is PVM, not EVM bytecode.
- Pragma in source is the floating `^0.8.28`.
- Contracts: only [P2PMarket.sol](../../packages/contracts/contracts/P2PMarket.sol) (VERSION 7.0.0) and [ZKPassportRegistry.sol](../../packages/contracts/contracts/ZKPassportRegistry.sol) (1.0.0). No OpenZeppelin in source (devDependency, unused); reentrancy is a custom `noReentrant` bool-guard modifier, access control is per-function `msg.sender` checks (no Ownable/owner/admin), and contracts are non-upgradeable (no proxy/UUPS/initializer).

The below `foundry.toml` is **generic reference only** — this repo does not use it:

```toml
# REFERENCE ONLY — not used in this repo (Hardhat-only)
[profile.default]
src = "contracts"
out = "out"
solc = "0.8.28"
optimizer = true
optimizer_runs = 200
```

## Key Differences from Ethereum

1. **Native Token**: **PAS** on Paseo AH Next (not ETH, not DOT) — accessed via `msg.value` / `.call{value:}` same as ETH. Escrow in [P2PMarket.sol](../../packages/contracts/contracts/P2PMarket.sol) holds this **native token**; it is **not** an ERC-20.
2. **Gas Prices**: Generally lower than Ethereum mainnet
3. **Block Time**: ~6 seconds (faster than Ethereum)
4. **No Etherscan**: Use **Blockscout** (`blockscout-paseo-next`) for exploration
5. **No ERC-20 escrow asset**: The traded token is **conceptual only** as a distinct asset (priced USD = 1.00 on-chain). There is no IERC20 / `transferFrom` / `approve` anywhere — escrow uses the chain's native PAS via `msg.value`.

## Deployment

> **Actual deploy uses Hardhat scripts**, not `forge script`. See the `/deploy` skill and [packages/contracts/scripts/](../../packages/contracts/scripts/).

```bash
# From repo root
pnpm download:binaries          # one-time: fetch the resolc binary
pnpm contracts:compile
pnpm contracts:test             # hardhat test (Mocha/Chai/ethers)

# Deploy P2PMarket to Paseo AH Next (writes addresses to
# apps/web/.env.local + .github/env)
pnpm contracts:deploy           # scripts/deploy.ts

# ZKPassportRegistry is deployed separately
#   scripts/deploy-zkpassport.ts
# Seed demo data (2 agents + 10 offers)
pnpm contracts:seed             # scripts/seed.ts
```

The `forge script ... --rpc-url paseo --broadcast --slow` style commands are **generic Foundry reference** and do not apply to this repo.

## Environment Variables (packages/contracts/.env)

```
PRIVATE_KEY=0x...
PASEO_RPC_URL=https://eth-rpc-paseo-next.polkadot.io   # optional override
# Seeding keys (scripts/seed.ts)
AGENT1_KEY=0x...
AGENT2_KEY=0x...
PROVIDER1_KEY=0x...
PROVIDER2_KEY=0x...
```

The `paseo` network in [hardhat.config.ts](../../packages/contracts/hardhat.config.ts) reads `PASEO_RPC_URL` (defaulting to `https://eth-rpc-paseo-next.polkadot.io`) and `PRIVATE_KEY`.

## Common Issues & Solutions

1. **Missing resolc binary**: run `pnpm download:binaries` before `pnpm contracts:compile`.
2. **Account not funded**: contract writes need native PAS — fund the deployer/product account via `https://faucet.polkadot.io`. PGAS gas sponsorship is **not** wired anywhere.
3. **Contract verification**: use **Blockscout** (`apiKey.paseo: 'dummy'`, `apiURL: https://blockscout-paseo-next.polkadot.io/api`) via `@nomicfoundation/hardhat-verify` — not Etherscan.
4. **RPC timeout**: retry against `https://eth-rpc-paseo-next.polkadot.io`.

## Testing Against Asset Hub

Tests run with `hardhat test` (Mocha/Chai/ethers via `@nomicfoundation/hardhat-toolbox`); coverage via `solidity-coverage`; lint via `solhint`. See the `foundry-testing`/`/testing` skills for patterns, but note this repo does **not** use `forge test` or `vm.createSelectFork`.

## Anti-Patterns (FORBIDDEN)

| Pattern | Why Forbidden | Instead |
|---------|---------------|---------|
| Use Moonbeam | Not our target chain | MUST use Asset Hub Next EVM (`420420417`) |
| Target retired preview networks | Retired/stale | MUST target Paseo AH Next eth-rpc |
| Treat escrow asset as an ERC-20 token | Escrow uses native PAS via `msg.value` | MUST use native token, never `transferFrom`/`approve` |
| Hardcode RPC URLs in scripts | Not portable across environments | MUST read from `.env` / [hardhat.config.ts](../../packages/contracts/hardhat.config.ts) |
| Target `evm_version: london` | Output is PolkaVM, not EVM bytecode | MUST compile solc 0.8.28 + `viaIR` via resolc |
| Use Etherscan verification | Not supported on Asset Hub | MUST use Blockscout (`blockscout-paseo-next`) |
| Call `Revive.map_account` | AH Next AutoMapper handles SS58↔H160 | MUST rely on AutoMap |
| Commit `.env` file | Exposes private keys | MUST use `.gitignore` |
| Use ETH terminology in UI | Confuses Polkadot users | MUST use PAS for native token |
