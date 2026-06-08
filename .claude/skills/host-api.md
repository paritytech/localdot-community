# Host API & Polkadot Triangle

## Context

Use when building Products for the Polkadot Triangle ecosystem (Desktop, Web, Mobile hosts).

**Status: Early Stage - APIs are evolving rapidly. Expect breaking changes.**

**This repo uses the `host-api-wrapper` accounts API, not `product-sdk`.** LocalDOT
signs via `accounts.getProductAccount(host, 0)` +
`accounts.getProductAccountSigner(account, "createTransaction")` — see
[`apps/web/src/lib/host/signer.ts`](../../apps/web/src/lib/host/signer.ts) for the
canonical, working flow and why the `createTransaction` slot is mandatory on Asset
Hub Next. Treat the `product-sdk` provider snippets further down as generic reference
only; the wrapper API below is what ships.

## Reference Implementation

**For LocalDOT's working host integration, read [`apps/web/src/lib/host/`](../../apps/web/src/lib/host/):**
- [`signer.ts`](../../apps/web/src/lib/host/signer.ts) — product-account signer (`createTransaction` slot)
- [`allowances.ts`](../../apps/web/src/lib/host/allowances.ts) — RFC-0010 allowances + RFC-0002 JIT permission bootstrap

The broader `triangle-web-host-demo` repository also covers SpektrManager container
orchestration, DotNS resolution, and Service Worker IPFS caching. This skill provides a
conceptual overview — for implementation details in this project, follow the files above.

---

## What is the Triangle?

The Polkadot Triangle consists of three hosts that run sandboxed Products:

| Host | Platform | Role |
|------|----------|------|
| Polkadot App | Mobile (iOS/Android) | Identity holder, transaction signing |
| Polkadot Desktop | Desktop app | Development, full features |
| Polkadot.com | Web browser | Web access |

**Key Insight:** Products are sandboxed - no direct HTTP/HTTPS access. All external interactions go through Host API.

## Core Packages

```bash
# Versions actually used in this repo (apps/web/package.json)
pnpm add @novasamatech/host-api@0.8.3
pnpm add @novasamatech/host-api-wrapper@0.8.3
pnpm add @novasamatech/sdk-statement@0.6.0
```

| Package | Purpose |
|---------|---------|
| `@novasamatech/host-api` | Protocol, types, error definitions, `enumValue` helper |
| `@novasamatech/host-api-wrapper` | Embedded-side wrapper: `accounts`, `hostApi`, `requestPermission` |
| `@novasamatech/sdk-statement` | Statement Store subscribe client (over People Next JSON-RPC) |

> **Not used in this repo:** `@novasamatech/product-sdk` (and its
> `sandboxProvider` / `metaProvider` / `createAccountsProvider`). Those are kept
> as generic reference below; LocalDOT uses the `host-api-wrapper` `accounts` API.

### Key SDK Exports (as used here)

```typescript
import { accounts, hostApi, requestPermission } from "@novasamatech/host-api-wrapper";
import { enumValue } from "@novasamatech/host-api";
```

## Architecture Overview

```
+-------------------------------------------+
|  Host (Desktop/Web/Mobile)                |
|  +---------------------------------------+|
|  |  Product (Your dApp in iframe)        ||
|  |  - No direct network access           ||
|  |  - Uses Host API for everything       ||
|  |  - @novasamatech/host-api-wrapper     ||
|  +---------------------------------------+|
|  +---------------------------------------+|
|  |  Host Container                       ||
|  |  - @novasamatech/host-container       ||
|  |  - Accounts, Signing, Storage         ||
|  |  - JSON-RPC proxy to chains           ||
|  +---------------------------------------+|
|  +---------------------------------------+|
|  |  Light Client / RPC                   ||
|  +---------------------------------------+|
+-------------------------------------------+
```

## Implementation Patterns

### Environment Detection

> **This repo:** detection is driven by the `VITE_USE_HOST_API` env flag plus a
> `window` check, not by `sandboxProvider`. The `product-sdk` snippet below is
> generic reference only.

```typescript
// Generic reference (product-sdk — NOT used in this repo)
import { sandboxProvider, metaProvider } from "@novasamatech/product-sdk";

let connectionStatus: "disconnected" | "connecting" | "connected" = "disconnected";

if (typeof window !== "undefined" && sandboxProvider.isCorrectEnvironment()) {
  metaProvider.subscribeConnectionStatus((status) => {
    connectionStatus = status;
  });
}

export function isHosted(): boolean {
  if (typeof window === "undefined") return false;
  return sandboxProvider.isCorrectEnvironment();
}
```

### Account Management & Signing (as used here)

LocalDOT resolves a product-derived account from the host and builds a
`PolkadotSigner` from the **`createTransaction`** slot. See
[`apps/web/src/lib/host/signer.ts`](../../apps/web/src/lib/host/signer.ts).

```typescript
import { accounts } from "@novasamatech/host-api-wrapper";

// Product identifier = window.location.host; derivation index 0.
const result = await accounts.getProductAccount(window.location.host, 0);

const productAccount = result.match(
  (v) => v,            // { publicKey: Uint8Array; name?: string }
  (e) => { throw new Error(`Failed to fetch product account: ${JSON.stringify(e)}`); },
);

// "createTransaction" slot forwards every signed-extension's real extra +
// additionalSigned bytes to host.createTransaction, which rebuilds and signs.
const signer = accounts.getProductAccountSigner(productAccount, "createTransaction");
```

**Why the `createTransaction` slot (not the legacy `signPayload`):** Asset Hub Next
declares custom signed extensions (`AuthorizeCall`, `AsPgas`, `AsRingAlias`,
`EthSetOrigin`, …). The legacy `signPayload` builder only knows a hardcoded minimal
extension set and silently drops `EthSetOrigin` (the EVM/H160 origin needed for
`Revive.call`), so the payload diverges from what the chain recomputes → `BadProof`.
The `createTransaction` slot transmits the complete extension bytes and avoids this.

### Allowance & Permission Bootstrap

Before any host-mediated write, LocalDOT runs `ensureBootstrap` once per session
(see [`apps/web/src/lib/host/allowances.ts`](../../apps/web/src/lib/host/allowances.ts)):

1. `hostApi.requestResourceAllocation` — RFC-0010 allowances:
   `BulletinAllowance` + `StatementStoreAllowance` + `SmartContractAllowance(0)`.
   Only the first two are fatal on `Rejected`; the third is orthogonal.
2. `requestPermission({ tag: "StatementSubmit" })` — RFC-0002 JIT permission the
   host enforces before forwarding a statement submit.

### Known Issues

| Issue | Cause | Workaround |
|-------|-------|------------|
| `getProductAccount` hangs | User not signed in | Show "Sign in to Triangle" message |
| `BadProof` on `Revive.call` | Legacy `signPayload` slot drops `EthSetOrigin` | Use the `createTransaction` signer slot |
| People Next WebSocket fails | Testnet infrastructure | Wait/retry, report to Triangle team |

## Key Concepts

### Sandboxed Products

Products run in iframes with no direct network access. The host provides:
- Product-derived accounts via the `host-api-wrapper` `accounts` API
  (`getProductAccount` / `getProductAccountSigner`) — **not** a
  `window.injectedWeb3.spektr` injection
- Signing delegation to the Polkadot App / Desktop host
- JSON-RPC proxy for chain access
- Scoped localStorage per product

### Derived Accounts (Privacy Model)

Each Product gets its own derived account from the user's root identity:
- Accounts are **unlinkable by default** - no cross-product tracking
- User can optionally link accounts for public reputation

### DotNS Resolution

Products are loaded from IPFS via `.dot` domain resolution:
1. Query dotNS resolver for contenthash
2. Fetch from IPFS gateway
3. Cache in Service Worker
4. Serve in sandboxed iframe

## What's Available Now

| Feature | Status | Notes |
|---------|--------|-------|
| Product deployment | Working | Via Bulletin + dotNS |
| Account/signing | Working | Host product account, `createTransaction` slot |
| Auto-signing | Working | `SmartContractAllowance` skips the per-call modal (see below) |
| Local storage | Working | Key-value, scoped per product |
| Localhost dev | Working | Search `localhost:3000` in Desktop |
| Chain queries | Working | Via Host API proxy |

## What's Not Ready Yet

| Feature | Status | Notes |
|---------|--------|-------|
| Gas sponsorship (PGAS) | Not wired | `AsPgas` extension unpopulated; product account must hold native balance |
| Notifications | Planned | Push notifications to products |

### Auto-Signing vs Gas Sponsorship

`SmartContractAllowance` (requested for derivation index 0) grants host-side
**auto-signing** of `Revive.call` writes — they are signed without a per-call modal.
It does **NOT** sponsor gas. PGAS gas-sponsorship (the `AsPgas` signed extension) is
not wired anywhere in product, SDK, or host, so contract writes still pay gas from
the product-derived account. **That account must hold native balance** (PAS on the
testnet — fund it via faucet). Declining or `NotAvailable` on the allowance just
falls back to a per-call signing prompt and must not break statement send/receive.

## Anti-Patterns

| Pattern | Status | Reason |
|---------|--------|--------|
| Direct HTTP/fetch calls | FORBIDDEN | Sandboxed, will fail |
| Bundling light client | FORBIDDEN | Host provides chain access; this repo uses PAPI over WSS via descriptors, not Smoldot specs |
| Using `@novasamatech/product-sdk` here | AVOID | This repo standardized on `host-api-wrapper` |
| Legacy `signPayload` signer slot | AVOID | Drops `EthSetOrigin` on AH Next → `BadProof` |

## Development Workflow

1. **Build your Product** - Standard web app with `@novasamatech/host-api-wrapper`
2. **Deploy to Bulletin** - See `deploy-frontend/` skill for dotNS setup
3. **Test in Desktop** - Search for your `.dot` domain or `localhost:3000`

## Resources

- **triangle-web-host-demo** - Complete reference implementation
- [Triangle SDK Sandbox](https://spektr-sdk-sandbox-dev.novaspektr.io/) - Live demo

## Versioning

SDK and Host versions must match. This repo pins:
```
@novasamatech/host-api          0.8.3
@novasamatech/host-api-wrapper  0.8.3
@novasamatech/sdk-statement     0.6.0
```
Compatible hosts: `0.8.3 <-> Polkadot Desktop 0.7.9+ / Polkadot App iOS v2`.
