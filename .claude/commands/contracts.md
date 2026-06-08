# /contracts - Smart Contract Implementation

Implement and maintain the LocalDOT smart contracts.

> This repo ships **two** Solidity files in
> [`packages/contracts/contracts/`](../../packages/contracts/contracts/):
> [`P2PMarket.sol`](../../packages/contracts/contracts/P2PMarket.sol) (`VERSION 7.0.0`)
> and [`ZKPassportRegistry.sol`](../../packages/contracts/contracts/ZKPassportRegistry.sol) (`1.0.0`).
> There is **no** `LocalDOTEscrow.sol` and **no** `MockERC20.sol`. Escrow holds the
> **chain-native token** (PAS on testnet) via `msg.value` / `.call{value:}` — *not* an
> ERC-20. "Hollar" is conceptual only (priced at USD 1.00 on-chain); there is no
> `IERC20` / `transferFrom` / `approve` anywhere. OpenZeppelin is a devDependency but
> **unused** in source.

## Security Requirements

**Reentrancy Protection:**
- A custom `noReentrant` modifier (single `bool _locked` guard), **not** OZ `ReentrancyGuard`
- Applied to every fund-moving function: `lockTrade`, `confirmTrade`, `confirmCashReceived`,
  `requestCancel`, `refundTrade`, `unstakeInsurance`, `removeAgent`
- Checks-effects-interactions throughout — state set, then `.call{value:}` last

**Access Control:**
- **No `owner`/admin, no `Ownable`, no privileged functions** — every guard is a
  per-function `msg.sender` check
- `confirmTrade` (direct trades) — only `locker` or `counterparty`
- `confirmCashReceived` — only the trade's `agent`
- `confirmPickup` — only the `locker` (provider)
- `requestCancel` / `setEvidenceCID` — only trade participants
- `refundTrade` — anyone, but only after `CONFIRMATION_TIMEOUT`; funds always go to the locker

**State Machine Enforcement:**
- Transitions are guarded inline with custom errors (`TradeNotLocked`, `TradeNotReleased`,
  `TimeoutReached`, `TimeoutNotReached`, `OnlyDirectTrades`, `OnlyAgentTrades`, …) —
  there is **no** generic `onlyState` modifier
- Custom errors for clear, gas-cheap reverts (no `require` string messages in the trade path)

**No Admin Keys (V1):**
- Contract is non-pausable and **non-upgradeable** — no proxy, no UUPS, no initializer
- Floating pragma `^0.8.28`
- Trustless operation — no privileged functions, no treasury, **no protocol fee**

**Event Emission:**
- All state transitions emit indexed events (`TradeLocked`, `TradeConfirmed`,
  `TradeReleased`, `TradeCompleted`, `CashReceived`, `PickupConfirmed`, `TradeRefunded`,
  `TradeCancelled`, `EvidenceAttached`, plus agent/offer events)
- Enables off-chain indexing and UI updates

---

## P2PMarket.sol

Native-token escrow marketplace with three roles — **Buyer**, **Provider**, and
**Handoff Agent** — supporting two trade paths:

- **Direct**: two people meet; both call `confirmTrade` → `COMPLETED`.
- **Agent-mediated**: a physical shop (agent) confirms the buyer's cash, releasing tokens
  to the buyer, then the provider confirms pickup of cash from the agent.

The agent fee is **cash / off-chain** — stored on-chain only for display, never moved by
the contract.

**Trade states (`enum TradeState`):**

| # | State | Meaning |
|---|-------|---------|
| 0 | `LOCKED` | Funds locked in escrow |
| 1 | `RELEASED` | Tokens sent to buyer, awaiting provider pickup (agent trades only) |
| 2 | `COMPLETED` | Trade fully done (both paths) |
| 3 | `REFUNDED` | Refunded to locker after timeout |
| 4 | `CANCELLED` | Returned to locker via mutual cancel |

There is **no `DEFAULTED` state** and **no stake-slashing**. `stakedAmount` is insurance
that is *reserved only* — fully refundable on `unstakeInsurance` / `removeAgent`.

**State machine:**
```
                 confirmTrade x2 (direct)
LOCKED ───────────────────────────────────► COMPLETED
   │
   │  confirmCashReceived (agent)            confirmPickup (provider)
   ├────────────────────────► RELEASED ───────────────────────────► COMPLETED
   │
   ├── refundTrade (anyone, after 24h) ─────► REFUNDED
   │
   └── requestCancel x2 (mutual) ───────────► CANCELLED
```

**Constants (exact):**

| Constant | Value |
|----------|-------|
| `VERSION` | `"7.0.0"` |
| `MAX_FLAT_FEE` | `1000` (whole currency units) |
| `OFFER_TTL` | `14 days` |
| `CONFIRMATION_TIMEOUT` | `24 hours` |
| `MIN_HOLD_HOURS` | `2` |
| `MAX_HOLD_HOURS` | `72` |
| `tokenPricePerCurrency["USD"]` | `100` (cents = 1.00 USD), set in constructor |

There is **no** `PROTOCOL_FEE`, **no** `MIN_TRADE_AMOUNT`, and **no** on-chain
`EVIDENCE_TTL`. No protocol fee is ever taken.

**Core escrow functions:**

| Function | Caller | Effect |
|----------|--------|--------|
| `lockTrade(counterparty, offerId, agent)` *(payable)* | either party | locks `msg.value` → `LOCKED`, returns `tradeId` |
| `confirmTrade(tradeId)` | locker / counterparty | direct trades; both confirm → `COMPLETED`, funds to counterparty |
| `confirmCashReceived(tradeId)` | agent | agent trades; → `RELEASED`, tokens to buyer, sets `pickupDeadline` |
| `confirmPickup(tradeId)` | locker (provider) | agent trades; `RELEASED` → `COMPLETED` |
| `requestCancel(tradeId)` | locker / counterparty | mutual; both request → `CANCELLED`, refund to locker |
| `refundTrade(tradeId)` | anyone | after 24h while `LOCKED` → `REFUNDED`, funds to locker |
| `setEvidenceCID(tradeId, cid)` | trade participant | attach a Bulletin CID (handoff video); last-writer-wins |

There is **no** `createTrade`, `fundEscrow`, `confirmHandover`, or `claimTimeout`.

**Agent management:** `registerAgent` (payable stake), `updateAgent`, `deactivateAgent`,
`reactivateAgent`, `stakeInsurance` (payable), `unstakeInsurance(amount)`, `removeAgent`.
Stake/unstake/remove are blocked while the agent has active (`LOCKED`/`RELEASED`) trades.

**Offer management:** `createOffer(offerType, amountAvailable, minAmount, flatFee, fiatCurrency, metadataCID, agentAddrs)`,
`removeOffer`, `pruneExpiredOffer`, `pruneExpiredOffers` (anyone can prune; `createOffer`
also opportunistically sweeps the caller's expired offers). Offer metadata
(location/availability) lives off-chain behind a Bulletin CID.

Reference shape (paraphrased — see
[`P2PMarket.sol`](../../packages/contracts/contracts/P2PMarket.sol) for the canonical source):

```solidity
// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.28;

contract P2PMarket {
    enum OfferType { SELL, BUY }
    enum TradeState { LOCKED, RELEASED, COMPLETED, REFUNDED, CANCELLED }

    string public constant VERSION = "7.0.0";
    uint256 public constant MAX_FLAT_FEE = 1000;
    uint256 public constant OFFER_TTL = 14 days;
    uint256 public constant CONFIRMATION_TIMEOUT = 24 hours;
    uint8 public constant MIN_HOLD_HOURS = 2;
    uint8 public constant MAX_HOLD_HOURS = 72;

    struct Trade {
        uint256 id;
        uint256 offerId;             // 0 for ad-hoc trades
        address locker;              // deposited native tokens (provider)
        address counterparty;        // receives tokens after confirmation (buyer)
        address agent;               // address(0) for direct trades
        uint256 amount;              // locked native token amount
        TradeState state;
        bool lockerConfirmed;        // direct trades only
        bool counterpartyConfirmed;  // direct trades only
        bool lockerCancelRequested;
        bool counterpartyCancelRequested;
        uint256 lockedAt;
        uint256 pickupDeadline;      // set on RELEASED: lockedAt + agent.holdHours
        string evidenceCID;          // Bulletin CID for handoff video
    }

    mapping(uint256 => Trade) public trades;
    mapping(string => uint256) public tokenPricePerCurrency; // cents per token

    bool private _locked;
    modifier noReentrant() {
        if (_locked) revert ReentrancyGuard();
        _locked = true;
        _;
        _locked = false;
    }

    constructor() {
        tokenPricePerCurrency["USD"] = 100; // 1 token = 1.00 USD
    }

    /// @notice Lock native tokens (PAS) for a trade. Either party can lock.
    function lockTrade(address counterparty, uint256 offerId, address agent)
        external payable noReentrant returns (uint256)
    {
        if (counterparty == address(0) || counterparty == msg.sender) revert InvalidCounterparty();
        if (msg.value == 0) revert InvalidAmount();
        // ... validate agent + offer, write Trade, state = LOCKED, emit TradeLocked
    }

    /// @notice Direct trades: both parties confirm → COMPLETED, funds to counterparty.
    function confirmTrade(uint256 tradeId) external noReentrant { /* ... */ }

    /// @notice Agent confirms buyer's cash → RELEASED, tokens to buyer.
    function confirmCashReceived(uint256 tradeId) external noReentrant { /* ... */ }

    /// @notice Provider confirms cash pickup from agent → COMPLETED.
    function confirmPickup(uint256 tradeId) external { /* ... */ }

    /// @notice Mutual cancel → CANCELLED, refund to locker.
    function requestCancel(uint256 tradeId) external noReentrant { /* ... */ }

    /// @notice After CONFIRMATION_TIMEOUT while LOCKED → REFUNDED, funds to locker.
    function refundTrade(uint256 tradeId) external noReentrant { /* ... */ }
}
```

---

## ZKPassportRegistry.sol

On-chain registry backing identity verification. The zero-knowledge passport proof is
produced **off-chain** with the [`@zkpassport/sdk`](https://github.com/zkpassport); the
registry stores only a `keccak256(uniqueId)` and a `bytes2` country code, enforcing **one
passport per wallet**. This **replaces** the old DIM1 / Proof-of-Personhood placeholder.
Deployed separately from `P2PMarket` via
[`scripts/deploy-zkpassport.ts`](../../packages/contracts/scripts/deploy-zkpassport.ts);
its address is read by the frontend (`VITE_ZKPASSPORT_REGISTRY_ADDRESS`) to render the
`VerifiedBadge`.

---

## Hardhat Configuration

> This repo uses **Hardhat + `@parity/hardhat-polkadot`** — **not** Foundry. There is no
> `forge` / `anvil` / `foundry.toml` / `*.s.sol`. Tests are Mocha/Chai/ethers via
> `@nomicfoundation/hardhat-toolbox`; coverage via `solidity-coverage`; lint via `solhint`.

The canonical config is
[`hardhat.config.ts`](../../packages/contracts/hardhat.config.ts):

```typescript
// packages/contracts/hardhat.config.ts
import '@nomicfoundation/hardhat-toolbox';
import '@nomicfoundation/hardhat-verify';
import 'hardhat-contract-sizer';
import 'hardhat-gas-reporter';
import 'solidity-coverage';
import '@parity/hardhat-polkadot';
import { HardhatUserConfig } from 'hardhat/config';
import 'dotenv/config';

const config: HardhatUserConfig = {
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
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      chainId: 31337,
      blockGasLimit: 16777216,
    },
    // Paseo Asset Hub Next (v2) — PRIVATE_KEY must be set in .env
    paseo: {
      url: process.env.PASEO_RPC_URL || 'https://eth-rpc-paseo-next.polkadot.io',
      chainId: 420420417,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      polkadot: { target: 'pvm' },
    },
  },
  etherscan: {
    apiKey: { paseo: 'dummy' },
    customChains: [
      {
        network: 'paseo',
        chainId: 420420417,
        urls: {
          apiURL: 'https://blockscout-paseo-next.polkadot.io/api',
          browserURL: 'https://blockscout-paseo-next.polkadot.io',
        },
      },
    ],
  },
};

export default config;
```

**Notes:**
- Solidity compiles to **PVM via Revive** (Solidity → YUL → LLVM IR → RISC-V → PVM). The
  `resolc` binary is fetched by `pnpm download:binaries` (writes to `./bin/resolc`) — run
  it once before compiling.
- Verification uses **Blockscout** (not Etherscan) at
  `https://blockscout-paseo-next.polkadot.io`; the `etherscan.apiKey` is a placeholder.
- Max contract size is 100KB on PVM (larger than EVM's 24KB).

---

## Deployment & Seeding

- [`scripts/deploy.ts`](../../packages/contracts/scripts/deploy.ts) deploys **only**
  `P2PMarket` and writes the resulting address to `apps/web/.env.local` and `.github/env`.
- [`scripts/deploy-zkpassport.ts`](../../packages/contracts/scripts/deploy-zkpassport.ts)
  deploys `ZKPassportRegistry` separately.
- [`scripts/seed.ts`](../../packages/contracts/scripts/seed.ts) registers 2 demo agents and
  10 offers (uses `AGENT1_KEY` / `AGENT2_KEY` / `PROVIDER1_KEY` / `PROVIDER2_KEY` from
  `.env`).

Contract `.env` keys: `PRIVATE_KEY`, optional `PASEO_RPC_URL`, plus the seeding keys above.

Run from the repo root: `pnpm contracts:compile`, `pnpm contracts:test`,
`pnpm contracts:deploy`, `pnpm contracts:seed`, `pnpm download:binaries`.

---

## Roadmap — NOT implemented in V1

The escrow design above is the *shipped* one. The following are explicitly **not** built
and are out of scope for V1 (see the project README/CLAUDE.md roadmap):

- **Agent-stake slashing / a `DEFAULTED` state** — `stakedAmount` is reserved-only and
  fully refundable; nothing slashes it.
- **On-chain disputes** — resolution is escrow + 24h timeout only.
- **Reputation** — no on-chain scoring.
- **Multi-asset / multi-currency** — native token only, USD priced 1.00.
- **A real Hollar ERC-20 stablecoin** — today the escrow holds native PAS; "Hollar" is
  conceptual.
- **Full PGAS gas sponsorship** — contract writes still require a funded account; the
  product account must hold native balance (faucet on testnet).
