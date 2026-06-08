---
name: deploy-contracts
description: "Deploy smart contracts to Polkadot Asset Hub. Triggers: deploy, deployment, paseo, mainnet"
---

# Deploy Contracts

> **What this repo actually uses:** Hardhat + `@parity/hardhat-polkadot` (PolkaVM via the
> `resolc` binary), **not** Foundry. There is no `forge`/`anvil`, no `foundry.toml`, no `*.s.sol`
> scripts. The two contracts — [`P2PMarket.sol`](../../../packages/contracts/contracts/P2PMarket.sol)
> (VERSION 7.0.0) and [`ZKPassportRegistry.sol`](../../../packages/contracts/contracts/ZKPassportRegistry.sol)
> (1.0.0) — are **non-upgradeable**: no proxy, no UUPS, no initializer, no `Ownable`. Deploy with
> plain `hardhat run` scripts. The Foundry / proxy / upgrade material below is kept only as generic
> reference and does **not** apply here.

## When to Activate

- Deploying contracts to Paseo Asset Hub Next (testnet) or mainnet
- Re-deploying after a contract change (every deploy is a fresh, non-upgradeable instance)
- Seeding demo data after deployment

## Global Invariants

| Rule | Enforcement |
|------|-------------|
| Use Hardhat (`hardhat run`) for all deploys | REQUIRED — no Foundry in this repo |
| `PRIVATE_KEY` set in `packages/contracts/.env` | REQUIRED before deployment |
| Deployer account holds native PAS (faucet on testnet) | REQUIRED — no gas sponsorship wired |
| Log all deployed addresses | REQUIRED (scripts also write them to env files) |
| Contracts are non-upgradeable | A new deploy = new address; update env/CI accordingly |

## Network Configuration

| Network | EVM RPC (ethers) | Chain ID | Use Case |
|---------|------------------|----------|----------|
| Paseo Asset Hub Next (testnet) | https://eth-rpc-paseo-next.polkadot.io | 420420417 | Integration / pre-prod |
| Local Hardhat | (in-process) | 31337 | Unit tests |
| Mainnet | TBD | TBD | Production |

Block explorer (testnet): https://blockscout-paseo-next.polkadot.io
Native token: **PAS** (10 decimals). Escrow uses the chain-native token via `msg.value`, not an ERC-20.

## Deployment Workflow

### 1. Pre-deployment Checklist

```bash
# Set PRIVATE_KEY (and optional PASEO_RPC_URL) in packages/contracts/.env
# Verify it's present
grep -q '^PRIVATE_KEY=' packages/contracts/.env && echo 'PRIVATE_KEY set' || echo 'PRIVATE_KEY MISSING'

# Download the resolc binary once (required for PolkaVM compilation)
pnpm download:binaries

# Build + test contracts
pnpm contracts:compile
pnpm contracts:test
```

### 2. Deploy P2PMarket to Paseo Asset Hub Next

`scripts/deploy.ts` deploys **only** [`P2PMarket`](../../../packages/contracts/contracts/P2PMarket.sol),
verifies its initial state (`VERSION`, `getOfferCount`), and writes the new address +
`VITE_CHAIN_ID` + `VITE_RPC_URL` into both `apps/web/.env.local` and `.github/env`.

```bash
# from packages/contracts
pnpm deploy
# i.e. hardhat run scripts/deploy.ts --network paseo
```

Or from the repo root:

```bash
pnpm contracts:deploy
```

### 3. Deploy ZKPassportRegistry (separate script)

The registry is **not** deployed by `deploy.ts`. It has its own script,
[`scripts/deploy-zkpassport.ts`](../../../packages/contracts/scripts/deploy-zkpassport.ts), which
writes `VITE_ZKPASSPORT_REGISTRY_ADDRESS` into `apps/web/.env.local` and `.github/env`.

```bash
# from packages/contracts
hardhat run scripts/deploy-zkpassport.ts --network paseo
```

### 4. Seed Demo Data (optional)

[`scripts/seed.ts`](../../../packages/contracts/scripts/seed.ts) registers 2 demo agents and 10
offers against the deployed `P2PMarket`. It uses the `AGENT1_KEY` / `AGENT2_KEY` /
`PROVIDER1_KEY` / `PROVIDER2_KEY` keys from `packages/contracts/.env`.

```bash
# from packages/contracts
pnpm seed
# or from root:
pnpm contracts:seed
```

## Hardhat Config for PolkaVM

The real config lives in
[`packages/contracts/hardhat.config.ts`](../../../packages/contracts/hardhat.config.ts): solc
`0.8.28`, optimizer runs `200`, `viaIR: true`, `resolc.compilerSource: 'binary'` with
`resolcPath: './bin/resolc'`. The `paseo` network targets PolkaVM (`polkadot.target: 'pvm'`).

```typescript
// hardhat.config.ts (excerpt)
networks: {
  hardhat: { chainId: 31337, allowUnlimitedContractSize: true },
  paseo: {
    url: process.env.PASEO_RPC_URL || 'https://eth-rpc-paseo-next.polkadot.io',
    chainId: 420420417,
    accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    polkadot: { target: 'pvm' },  // Required for PolkaVM
  },
},
resolc: {
  compilerSource: 'binary',
  settings: { resolcPath: './bin/resolc' },
},
```

Blockscout verification is configured via the `etherscan` customChains entry pointing at
`https://blockscout-paseo-next.polkadot.io/api`.

### Verify PolkaVM Compilation

Check that artifacts carry PVM bytecode (starts with `0x50564d00`):

```bash
jq -r '.bytecode' packages/contracts/artifacts/contracts/P2PMarket.sol/P2PMarket.json | head -c 20
# Should output: 0x50564d0000...
```

## Common Issues

| Issue | Solution |
|-------|----------|
| Transaction is temporarily banned | Wait and retry; or deploy via ethers with explicit gas params (below) |
| Transaction underpriced | Set explicit `gasPrice: feeData.gasPrice * 2n` |
| Nonce too low | Wait and retry, or check pending transactions |
| Out of gas | Increase gas limit: `gasLimit: 10_000_000n` |
| Signature invalid | Check `PRIVATE_KEY` format (with `0x` prefix) |
| Contract write reverts / "insufficient funds" | Deployer/product account needs native PAS — no gas sponsorship is wired |

### "Transaction is temporarily banned" Workaround

The RPC proxy can temporarily ban a tx whose hash it just saw. Retrying after a short delay usually
clears it. If the Hardhat deploy still fails, deploy the contract with ethers directly, using explicit
gas params:

```typescript
import { ethers } from 'ethers';
import fs from 'fs';

const provider = new ethers.JsonRpcProvider('https://eth-rpc-paseo-next.polkadot.io');
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
const artifact = JSON.parse(
  fs.readFileSync('./artifacts/contracts/P2PMarket.sol/P2PMarket.json', 'utf8'),
);
const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
const feeData = await provider.getFeeData();

const contract = await factory.deploy({
  gasLimit: 10_000_000n,
  gasPrice: feeData.gasPrice ? feeData.gasPrice * 2n : 1_000_000_000n,
});
await contract.waitForDeployment();
console.log('Contract deployed at:', await contract.getAddress());
```

## Re-deploying After a Contract Change

Because the contracts are **non-upgradeable**, there is no proxy upgrade path. To ship a contract
change you deploy a fresh instance and point the frontend at the new address:

1. `pnpm contracts:compile`
2. `pnpm contracts:deploy` (writes the new `VITE_P2PMARKET_ADDRESS` into `apps/web/.env.local` + `.github/env`)
3. Re-run `deploy-zkpassport.ts` only if the registry changed
4. Re-seed if you want demo data on the new instance

---

## Generic Reference — NOT used by this repo

> The sections below describe Foundry-based, upgradeable (UUPS proxy) deployment. **This project
> uses none of it** — it is retained only as generic background. For LocalDOT, follow the Hardhat
> workflow above.

### Foundry deploy (reference only)

```bash
# NOTE: this repo has no foundry.toml / *.s.sol. Reference only.
source .env
forge script script/Deploy.s.sol --rpc-url paseo --broadcast --slow -vvvv
```

### UUPS proxy pattern (reference only)

```solidity
// NOTE: LocalDOT contracts are non-upgradeable — no proxy, no initializer, no Ownable.
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

ERC1967Proxy proxy = new ERC1967Proxy(
    address(impl),
    abi.encodeCall(MyContract.initialize, (admin))
);
```

### Upgrading via proxy (reference only)

```solidity
// NOTE: not applicable here — a LocalDOT redeploy creates a brand-new address.
MyContract(proxyAddress).upgradeToAndCall(address(newImpl), "");
```

### Anti-Patterns (generic)

| Pattern | Status | Reason |
|---------|--------|--------|
| Deploy without checking `PRIVATE_KEY` | FORBIDDEN | Missing key fails silently |
| Forget to fund the deployer with native PAS | FORBIDDEN | No gas sponsorship — writes revert |
| Forget to update `apps/web/.env.local` / `.github/env` | FORBIDDEN | Frontend points at stale address |
| (Foundry-specific) Deploy without `--slow` | N/A | Foundry not used here |
| (Proxy-specific) Initialize in constructor | N/A | No proxies/initializers here |
