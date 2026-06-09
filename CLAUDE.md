# LocalDOT — Claude Code Development Guide

## Quick Start

1. **Read this document first** — understand the architecture, the current state, and the quality standards.
2. **Trust the code over the docs.** This file is the map; `packages/contracts/contracts/P2PMarket.sol`, `apps/web/src/lib/host/*`, and `apps/web/src/lib/constants.ts` are the territory. When they disagree, the code wins — and fix the doc.
3. **Use skills for implementation detail** — see [Available Skills](#available-skills).
4. **All quality gates must pass** — `pnpm build && pnpm test && pnpm lint && pnpm typecheck`.
5. **Ask for clarification** rather than guessing on architectural decisions. This codebase handles escrowed value and is meant to be audit-ready.

---

## Project Identity

**LocalDOT** is a 100% Web3, peer-to-peer marketplace for exchanging physical **cash** for **digital tokens** (and back), built entirely on Polkadot infrastructure. No backend server, no IPFS pinning service, no centralized dependencies. It is a single-page **Product** that runs sandboxed inside a Polkadot **Host** (the Triangle paradigm) and uses the Host-injected signer — there is no standalone browser-wallet flow.

The marketplace has three roles — **Buyer**, **Provider**, and **Handoff Agent** — and two trade paths: **direct** (two people meet) and **agent-mediated** (a local exchange shop confirms the cash handover).

---

## Glossary

| Term | Definition |
|------|------------|
| **Buyer** | Starts a trade by sending a request; typically brings cash to receive tokens (or vice-versa). |
| **Provider** | Posts an offer (SELL = has tokens, BUY = has cash) and is the offer owner. |
| **Handoff Agent** | A physical exchange location that counts cash, confirms the handover on-chain (releasing escrow), and charges a flat **cash** fee. Registers permanently on-chain; may stake insurance. |
| **Polkadot Triangle** | Polkadot's app paradigm: a **Host** (wallet app, e.g. Polkadot desktop or dot.li) runs **Products** (mini-apps) in a sandbox and lends them its signer. LocalDOT is a Product. |
| **Statement Store** | Decentralized topic-routed messaging (People chain). LocalDOT uses it for trade **request / accept-decline / meetup proposals / live status** — **not** open chat. Cleartext in V1. |
| **Bulletin Chain** | Ephemeral bulk storage (offer metadata, profile photos, handover videos), content-addressed by CID and fetched via an IPFS gateway. |
| **Token** | The digital token being exchanged. **V1 trades a single token** priced at \$1; the deployed escrow moves the chain-native token (PAS on testnet), priced \$1. No specific token brand is assumed — a fork can trade any token. |
| **ZKPassport** | Optional proof-of-personhood: an off-chain zero-knowledge passport proof; only a one-way hash is recorded on-chain (`ZKPassportRegistry`). Replaces the old "DIM1 / PoP" placeholder. |
| **Contextual Alias** | Privacy-preserving per-context identifier (a user appears under a per-context nickname). |
| **Escrow** | The on-chain hold-and-release mechanism inside `P2PMarket.sol`; holds the **native token** via `msg.value`. |

---

## Non-Negotiable Rules

1. **Zero backend / zero server** — all state lives on-chain (Asset Hub Next) or in ephemeral chain storage (Bulletin Next).
2. **No IPFS pinning service** — Bulletin Chain stores blobs; an IPFS *gateway* is used only to read them back by CID.
3. **Polkadot-native only** — Triangle primitives; Host-injected signer.
4. **Privacy-preserving** — contextual aliases, optional ZKPassport, no KYC.
5. **V1 scope: cash ↔ a single token, USD only.**
6. **Host-injected signer only** — no `window.ethereum`, no pjs-signer, no private-key flow in the app. (The legacy `signPayload` path was abandoned on AH Next; see `apps/web/src/lib/host/signer.ts`.)

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Monorepo | pnpm workspaces + Turborepo |
| Framework | React 18 / TypeScript (strict) / Vite |
| State | React Context + TanStack Query + Dexie (local message store) |
| Styling | Tailwind CSS — dark, warm **stone** palette; DM Sans / DM Serif / JetBrains Mono (see [.interface-design/system.md](.interface-design/system.md)) |
| Wallet / signing | **Host-injected** via `@novasamatech/host-api-wrapper` — `accounts.getProductAccount(host, 0)` + `getProductAccountSigner(account, "createTransaction")` |
| Chain API | **PAPI** (`polkadot-api` v2) over **WSS** descriptors (`paseohubnext`, `bulletinnext`, `peoplenext`) — NOT bundled Smoldot specs |
| Contracts | Solidity `^0.8.28` → **Revive** (`resolc`) → **PolkaVM**; built/tested with **Hardhat** + `@parity/hardhat-polkadot` |
| Contract calls | `ReviveApi.call` (reads, dry-run) and `Revive.call` extrinsic (writes) via PAPI. `ethers` v6 is used **only** to ABI encode/decode calldata — never as a wallet or RPC transport. |
| Messaging | Statement Store (`@novasamatech/sdk-statement`), host-submitted publish, direct-RPC subscribe |
| Identity | ZKPassport (`@zkpassport/sdk`) + on-chain `ZKPassportRegistry` |
| Testing | **Hardhat** test runner (Mocha/Chai/ethers) for contracts; **Playwright** for web e2e |

---

## Smart Contracts

Two independent Solidity contracts in `packages/contracts/contracts/`. Neither inherits OpenZeppelin (it's a devDependency but unused); reentrancy is a custom `noReentrant` modifier; access control is per-function `msg.sender` checks; there is **no owner/admin**.

### `P2PMarket.sol` (VERSION `7.1.0`)

The agent registry + offer book + native-token escrow. Money is the chain-native token via `msg.value` / `.call{value:}` — **not** an ERC-20.

**Trade states:** `enum TradeState { LOCKED, RELEASED, COMPLETED, REFUNDED, CANCELLED }` (0–4). **There is no `DEFAULTED` state and no stake-slashing.**

**Key structs:** `Agent { wallet, name, metadataCID, flatFee, active, registeredAt, stakedAmount, holdHours, extraHourFee }`, `Offer { id, owner, offerType (SELL|BUY), amountAvailable, minAmount, pricePerToken, fiatCurrency, flatFee, active, metadataCID, createdAt, agentAddresses[] }`, `Trade { id, offerId, locker, counterparty, agent, amount, state, lockerConfirmed, counterpartyConfirmed, lockerCancelRequested, counterpartyCancelRequested, lockedAt, pickupDeadline, evidenceCID }`.

**Key functions:**
- Agents: `registerAgent` (payable stake), `updateAgent`, `deactivateAgent`/`reactivateAgent`, `stakeInsurance` (payable), `unstakeInsurance`, `removeAgent`. Unstake/remove blocked while the agent is on a LOCKED/RELEASED trade.
- Offers: `createOffer`, `removeOffer`, `pruneExpiredOffer(s)`. Time-expiry via `createdAt + OFFER_TTL`.
- Escrow: `lockTrade(counterparty, offerId, agent)` *(payable, sends value)* → LOCKED; **direct** = both call `confirmTrade` → COMPLETED; **agent** = agent calls `confirmCashReceived` → RELEASED (tokens to buyer) → provider calls `confirmPickup` → COMPLETED; `refundTrade` (anyone, after 24h, only while LOCKED) → REFUNDED; mutual `requestCancel` → CANCELLED; `setEvidenceCID` attaches a handover-video CID.

**Constants:** `MAX_FLAT_FEE = 1000`, `OFFER_TTL = 14 days`, `CONFIRMATION_TIMEOUT = 24 hours`, `MIN_HOLD_HOURS = 2`, `MAX_HOLD_HOURS = 72`, `tokenPricePerCurrency["USD"] = 100` (cents). **No `PROTOCOL_FEE`, no `MIN_TRADE_AMOUNT`, no on-chain `EVIDENCE_TTL`** — no protocol fee is ever taken; the only floor is each offer's `minAmount` plus `msg.value > 0`.

### `ZKPassportRegistry.sol` (VERSION `1.0.0`)

Records one attestation per wallet: `Attestation { uniqueIdHash (keccak256), verifiedAt, countryCode (bytes2) }`, plus a `uniqueIdToWallet` map enforcing one passport ↔ one wallet. `submitAttestation` / `revokeAttestation` / view helpers. **Does not verify the zk proof on-chain** — proof verification is off-chain; the chain only stores the hash and enforces uniqueness. `P2PMarket` does not reference it; trade-gating by verification is frontend-only.

### Toolchain notes

- `hardhat.config.ts`: solc `0.8.28`, `optimizer.runs = 200`, `viaIR: true`, `resolc.compilerSource: 'binary'` + `resolcPath: './bin/resolc'`. Networks: `hardhat` (local, chainId 31337) and `paseo` (AH Next, chainId 420420417, `https://eth-rpc-paseo-next.polkadot.io`), blockscout verify configured.
- Deploy: `pnpm contracts:deploy` runs `scripts/deploy.ts` (deploys **only** `P2PMarket`, writes addresses into `apps/web/.env.local` + `.github/env`). `scripts/deploy-zkpassport.ts` deploys the registry separately. `pnpm contracts:seed` registers 2 demo agents + 10 offers.
- Run `pnpm download:binaries` once to fetch the `resolc` PolkaVM compiler binary.

---

## Off-chain Data Models

```typescript
// On-chain trade, as decoded by apps/web/src/lib/host/escrow.ts (ContractTrade)
// state: 0=LOCKED 1=RELEASED 2=COMPLETED 3=REFUNDED 4=CANCELLED
interface ContractTrade {
  id: bigint; offerId: bigint;
  locker: string;        // signed lockTrade (the token-holder)
  counterparty: string;  // receives tokens on release (the cash-holder)
  agent: string;         // zero address = direct trade
  amount: bigint; state: number;
  lockerConfirmed: boolean; counterpartyConfirmed: boolean;
  lockerCancelRequested: boolean; counterpartyCancelRequested: boolean;
  lockedAt: bigint; pickupDeadline: bigint; evidenceCID: string;
}

// Statement Store trade-request payload (apps/web/src/lib/statement-store.ts)
interface TradeRequestPayload {
  k: 'req'; requestId: string; offerId: number; amount: string;
  currency: string; agent?: string; note?: string; from: string;
}
// Other kinds on the wire: 'res' (accept/decline), 'prop' / 'prop-res'
// (time|location|recognition proposals), 'status' (live heartbeat), 'ack'.
```

> **`locker` vs `counterparty` is direction-dependent.** For a SELL offer the provider is the token-holder (`locker`); for a BUY offer the buyer is. `apps/web/src/lib/trade-roles.ts` maps trade-flow roles (buyer/provider) ↔ economic roles (tokenHolder/cashHolder).

---

## V1 User Flow

1. Buyer browses offers (Exchange quick-match, or Explore) and opens one.
2. Buyer **sends a trade request** (`RequestTradeModal` → Statement Store), choosing an agent or "direct".
3. Provider sees it in **Profile → Received** and responds:
   - **SELL offer:** taps **Lock Funds** → `lockTrade` (payable) locks the tokens, then publishes `accept`.
   - **BUY offer:** taps **Accept** (publishes `accept`); the **buyer** then locks within a 1-hour window.
4. Trade is **LOCKED** on-chain. Both parties open the trade detail (`/trades/:id`).
5. **Direct:** agree time/place in-app → at the meetup the cash-holder shows a QR (auto-confirms) and the token-holder scans + swipes → both confirmed → **COMPLETED**.
6. **Agent-mediated:** buyer brings cash to the agent → agent counts and confirms (`confirmCashReceived`) → tokens **RELEASED** to buyer → provider later collects cash and confirms (`confirmPickup`) → **COMPLETED**. Agent fee is cash, off-chain.
7. **Timeout:** if still LOCKED after 24h, anyone can `refundTrade` → tokens back to the locker (**REFUNDED**). Either side may `requestCancel`; both ⇒ **CANCELLED**.

**Explicitly out of V1 scope (see [Roadmap](#roadmap--known-gaps)):** open chat, on-chain disputes, reputation, multi-asset, agent-stake slashing, gas sponsorship.

---

## Monorepo Structure

```
p2p-market/
├── apps/
│   └── web/                       # React SPA (Vite)
│       └── src/
│           ├── pages/             # Landing2, Exchange, Explore, ExploreOffers,
│           │                      #   ExploreAgents, OfferDetail, AgentDetail,
│           │                      #   Create (→ CreateListing / RegisterAgent),
│           │                      #   Profile, TradeDetail, About
│           ├── components/        # layout, offers, agents, trade, profile,
│           │                      #   location, zkpassport, common
│           ├── hooks/             # useP2PMarket, useEscrow, useTradeRequests,
│           │                      #   useDirectTradeChannel, useZKPassport, useBulletin…
│           ├── context/           # WalletContext, OffersContext, LocationContext
│           ├── lib/
│           │   ├── host/          # Host integration: signer, allowances, permissions,
│           │   │                  #   assethub/bulletin providers, escrow/offers/agents,
│           │   │                  #   zkpassport, storage, _p2p-market-call, _internal
│           │   ├── evidence/      # handover video → blake2b Merkle → QR codec
│           │   ├── photo/         # AES-GCM profile-photo envelope
│           │   ├── zkpassport/    # @zkpassport/sdk client wrapper
│           │   ├── statement-store.ts  message-store.ts  ipfs.ts  trade-state.ts …
│           └── abi/               # P2PMarket.json, ZKPassportRegistry.json
├── packages/
│   ├── contracts/                 # Solidity (P2PMarket, ZKPassportRegistry) + Hardhat
│   ├── bulletin/                  # Bulletin upload helper (CID + TransactionStorage.store)
│   ├── types/                     # Shared TypeScript types
│   └── config/                    # Shared ESLint / Prettier / TS configs
└── .claude/                       # Skills + command docs for this repo
```

> Packages are `config / types / contracts / bulletin`. There is **no** `shared` and **no** `bulletin-sdk` package.

---

## Available Skills

Invoke with `/skill-name`. Command-style skills live in `.claude/commands/`; capability skills in `.claude/skills/`.

| Skill | Purpose |
|-------|---------|
| `/contracts` | Smart-contract implementation (P2PMarket / ZKPassportRegistry), Hardhat config, security. |
| `/frontend` | React, Host-injected wallet, contract interaction, styling. |
| `/papi` | PAPI v2 setup, WSS descriptors, Revive contract calls. |
| `/chat` | Statement Store trade signaling (request / accept-decline / proposals / status). |
| `/scaffold` | Monorepo / Turborepo setup. |
| `/deploy` | Frontend (Bulletin + DotNS) and contract deployment. |
| `/testing` | Hardhat contract tests + Playwright e2e patterns. |
| `deploy-contracts` · `deploy-frontend` · `dotli` | Deployment to Asset Hub / Bulletin / dot.li. |
| `asset-hub-evm` · `host-api` | Network config, Host API references. |
| `code-quality` · `security` · `testing-patterns` · `upgradeable-contracts` · `foundry-testing` | General engineering references (some describe paths this repo did **not** take — see each skill's notes). |

---

## Protocol Constants (as deployed)

| Constant | Value | Source |
|----------|-------|--------|
| `CONFIRMATION_TIMEOUT` | 24 hours | `P2PMarket.sol` |
| `OFFER_TTL` | 14 days | `P2PMarket.sol` / `OFFER_TTL_MS` in `constants.ts` |
| `MAX_FLAT_FEE` | 1000 (whole currency units) | `P2PMarket.sol` |
| `MIN_HOLD_HOURS` / `MAX_HOLD_HOURS` | 2 / 72 | `P2PMarket.sol` |
| Token price | `USD = 100` cents (1 token = \$1.00) | constructor |
| `MIN_GAS_BALANCE_NATIVE` | 0.1 native (`10^(decimals-1)`) | `constants.ts` |

There is **no** protocol fee, no global minimum trade amount, and no on-chain evidence TTL (those exist only in older docs).

---

## Target Networks — Paseo Next v2 stack

Default chain config lives in [apps/web/src/lib/constants.ts](apps/web/src/lib/constants.ts).

| Environment | EVM RPC (eth-rpc) | Substrate WSS |
|-------------|-------------------|---------------|
| Local Dev (Hardhat) | `http://127.0.0.1:8545` (chainId 31337) | (n/a) |
| Asset Hub Next | `https://eth-rpc-paseo-next.polkadot.io` (chainId **420420417**) | `wss://paseo-asset-hub-next-rpc.polkadot.io` |
| Bulletin Next | (n/a) | `wss://paseo-bulletin-next-rpc.polkadot.io` |
| People Next System | (n/a) | `wss://paseo-people-next-system-rpc.polkadot.io` |
| Explorer | `https://blockscout-paseo-next.polkadot.io` | |
| Mainnet | TBD | TBD |

Native token on Paseo: **PAS** (10 decimals). None of these chains are bundled as Smoldot light-client specs — we connect over WSS via PAPI descriptors generated under `apps/web/.papi/descriptors/`.

---

## Quality Standards

### Code Quality Gates

| Gate | Requirement |
|------|-------------|
| Tests | All pass. No skipped. No flaky. |
| Lint | Zero errors. (Note: `apps/web` lint has pre-existing type-aware debt being cleaned separately — don't add to it.) |
| TypeScript | Strict mode. Zero errors. No `any`. |
| Build | Clean build. |
| Coverage | Contracts: high coverage of implemented paths via `solidity-coverage`. Frontend: critical paths. |

### Security Standards (audit target)

**Contracts:**
- Events on every state change; custom errors; reentrancy guard on every value transfer (custom `noReentrant`).
- No `tx.origin`, no `selfdestruct`, no untrusted `delegatecall`.
- **Known deviations from the original mandate** (track these for the audit): the contract does **not** use OpenZeppelin (custom guard instead of `ReentrancyGuard`, no `Ownable`); pragma is the floating `^0.8.28`; there is no upgrade proxy (non-upgradeable by design).

**Frontend:**
- No secrets in code, no `eval()`, CSP-compatible (it's served as a static SPA inside the Host — no server-side auth or DB).
- `pnpm audit` — no high/critical vulnerabilities.
- Note: profile-photo "encryption" uses a global static key (obfuscation, not confidentiality) — an open audit item.

### Code Style

- Functional React; custom hooks for chain/contract logic; Tailwind classes in JSX; error boundaries + loading states.
- No `console.log` in production; no commented-out code; no TODO without a linked issue; no magic numbers.
- Descriptive names, small functions, early returns.

---

## Environment Variables

```bash
# apps/web/.env.local  (all have sensible Paseo Next defaults; see env.ts)
VITE_P2PMARKET_ADDRESS=                  # P2PMarket H160 (written by deploy.ts)
VITE_ZKPASSPORT_REGISTRY_ADDRESS=        # ZKPassportRegistry H160 (deploy-zkpassport.ts)
VITE_CHAIN_ID=420420417                  # EVM chainId (display / wrong-network badge)
VITE_RPC_URL=https://eth-rpc-paseo-next.polkadot.io   # stored; NOT used for contract I/O
VITE_NETWORK=                            # host-routed chain set — Asset Hub / People / Bulletin (default: paseo-next-v2; see lib/host/networks.ts)
VITE_IPFS_GATEWAY=                       # Bulletin IPFS gateway, standalone reads only (default: paseo-bulletin-next-ipfs)
VITE_READONLY_ORIGIN=                    # SS58 origin for read-only ReviveApi.call (default: Alice)
VITE_USE_HOST_API=                       # set "false" to force standalone mode
VITE_ZKPASSPORT_DOMAIN=                  # zk proof domain (default: demo.zkpassport.id)

# packages/contracts/.env
PRIVATE_KEY=                             # deployer key
PASEO_RPC_URL=                           # optional override (default: eth-rpc-paseo-next)
AGENT1_KEY= AGENT2_KEY= PROVIDER1_KEY= PROVIDER2_KEY=   # seed accounts (for `seed`)
```

**Notes:**
- Asset Hub Next runs pallet-revive's **AutoMapper**, so SS58 ↔ H160 mapping happens automatically on first account use. We do **not** call `Revive.map_account`.
- **PGAS gas-sponsorship is NOT wired.** The Host's `SmartContractAllowance` only **auto-signs** `Revive.call` writes — it does not pay gas. The product-derived account must hold native balance (faucet on testnet) for any contract write. `InvalidTransaction::Payment` on an offer = empty account, not a sponsorship bug.
- Contract writes go through PAPI `Revive.call` signed by the Host's `createTransaction` signer — `VITE_RPC_URL` (the eth-rpc proxy) is stored but unused by the contract layer.

---

## Roadmap / Known Gaps

The polished pitch is ahead of what the contracts currently enforce. Keep these straight when writing code or docs:

| Area | Reality today | Future |
|------|---------------|--------|
| **Token / stablecoin** | Escrow moves the chain-native token (PAS), priced \$1. No specific token brand is assumed. | Integrate a real stablecoin or other token (likely ERC-20 / asset). |
| **Agent slashing** | Stake is staked, shown, and frozen during active trades, but **never slashed** — no `DEFAULTED` state, no `claimAgentDefault`. Signaling only. | Add `DEFAULTED` + pickup-timeout slash of `min(amount, stake)` to the provider. |
| **Disputes / reputation** | None on-chain. Safety = escrow + 24h timeout + mutual cancel. | Dispute resolution; ReputationCore. |
| **Multi-asset / currency** | One token, USD only. | Multiple assets / fiat currencies. |
| **Gas sponsorship (PGAS)** | Not wired; auto-sign only; account must be funded. | Populate the `AsPgas` signed extension via PAPI `customSignedExtensions` (confirm the extension's value shape against the runtime metadata first). |
| **Statement Store scope** | Carries `prop`/`prop-res`/`status` (meetup negotiation + live status) in addition to `req`/`res`. | Decide whether the "no negotiation, Uber-like" intent trims these. |
| **Evidence persistence** | Live path attaches a Bulletin video CID to the trade. The deeper Merkle/swipe-commitment evidence model exists in `lib/evidence/*` but is **not** persisted or anchored on-chain. | Wire local persistence + on-chain anchoring; set the 30-day evidence TTL. |
| **Frontend state label** | `lib/trade-state.ts` labels state `5` as "Insured", but the on-chain enum has no state 5. | Fix to match the contract. |

---

## Instructions for Claude Code

### Before writing code
1. Read the relevant source (contract, host layer, hook) — the docs may lag.
2. Check existing patterns; reuse `lib/host/*` wrappers rather than calling PAPI raw.
3. For Statement Store / dot.li patterns, check the in-repo implementation in [apps/web/src/lib/statement-store.ts](apps/web/src/lib/statement-store.ts).

### When implementing
1. Follow the monorepo structure; use barrel exports (`index.ts`).
2. All TypeScript — strict, no `any`.
3. Contracts: Hardhat (`pnpm --filter @localdot/contracts test`), not Foundry.
4. Contract writes: PAPI `Revive.call` + Host signer; reads: `ReviveApi.call`. `ethers` only for ABI codec.
5. Run the quality gates after changes.

### PAPI v2 gotchas (learned the hard way)
- `Binary` is a **function namespace**, not a class: use `Binary.fromHex(hex)` / `Binary.toHex(u8)`. Pass raw `Uint8Array` for `Vec<u8>` fields; H160/fixed fields are `SizedHex<N>` branded hex strings.
- `getWsProvider` imports from `polkadot-api/ws`; signer types from `polkadot-api/signer`.
- The signer must use the Host `createTransaction` slot (not `signPayload`), so AH Next's custom signed extensions (`EthSetOrigin`, etc.) are included — otherwise `BadProof`.

### Commit messages
```
feat: add agent pickup timeout
fix: handle wrong-network badge
chore: regenerate papi descriptors
test: cover refund timeout path
```
Default branch is **`main`**. This community repo ships no CI workflows — run the quality gates (`pnpm build && pnpm test && pnpm lint && pnpm typecheck`) locally before opening a PR.

---

## Key Documentation

| Topic | URL |
|-------|-----|
| PAPI | https://papi.how |
| Hardhat + Polkadot | https://docs.polkadot.com/develop/smart-contracts/dev-environments/hardhat/ |
| PolkaVM | https://docs.polkadot.com/polkadot-protocol/smart-contract-basics/polkavm-design/ |
| Revive compiler | https://github.com/paritytech/revive |
| ZKPassport SDK | https://docs.zkpassport.id |
