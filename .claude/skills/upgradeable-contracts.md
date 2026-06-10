# OpenZeppelin UUPS Upgradeable Contracts

> **NOT USED IN V1 — REFERENCE ONLY.** LocalDOT's live contracts are
> **non-upgradeable**. Both [`P2PMarket.sol`](../../packages/contracts/contracts/P2PMarket.sol)
> (`VERSION = "7.0.0"`) and [`ZKPassportRegistry.sol`](../../packages/contracts/contracts/ZKPassportRegistry.sol)
> are plain Solidity (`pragma ^0.8.28`) with **no proxy, no UUPS, no `Initializable`/initializer,
> and no constructor `_disableInitializers()`**. They do **not** inherit OpenZeppelin at all
> (`@openzeppelin/contracts` is an unused devDependency): reentrancy is a hand-written
> `noReentrant` modifier (single-bool guard), access control is per-function `msg.sender`
> checks (no `Ownable`, no roles, no admin/owner), and there is no `Pausable`. To ship a fix
> we redeploy and update the address in `apps/web/.env.local` — there is no on-chain upgrade path.
> This document is kept as aspirational/educational reference only; the patterns below describe
> contracts the project does **not** have. Also note the toolchain is **Hardhat +
> `@parity/hardhat-polkadot`** (compiled to PolkaVM via Revive/`resolc`), **not Foundry** — the
> `forge`/`foundry.toml`/`vm.startBroadcast` snippets here are generic OpenZeppelin reference and
> do not match this repo's setup.

## Context
Use when implementing upgradeable contracts with OpenZeppelin UUPS pattern. (Reference only —
see the note above; LocalDOT does not use this pattern.)

## Dependencies

> **This repo uses Hardhat, not Foundry.** There is no `forge`, no `foundry.toml`, and no
> `lib/` remappings here. LocalDOT pulls dependencies via pnpm and resolves
> `@openzeppelin/contracts` from `node_modules` (it is installed but unused in source). The
> `forge install` / `remappings` snippet below is generic OpenZeppelin reference for a
> Foundry project.

Install OpenZeppelin upgradeable contracts (Foundry — not this repo):

```bash
forge install OpenZeppelin/openzeppelin-contracts-upgradeable --no-commit
forge install OpenZeppelin/openzeppelin-contracts --no-commit
```

Add to foundry.toml remappings:

```toml
remappings = [
    "@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/",
    "@openzeppelin/contracts-upgradeable/=lib/openzeppelin-contracts-upgradeable/contracts/"
]
```

## Inheritance Order

CRITICAL: Always inherit in this exact order to avoid linearization issues:

```solidity
// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.20;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract MyContract is
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable,
    PausableUpgradeable,
    UUPSUpgradeable
{
    // Contract implementation
}
```

## Initializer Pattern

```solidity
bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

/// @custom:oz-upgrades-unsafe-allow constructor
constructor() {
    _disableInitializers();
}

function initialize(address admin) public initializer {
    __AccessControl_init();
    __ReentrancyGuard_init();
    __Pausable_init();
    __UUPSUpgradeable_init();

    _grantRole(DEFAULT_ADMIN_ROLE, admin);
    _grantRole(ADMIN_ROLE, admin);
}
```

## Upgrade Authorization

```solidity
function _authorizeUpgrade(address newImplementation)
    internal
    override
    onlyRole(ADMIN_ROLE)
{}
```

## Proxy Deployment with Foundry

> **Reference only.** LocalDOT deploys with Hardhat + `@parity/hardhat-polkadot` —
> [`packages/contracts/scripts/deploy.ts`](../../packages/contracts/scripts/deploy.ts) deploys
> `P2PMarket` directly (no proxy) and writes its address to `apps/web/.env.local` and
> `.github/env`; [`scripts/deploy-zkpassport.ts`](../../packages/contracts/scripts/deploy-zkpassport.ts)
> deploys the registry separately. There is no `vm.startBroadcast`, no `ERC1967Proxy`, and no
> Solidity deploy script (`*.s.sol`) in this repo. The Foundry script below is generic OZ reference.

```solidity
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

// In deployment script:
function run() public {
    vm.startBroadcast();

    // 1. Deploy implementation
    MyContract implementation = new MyContract();

    // 2. Encode initializer call
    bytes memory initData = abi.encodeCall(
        MyContract.initialize,
        (admin)
    );

    // 3. Deploy proxy pointing to implementation
    ERC1967Proxy proxy = new ERC1967Proxy(
        address(implementation),
        initData
    );

    // 4. Cast proxy address to implementation type for interaction
    MyContract myContract = MyContract(address(proxy));

    vm.stopBroadcast();

    // Log addresses
    console.log("Implementation:", address(implementation));
    console.log("Proxy:", address(proxy));
}
```

## Storage Layout Rules

1. **Never remove existing state variables**
2. **Never reorder existing state variables**
3. **Only append new variables at the end**
4. **Use storage gaps for future flexibility**:

```solidity
// Reserve 50 slots for future upgrades
uint256[50] private __gap;
```

## Upgrading Contracts

```solidity
// Deploy new implementation
MyContractV2 newImpl = new MyContractV2();

// Upgrade proxy to new implementation
MyContract(proxyAddress).upgradeToAndCall(
    address(newImpl),
    "" // or encoded call for re-initialization
);
```

## Common Mistakes to Avoid

1. **Calling initializer in constructor**: Never do this, use `initializer` modifier
2. **Forgetting parent initializers**: Must call ALL `__X_init()` functions
3. **Wrong inheritance order**: Causes initialization failures
4. **Missing `_disableInitializers()`**: Security vulnerability
5. **Storage collisions**: Always append, never insert or remove
6. **Initializing in wrong order**: Match inheritance order
