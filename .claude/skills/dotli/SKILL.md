---
name: dotli
description: "dot.li universal resolver - the fourth host. Triggers: dot.li, smoldot, helia, link sharing, client-side resolution"
---

# dot.li - Decentralized Universal Resolver

## When to Activate

- Building dApps that need universal browser access
- Implementing client-side chain resolution
- Understanding the "fourth host" concept
- Deploying content accessible via `.dot.li` domains

---

## What is dot.li?

dot.li is a decentralized universal resolver for Polkadot that enables:

1. **Human-readable URLs** - `myapp.dot.li` instead of IPFS hashes
2. **Client-side resolution** - No proxy, no server-side processing
3. **Easy onboarding** - Share a link -> users get nudged to install Polkadot app
4. **True decentralization** - Light clients validate chain state in-browser

**Status:** Live on Paseo testnet. Demo: https://mytestapp.dot.li/

---

## The Four Hosts

| Host | Platform | Access |
|------|----------|--------|
| Polkadot App | Mobile | Installed app |
| Polkadot Desktop | Desktop | Installed app |
| Polkadot.com | Web | Logged in users |
| **dot.li** | **Any browser** | **Link sharing, no install** |

---

## How Resolution Works

```
User enters: myapp.dot.li
        |
[1] DNS wildcard -> static host
[2] Browser loads Universal Viewer (static JS)
[3] Smoldot light client syncs in browser
[4] Query dotNS contracts via Revive EVM
[5] Helia P2P fetches content from Bulletin
[6] Render in sandboxed iframe
```

**Key:** Everything runs client-side. No servers needed.

---

## Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Light Client | smoldot | Browser-based chain validation |
| Chain Queries | polkadot-api | Access Revive EVM pallet |
| ABI Encoding | viem | Contract call encoding (upstream dot.li resolver) |
| P2P Fetching | Helia + @helia/unixfs | In-browser IPFS client |
| Content Hash | @ensdomains/content-hash | Decode ENS-style CIDs |

> Note: the columns above describe the **upstream dot.li universal-resolver**
> stack. LocalDOT (this repo) does NOT bundle smoldot or Helia, and it uses
> **ethers v6** — not viem — purely to ABI encode/decode calldata
> (`new ethers.Interface(abi)`; see [`apps/web/src/lib/host/_p2p-market-call.ts`](../../../apps/web/src/lib/host/_p2p-market-call.ts)).
> Chain reads/writes go through PAPI v2 over WSS (ReviveApi.call dry-run /
> Revive.call extrinsic), not an in-browser light client.

**For implementation details:** See [Smoldot Patterns](./references/smoldot-patterns.md)

---

## dotNS Contracts

> Note: these are the **upstream dot.li resolver's** dotNS deployments, not
> contracts owned by LocalDOT. They do not appear anywhere in this repo's
> source — LocalDOT only deploys [`P2PMarket.sol`](../../../packages/contracts/contracts/P2PMarket.sol)
> and [`ZKPassportRegistry.sol`](../../../packages/contracts/contracts/ZKPassportRegistry.sol).
> The addresses below were recorded against plain (legacy) Paseo Asset Hub.
> **Confirm them against the Paseo Next Asset Hub (chainId 420420417,
> https://eth-rpc-paseo-next.polkadot.io) before relying on them** — do not
> assume they are deployed on the Next stack.

```typescript
// Upstream dot.li (unverified on Paseo Next — confirm before use)
DOTNS_REGISTRY: "0x4Da0d37aBe96C06ab19963F31ca2DC0412057a6f"
DOTNS_CONTENT_RESOLVER: "0x7756DF72CBc7f062e7403cD59e45fBc78bed1cD7"
```

### Resolution Flow

```typescript
// 1. Compute namehash
const node = namehash("myapp.dot");

// 2. Check domain exists
const exists = await reviveCall(REGISTRY, "recordExists", [node]);

// 3. Get content hash
const contentHash = await reviveCall(CONTENT_RESOLVER, "contenthash", [node]);

// 4. Decode to IPFS CID
const cid = decodeContentHash(contentHash);
```

---

## Bulletin Chain P2P

> Note: the `BULLETIN_PEERS` multiaddrs below point at **plain (non-Next)**
> Paseo Bulletin collators and are unverified against the Next stack. LocalDOT
> targets **Bulletin Next** (`wss://paseo-bulletin-next-rpc.polkadot.io`) and
> does not bundle a Helia/libp2p P2P client — verify the correct Bulletin Next
> peer multiaddrs against the public network config before using these.

```typescript
// Plain-Paseo collators — confirm Bulletin Next equivalents before use
const BULLETIN_PEERS = [
  "/dns4/paseo-bulletin-collator-node-0.internal-host.example/tcp/443/wss/p2p/12D3KooW...",
  "/dns4/paseo-bulletin-collator-node-1.internal-host.example/tcp/443/wss/p2p/12D3KooW...",
];

// Canonical Bulletin Next IPFS gateway (matches apps/web/src/lib/ipfs.ts)
const IPFS_GATEWAY = "https://paseo-bulletin-next-ipfs.polkadot.io/ipfs/";
```

---

## Making Your App dot.li Compatible

### Requirements

1. Deploy to Bulletin Chain (see `deploy-frontend/`)
2. Register .dot domain via dotns CLI
3. Set content hash linking domain to CID
4. Use `base: './'` in Vite config

### Vite Config

```typescript
export default defineConfig({
  base: './',  // REQUIRED for IPFS/dot.li
});
```

### Deployment

```bash
# 1. Build
pnpm build

# 2. Upload to Bulletin
bun run src/cli/index.ts bulletin upload ./dist \
  --parallel --print-contenthash -m "$DOTNS_MNEMONIC"

# 3. Set content hash
bun run src/cli/index.ts content set myapp bafybeig... \
  -m "$DOTNS_MNEMONIC"

# 4. Access: https://myapp.dot.li/
```

---

## Onboarding Funnel

```
Developer shares: myapp.dot.li
        |
User clicks link (any browser)
        |
App loads via client-side resolution
        |
User sees decentralized app
        |
CTA: "Install Polkadot App"
        |
User joins ecosystem
```

**No wallet required** to view content.

---

## Limitations

| Limitation | Status | Notes |
|------------|--------|-------|
| First load ~3s | Expected | Light client sync |
| Manifest routing | Not implemented | Single CID per domain |
| SEO/crawlers | Limited | Client-only |

---

## Networks

| Network | URL | Status |
|---------|-----|--------|
| Paseo | `*.dot.li` | Live |
| Polkadot | TBD | Planned |

---

## Resources

- **Live Demo:** https://mytestapp.dot.li/
- **Reference:** dot.li universal viewer (reference implementation)
- **Light Client Patterns:** [./references/smoldot-patterns.md](./references/smoldot-patterns.md)
- **Related:** `deploy-frontend/`, `host-api.md`

---

## Anti-Patterns

| Pattern | Status | Reason |
|---------|--------|--------|
| Absolute asset paths | FORBIDDEN | Breaks on IPFS |
| Bundling backend | FORBIDDEN | Static-only |
| Server-side auth | FORBIDDEN | No server |
| Assuming fast first load | RISKY | Light client sync ~3s |
| Bundling Smoldot in Triangle Product | FORBIDDEN | Host provides chain access |
