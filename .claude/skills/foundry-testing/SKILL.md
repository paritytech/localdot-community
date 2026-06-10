---
name: foundry-testing
description: "Foundry testing patterns for Solidity contracts. Triggers: test, testing, forge test, coverage, solidity test"
---

# Foundry Testing Patterns

> **THIS REPO DOES NOT USE FOUNDRY.** The two Solidity contracts
> ([P2PMarket.sol](../../../packages/contracts/contracts/P2PMarket.sol) and
> [ZKPassportRegistry.sol](../../../packages/contracts/contracts/ZKPassportRegistry.sol))
> are tested with **Hardhat** (`hardhat test`, Mocha/Chai/ethers v6 via
> `@nomicfoundation/hardhat-toolbox`), with coverage via `solidity-coverage`.
> Tests are TypeScript, not Solidity, and live in
> [packages/contracts/test/](../../../packages/contracts/test/) —
> [P2PMarket.test.ts](../../../packages/contracts/test/P2PMarket.test.ts) and
> [ZKPassportRegistry.test.ts](../../../packages/contracts/test/ZKPassportRegistry.test.ts).
> There is no `forge`, `foundry.toml`, or `*.t.sol`. For the actual
> project test workflow see the `/testing` command
> ([.claude/commands/testing.md](../../commands/testing.md)).
> The Foundry/`forge` patterns below are kept **only as generic external
> reference** — they are not how this project tests.

## When to Activate

- Writing new contract tests
- Setting up test fixtures
- Integration testing across contracts

> Note: this project's contracts are **non-upgradeable** (no proxy, no UUPS,
> no initializer). Disregard the upgradeable/proxy guidance below for this repo.

## Global Invariants

| Rule | Enforcement |
|------|-------------|
| Inherit from Test base | REQUIRED |
| Use vm.prank for caller | REQUIRED |
| Test revert conditions | REQUIRED |
| Name tests descriptively | test_Action or test_RevertWhen_Condition |

## Test Setup Pattern

> **This repo:** there is no proxy, no `initialize`, and no `MockERC20` — escrow
> uses the **chain native token** (`msg.value` / `.call{value:}`), not an ERC-20.
> The real setup is a Hardhat `beforeEach` that deploys `P2PMarket` directly and
> grabs signers from `ethers.getSigners()`:
>
> ```typescript
> // packages/contracts/test/P2PMarket.test.ts (Mocha/Chai/ethers v6)
> beforeEach(async function () {
>   [owner, agent1, agent2, provider, buyer] = await ethers.getSigners();
>   const P2PMarketFactory = await ethers.getContractFactory('P2PMarket');
>   market = await P2PMarketFactory.deploy();
> });
> ```
>
> The Solidity `setUp()` fixture below is generic Foundry reference only.

```solidity
// test/Base.t.sol
abstract contract BaseTest is Test {
    MyContract public myContract;
    MockToken public token;

    address public admin = makeAddr("admin");
    address public user1 = makeAddr("user1");
    address public user2 = makeAddr("user2");

    function setUp() public virtual {
        // Deploy with proxies (if upgradeable)
        MyContract impl = new MyContract();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeCall(MyContract.initialize, (admin))
        );
        myContract = MyContract(address(proxy));

        // Deploy mock token
        token = new MockToken();

        // Fund test accounts
        vm.deal(user1, 100 ether);
        token.mint(user1, 1000e18);
    }
}
```

## Test Naming Convention

| Pattern | Example |
|---------|---------|
| Happy path | `test_CreateOrder` |
| Revert condition | `test_RevertWhen_InsufficientBalance` |
| Edge case | `test_CreateOrder_WithZeroAmount` |
| Fuzz test | `testFuzz_Transfer(uint256 amount)` |

## Common Test Patterns

### Testing Basic Operations

```solidity
function test_CreateOrder() public {
    vm.prank(user1);
    uint256 orderId = myContract.createOrder(100);

    assertEq(myContract.ownerOf(orderId), user1);
    assertTrue(myContract.isActive(orderId));
}
```

### Testing Reverts

```solidity
function test_RevertWhen_NotOwner() public {
    vm.prank(user1);
    uint256 orderId = myContract.createOrder(100);

    vm.prank(user2);  // Not the owner
    vm.expectRevert("Not owner");
    myContract.cancelOrder(orderId);
}
```

### Testing with Pranks

```solidity
function test_AdminFunction() public {
    vm.prank(admin);
    myContract.pause();

    assertTrue(myContract.paused());
}

function test_MultipleActions() public {
    vm.startPrank(user1);
    uint256 id = myContract.createOrder(100);
    myContract.updateOrder(id, 200);
    vm.stopPrank();
}
```

### Testing Events

```solidity
function test_EmitsEvent() public {
    vm.expectEmit(true, true, false, true);
    emit OrderCreated(1, user1, 100);

    vm.prank(user1);
    myContract.createOrder(100);
}
```

### Testing with Value

```solidity
function test_DepositNativeToken() public {
    vm.prank(user1);
    uint256 depositId = myContract.deposit{value: 1 ether}();

    assertEq(address(myContract).balance, 1 ether);
}
```

## Mock Contracts

> **This repo has no mock token.** Escrow is the native token, and neither
> contract inherits OpenZeppelin (it is an unused devDependency). The
> generic `ERC20` mock below is external reference only — do not assume a
> `MockERC20` exists in `packages/contracts/contracts/`.

```solidity
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Generic Foundry reference only — NOT present in this repo.
contract MockToken is ERC20 {
    constructor() ERC20("Mock", "MOCK") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
```

## Fuzz Testing

```solidity
function testFuzz_Transfer(uint256 amount) public {
    vm.assume(amount > 0 && amount <= 1000e18);

    token.mint(user1, amount);

    vm.prank(user1);
    token.transfer(user2, amount);

    assertEq(token.balanceOf(user2), amount);
}
```

## Fork Testing

> Generic Foundry reference only — this repo does not fork-test. Its Hardhat
> networks are `hardhat` (local, chainId 31337) and `paseo` (AH Next,
> chainId 420420417, `https://eth-rpc-paseo-next.polkadot.io`).

```solidity
function test_WithPaseoFork() public {
    vm.createSelectFork("paseo");

    // Test against real Paseo state
    MyContract live = MyContract(DEPLOYED_ADDRESS);
    assertTrue(live.isActive());
}
```

## Integration Test Pattern

> **This repo's real trade flow uses native value, not ERC-20 approve/fund, and
> has no admin/owner.** Value is sent with `lockTrade{value:}` (state `LOCKED`),
> then released by per-`msg.sender` confirmations: `confirmTrade` (both parties →
> `COMPLETED`), `confirmCashReceived` (agent → `RELEASED`), `confirmPickup`
> (provider → `COMPLETED`), `requestCancel` (mutual → `CANCELLED`), or
> `refundTrade` (anyone, after the 24h `CONFIRMATION_TIMEOUT` while `LOCKED` →
> `REFUNDED`). There is no `DEFAULTED` state and no stake-slashing. The 5 states
> are `LOCKED`, `RELEASED`, `COMPLETED`, `REFUNDED`, `CANCELLED`. The Solidity
> example below is generic Foundry reference only.

```solidity
function test_FullWorkflow() public {
    // 1. Setup
    vm.prank(user1);
    uint256 orderId = myContract.createOrder(100);

    // 2. Fund order
    vm.prank(user1);
    token.approve(address(myContract), 100);
    vm.prank(user1);
    myContract.fundOrder(orderId, 100);

    // 3. Execute
    vm.prank(admin);
    myContract.executeOrder(orderId);

    // 4. Verify final state
    assertEq(myContract.status(orderId), Status.Completed);
}
```

## Running Tests

> **This repo uses Hardhat, not `forge`.** From `packages/contracts/`:
>
> ```bash
> pnpm test                 # hardhat test (Mocha/Chai/ethers v6)
> pnpm coverage             # solidity-coverage
> # or from repo root:
> pnpm contracts:test
> # filter a single suite:
> pnpm exec hardhat test --grep "registerAgent"
> ```
>
> The `forge` commands below are generic external reference only.

```bash
# All tests
forge test

# Verbose output
forge test -vvv

# Specific file
forge test --match-path test/MyContract.t.sol

# Specific test
forge test --match-test test_CreateOrder

# Gas report
forge test --gas-report

# Coverage
forge coverage
```

## Anti-Patterns

The principles hold regardless of framework; the "How" column gives both the
generic Foundry idiom and the **this-repo Hardhat/ethers** equivalent.

| Pattern | Status | Reason | How (this repo) |
|---------|--------|--------|-----------------|
| Test without assertions | FORBIDDEN | Tests must verify state | use `chai` `expect`/`assert` |
| Skip revert tests | FORBIDDEN | Security critical | `await expect(...).to.be.revertedWithCustomError(...)` |
| Hardcode addresses | FORBIDDEN | Deterministic accounts | use `ethers.getSigners()` |
| Forget the caller | FORBIDDEN | Wrong msg.sender | `market.connect(signer).fn(...)` (not `vm.prank`) |

> The last contract is deployed directly (no proxy), so "test via proxy" does
> not apply here. Custom errors are used throughout, so prefer
> `revertedWithCustomError` over string-match reverts.
