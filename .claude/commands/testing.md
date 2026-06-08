# /testing - Test Implementation

Write and run tests for LocalDOT.

> **What this repo actually uses:** Contract tests run on **Hardhat + Mocha/Chai + ethers v6**
> (`@nomicfoundation/hardhat-toolbox`), with time travel via `evm_increaseTime` /
> `@nomicfoundation/hardhat-network-helpers`. Coverage is `solidity-coverage` (`hardhat coverage`).
> There is **no Foundry** (no `forge`/`anvil`). The escrow holds the **chain-native token**
> (`{ value: ... }` / `.call{value:}`), **not** an ERC-20 — there is no `MockERC20` and no
> `LocalDOTEscrow`. The two contracts are [`P2PMarket.sol`](../../packages/contracts/contracts/P2PMarket.sol)
> (v7.0.0) and [`ZKPassportRegistry.sol`](../../packages/contracts/contracts/ZKPassportRegistry.sol) (v1.0.0).
> The frontend has **no Vitest/Testing-Library unit suite** — the only automated frontend tests are
> **Playwright e2e** specs under [`apps/web/e2e/`](../../apps/web/e2e/).

---

## Contract Tests

Tests live in [`packages/contracts/test/`](../../packages/contracts/test/):
[`P2PMarket.test.ts`](../../packages/contracts/test/P2PMarket.test.ts) and
[`ZKPassportRegistry.test.ts`](../../packages/contracts/test/ZKPassportRegistry.test.ts).
The escrow lifecycle is native-value: the locker (a provider, or an agent for the agent path)
sends `{ value: amount }` on `lockTrade`, and release/refund pay out via the contract's
internal `.call{value:}`. Trade states are `LOCKED(0)`, `RELEASED(1)`, `COMPLETED(2)`,
`REFUNDED(3)`, `CANCELLED(4)`.

```typescript
// packages/contracts/test/P2PMarket.test.ts
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { P2PMarket } from '../typechain-types';

describe('P2PMarket', function () {
  let market: P2PMarket;
  let agent1: Awaited<ReturnType<typeof ethers.getSigners>>[0];
  let provider: Awaited<ReturnType<typeof ethers.getSigners>>[0];
  let buyer: Awaited<ReturnType<typeof ethers.getSigners>>[0];

  beforeEach(async function () {
    [, agent1, , provider, buyer] = await ethers.getSigners();
    const P2PMarketFactory = await ethers.getContractFactory('P2PMarket');
    market = await P2PMarketFactory.deploy(); // no constructor args; no owner/admin
  });

  describe('Direct path — lockTrade + confirmTrade', function () {
    it('locks native value and emits TradeLocked', async function () {
      const amount = ethers.parseEther('10');
      // lockTrade(counterparty, offerId, agent, { value }); agent = ZeroAddress for direct trades
      await expect(
        market.connect(provider).lockTrade(buyer.address, 0, ethers.ZeroAddress, { value: amount })
      )
        .to.emit(market, 'TradeLocked')
        .withArgs(1n, provider.address, buyer.address, ethers.ZeroAddress, amount);

      const trade = await market.getTrade(1n);
      expect(trade.locker).to.equal(provider.address);
      expect(trade.counterparty).to.equal(buyer.address);
      expect(trade.state).to.equal(0); // LOCKED
    });

    it('releases to counterparty when both confirm -> COMPLETED', async function () {
      const amount = ethers.parseEther('10');
      await market.connect(provider).lockTrade(buyer.address, 0, ethers.ZeroAddress, { value: amount });

      await market.connect(provider).confirmTrade(1n);

      const beforeBal = await ethers.provider.getBalance(buyer.address);
      const tx = await market.connect(buyer).confirmTrade(1n);
      const receipt = await tx.wait();
      const gasUsed = receipt!.gasUsed * receipt!.gasPrice;
      const afterBal = await ethers.provider.getBalance(buyer.address);

      // counterparty (buyer) received the locked native amount, net of its own gas
      expect(afterBal - beforeBal + gasUsed).to.equal(amount);
      expect((await market.getTrade(1n)).state).to.equal(2); // COMPLETED
    });

    it('rejects confirmTrade on an agent-mediated trade', async function () {
      await market.connect(agent1).registerAgent('Agent A', 'QmA', 5n, 4n, 0n);
      await market.connect(provider).lockTrade(buyer.address, 0, agent1.address, { value: ethers.parseEther('10') });
      await expect(
        market.connect(provider).confirmTrade(1n)
      ).to.be.revertedWithCustomError(market, 'OnlyDirectTrades');
    });
  });

  describe('Agent path — confirmCashReceived + confirmPickup', function () {
    beforeEach(async function () {
      // agents register with a payable insurance stake
      await market.connect(agent1).registerAgent('Agent A', 'QmA', 5n, 4n, 0n, { value: ethers.parseEther('100') });
      await market.connect(provider).lockTrade(buyer.address, 0, agent1.address, { value: ethers.parseEther('10') });
    });

    it('agent confirmCashReceived pays the buyer and sets RELEASED', async function () {
      const before = await ethers.provider.getBalance(buyer.address);
      await market.connect(agent1).confirmCashReceived(1n);
      const after = await ethers.provider.getBalance(buyer.address);

      expect(after - before).to.equal(ethers.parseEther('10'));
      expect((await market.getTrade(1n)).state).to.equal(1); // RELEASED
    });

    it('provider confirmPickup finalizes the trade -> COMPLETED', async function () {
      await market.connect(agent1).confirmCashReceived(1n);
      await market.connect(provider).confirmPickup(1n);
      expect((await market.getTrade(1n)).state).to.equal(2); // COMPLETED
    });
  });

  describe('Timeout path — refundTrade', function () {
    beforeEach(async function () {
      await market.connect(provider).lockTrade(buyer.address, 0, ethers.ZeroAddress, { value: ethers.parseEther('10') });
    });

    it('reverts before the 24h CONFIRMATION_TIMEOUT', async function () {
      await expect(
        market.connect(provider).refundTrade(1n)
      ).to.be.revertedWithCustomError(market, 'TimeoutNotReached');
    });

    it('anyone may refund the locker after timeout -> REFUNDED', async function () {
      await ethers.provider.send('evm_increaseTime', [25 * 60 * 60]); // 25h
      await ethers.provider.send('evm_mine', []);

      await expect(market.connect(buyer).refundTrade(1n))
        .to.emit(market, 'TradeRefunded')
        .withArgs(1n, provider.address, ethers.parseEther('10'));
      expect((await market.getTrade(1n)).state).to.equal(3); // REFUNDED
    });
  });

  describe('Mutual cancel — requestCancel', function () {
    beforeEach(async function () {
      await market.connect(provider).lockTrade(buyer.address, 0, ethers.ZeroAddress, { value: ethers.parseEther('10') });
    });

    it('cancels only after both parties request -> CANCELLED', async function () {
      await market.connect(provider).requestCancel(1n);
      await market.connect(buyer).requestCancel(1n);
      expect((await market.getTrade(1n)).state).to.equal(4); // CANCELLED
    });

    it('rejects requestCancel from a non-participant', async function () {
      await expect(
        market.connect(agent1).requestCancel(1n)
      ).to.be.revertedWithCustomError(market, 'NotTradeParticipant');
    });
  });

  describe('Insurance stake guards', function () {
    beforeEach(async function () {
      await market.connect(agent1).registerAgent('Agent A', 'QmA', 5n, 4n, 0n, { value: ethers.parseEther('5') });
    });

    it('rejects stakeInsurance from a non-agent', async function () {
      await expect(
        market.connect(provider).stakeInsurance({ value: ethers.parseEther('1') })
      ).to.be.revertedWithCustomError(market, 'AgentNotRegistered');
    });

    it('rejects a zero-value stake', async function () {
      await expect(
        market.connect(agent1).stakeInsurance({ value: 0n })
      ).to.be.revertedWithCustomError(market, 'InvalidAmount');
    });
  });
});
```

> **Note (access control & guards):** `P2PMarket` has **no `Ownable`/owner/admin** — every
> function uses per-caller `msg.sender` checks. Reentrancy is a single-`bool` `noReentrant`
> modifier, **not** OpenZeppelin `ReentrancyGuard` (OZ is a dev-dependency but unused in source).
> No protocol fee is ever taken; the agent fee is cash/off-chain and stored on-chain only for display.

The [`ZKPassportRegistry.test.ts`](../../packages/contracts/test/ZKPassportRegistry.test.ts) suite
covers `submitAttestation` storing `keccak256(uniqueId)` + a `bytes2` country code, the
one-passport-per-wallet `uniqueIdToWallet` mapping, and `isVerified`.

---

## Frontend Tests

> **What this repo actually uses:** the frontend has **no Vitest/React-Testing-Library setup**.
> Trade state is read over Substrate via PAPI (`ReviveApi.call` dry-run), not via a TanStack-Query
> hook against an EVM RPC. The example below uses the real
> [`useEscrow`](../../apps/web/src/hooks/useEscrow.ts) hook (it drives `P2PMarket` trade lifecycle:
> `lockTrade`, `confirmTrade`, `refundTrade`, `getTrade`). A `ContractTrade` exposes
> `locker` / `counterparty` (not `buyer`), `amount`, and `state` (0..4). Offers, agents, and
> insurance live on [`useP2PMarket`](../../apps/web/src/hooks/useP2PMarket.ts).

```typescript
// Reading a trade via the real hook (illustrative — no unit runner is configured)
import { useEscrow } from '@/hooks';
import { TradeState } from '@localdot/types';

async function loadTrade(getTrade: ReturnType<typeof useEscrow>['getTrade']) {
  const trade = await getTrade(1n); // ContractTrade
  // trade.locker / trade.counterparty (not trade.buyer)
  // trade.state is a number: LOCKED 0, RELEASED 1, COMPLETED 2, REFUNDED 3, CANCELLED 4
  return trade.state === TradeState.COMPLETED;
}
```

End-to-end coverage is Playwright. Specs live in [`apps/web/e2e/`](../../apps/web/e2e/) and mount the
product inside a **test host** (the Polkadot Triangle host is injected, never a browser wallet):

```typescript
// apps/web/e2e/app-load.spec.ts
import { test, expect } from './fixtures';
import { waitForAppReady } from './helpers';

test('renders the header nav', async ({ testHost }) => {
  const frame = await waitForAppReady(testHost);
  const headerNav = frame.locator('header nav').first();
  await expect(headerNav.getByRole('link', { name: 'Exchange', exact: true })).toBeVisible();
  await expect(headerNav.getByRole('link', { name: 'Explore', exact: true })).toBeVisible();
});
```

---

## Coverage Requirements

**Contract Tests (packages/contracts):**
```
Coverage targets (via solidity-coverage / `hardhat coverage`):
- Statements: 100%
- Branches: 100%
- Functions: 100%
- Lines: 100%

Required test scenarios:
- Happy path for each user flow (direct + agent-mediated)
- All revert conditions (custom errors)
- Edge cases (zero value, MAX_FLAT_FEE boundary, MIN/MAX_HOLD_HOURS)
- Access control violations (per-function msg.sender checks)
- Reentrancy attempts (noReentrant modifier)
- State machine transitions across LOCKED/RELEASED/COMPLETED/REFUNDED/CANCELLED
```

**Frontend Tests (apps/web):**
```
Required coverage:
- Playwright e2e smoke: app mounts in the test host, header nav + landing render
- Host-injected wallet / host-API path exercised (see host-api.spec.ts, wallet.spec.ts)
- Navigation across the main routes (navigation.spec.ts)

Note: there is no Vitest unit/component suite configured. PAPI reads use ReviveApi.call
dry-runs, so hook-level data fetching is integration-tested through the e2e host, not mocked.
```

---

## Running Tests

```bash
# Run all package tests (Turborepo)
pnpm test

# Contract tests only (Hardhat + Mocha/Chai)
pnpm contracts:test
# or:  pnpm --filter @localdot/contracts test

# Contract coverage (solidity-coverage)
pnpm --filter @localdot/contracts coverage

# Frontend e2e (Playwright)
pnpm --filter @localdot/web test:e2e
pnpm --filter @localdot/web test:e2e:ui   # interactive UI mode

# Contract lint (solhint)
pnpm --filter @localdot/contracts lint
```

> First-time setup: run `pnpm download:binaries` once so Hardhat can find the `resolc`
> compiler binary (`resolcPath: ./bin/resolc`) used to build for PolkaVM.

---

## Test Scenarios to Cover

**P2PMarket — direct path:**
- [ ] `lockTrade` with `{ value }` (agent = ZeroAddress) locks funds, sets state LOCKED, emits `TradeLocked`
- [ ] `lockTrade` rejects zero value / zero-address counterparty / self-trade
- [ ] `lockTrade` enforces offer min/MAX_FLAT_FEE / amountAvailable when an offerId is supplied
- [ ] `confirmTrade` by locker then counterparty (any order) releases native value, sets COMPLETED
- [ ] `confirmTrade` rejects double confirm, non-participant, non-existent trade, and post-timeout
- [ ] `confirmTrade` reverts on agent-mediated trades (`OnlyDirectTrades`)

**P2PMarket — agent path:**
- [ ] `confirmCashReceived` by the agent pays the buyer and sets RELEASED, records pickupDeadline
- [ ] `confirmCashReceived` rejected for non-agent / direct (no-agent) trades
- [ ] `confirmPickup` by the provider sets COMPLETED
- [ ] `confirmPickup` rejected for non-provider / trades not in RELEASED

**P2PMarket — cancel & timeout:**
- [ ] `requestCancel` cancels only after BOTH parties request, sets CANCELLED
- [ ] `requestCancel` rejects non-participant and double request from the same party
- [ ] `refundTrade` reverts before the 24h CONFIRMATION_TIMEOUT (`TimeoutNotReached`)
- [ ] `refundTrade` after timeout refunds the locker, sets REFUNDED, callable by anyone
- [ ] `refundTrade` reverts on trades not in LOCKED (`TradeNotLocked`)

**P2PMarket — offer & agent registry:**
- [ ] `createOffer` stores fields, links agents, enforces MAX_FLAT_FEE; `removeOffer` by owner
- [ ] `pruneExpiredOffer(s)` drops offers past OFFER_TTL (14 days)
- [ ] `registerAgent` (payable stake) emits `AgentRegistered`; rejects duplicate / empty name / empty CID / fee > MAX_FLAT_FEE
- [ ] `updateAgent` / `deactivateAgent` / `reactivateAgent` / `removeAgent` access + state guards

**P2PMarket — insurance stake:**
- [ ] `stakeInsurance` (payable) increases stake; rejects non-agent and zero-value stakes
- [ ] `unstakeInsurance` withdraws and rejects over-withdrawal / non-agent callers

**ZKPassportRegistry:**
- [ ] `submitAttestation` stores `keccak256(uniqueId)` + `bytes2` country code, emits `AttestationSubmitted`
- [ ] one passport per wallet via `uniqueIdToWallet`; `isVerified` reflects attestation
- [ ] attestation without a disclosed country (`0x0000`) is accepted

**Frontend (Playwright e2e):**
- [ ] App mounts in the test host and renders the header brand + nav (Exchange, Explore, Create, Profile, About)
- [ ] Landing page renders below the header
- [ ] Host-API / host-injected wallet path is available (no `window.ethereum`)
- [ ] Navigation across main routes works
```
