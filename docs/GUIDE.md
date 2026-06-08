# LocalDOT — full guide

The complete tour of LocalDOT: what it is in plain language, how to configure and deploy it, and how it
works under the hood. For a quick start, see the [README](../README.md); for the development guide and
quality gates, see [CLAUDE.md](../CLAUDE.md).

## Contents

- [Configuration](#configuration)
- [Useful commands](#useful-commands)
- [Deploying](#deploying)
- [Understanding LocalDOT](#understanding-localdot) — for everyone
  - [The problem it solves](#the-problem-it-solves)
  - [The three kinds of people](#the-three-kinds-of-people-roles)
  - [Key words, in plain language](#key-words-in-plain-language)
  - [The app, tab by tab](#the-app-tab-by-tab)
  - [The two ways to trade](#the-two-ways-to-trade)
  - [What keeps a trade safe](#what-keeps-a-trade-safe)
  - [Proving you're a real person (optional)](#proving-youre-a-real-person-optional)
- [Under the hood](#under-the-hood) — architecture & tech
- [Project structure](#project-structure)
- [What's built vs. what's coming](#whats-built-vs-whats-coming)

---

## Configuration

The network endpoints default to the **Paseo Next v2** test network, but the app needs a **deployed contract address** to load any data (without it you'll see "contract not deployed"). Create `apps/web/.env.local`. To browse the existing reference deployment, copy the `VITE_P2PMARKET_ADDRESS` / `VITE_ZKPASSPORT_REGISTRY_ADDRESS` from [.github/env](../.github/env); or deploy your own (see [Deploying](#deploying)) and the script fills them in:

```bash
# The two smart contracts (filled in automatically by the deploy script).
# Without these the app runs in "not deployed" mode (read-only / empty).
VITE_P2PMARKET_ADDRESS=0x...
VITE_ZKPASSPORT_REGISTRY_ADDRESS=0x...

# Network — these all default to Paseo Next v2 public endpoints if omitted:
VITE_CHAIN_ID=420420417
VITE_RPC_URL=https://eth-rpc-paseo-next.polkadot.io
VITE_ASSET_HUB_ENDPOINT=wss://paseo-asset-hub-next-rpc.polkadot.io
VITE_BULLETIN_ENDPOINT=wss://paseo-bulletin-next-rpc.polkadot.io
VITE_PEOPLE_CHAIN_ENDPOINT=wss://paseo-people-next-system-rpc.polkadot.io
VITE_IPFS_GATEWAY=https://paseo-bulletin-next-ipfs.polkadot.io/ipfs/

# Optional knobs:
VITE_USE_HOST_API=false          # force standalone mode (skip the Polkadot Host)
VITE_ZKPASSPORT_DOMAIN=demo.zkpassport.id
```

The single source of truth for the default network lives in [apps/web/src/lib/constants.ts](../apps/web/src/lib/constants.ts), and the full list of environment variables (with validation) is in [apps/web/src/env.ts](../apps/web/src/env.ts).

> **About money & gas:** on the test network the on-chain token is **PAS** (Paseo's native test token), and you need a small amount of it (~0.1 PAS) in your account to pay transaction fees before you can create offers or lock funds. Gas is **not** sponsored for you yet — see [What's built vs. what's coming](#whats-built-vs-whats-coming).

## Useful commands

Run from the repository root:

| Command | What it does |
|---------|--------------|
| `pnpm dev` | Start everything in development mode. |
| `pnpm web:dev` | Start only the web app. |
| `pnpm build` | Build all packages for production. |
| `pnpm test` | Run the contract test suite (Hardhat). Frontend e2e runs via `pnpm --filter @localdot/web test:e2e` (Playwright). |
| `pnpm lint` / `pnpm lint:fix` | Check / auto-fix code style. |
| `pnpm typecheck` | Type-check all TypeScript. |
| `pnpm format` | Format the whole codebase with Prettier. |
| `pnpm run deploy` | **One-command interactive deploy** — compile + deploy the contract, then publish the frontend to `.dot` (see [Deploying](#deploying)). |
| `pnpm contracts:compile` | Compile the smart contracts. |
| `pnpm contracts:test` | Run the smart-contract test suite. |
| `pnpm contracts:deploy` | Deploy only the contract via Hardhat (lower-level; see below). |
| `pnpm contracts:seed` | Populate a fresh deployment with demo agents and offers. |

## Deploying

`pnpm run deploy` is a single interactive command that takes you from nothing to
a live `.dot` product — one Substrate mnemonic, used end-to-end:

```bash
pnpm run deploy
```

> Use `pnpm run deploy`, **not** `pnpm deploy` — `deploy` is a reserved pnpm
> built-in command, so the bare form won't run this script.

It walks you through:

1. **Wallet** — generate a fresh 12-word mnemonic, or paste an existing 12/24-word one.
2. **Funding** — it prints the address and a faucet link, then waits until the on-chain balance clears a floor (≥20 PAS — enough for the contract deploy and the `.dot` registration) before spending.
3. **Contract** — compiles `P2PMarket` (fetches the `resolc` PolkaVM compiler on first run) and deploys it to Asset Hub Next via PAPI / pallet-revive.
4. **Build** — builds the web app with Vite to `apps/web/dist`.
5. **Publish** — publishes the build to a `.dot` domain via `bulletin-deploy`, so it's served decentrally from the Bulletin Chain with no web host.

The same mnemonic signs the contract instantiate **and** is handed to `bulletin-deploy` (via the `MNEMONIC` env var) for the publish. It only ever lives in memory — **never written to disk**. The deployed contract address + chain are written to `apps/web/.env.local` (gitignored, so the static build inlines them) and to `.github/env` when present.

### Prerequisites

- **Node 22+ and pnpm** (already required for the repo).
- **IPFS (kubo)** is optional — if it isn't on your `PATH`, the deploy falls back to bulletin-deploy's pure-JS merkleizer (`--js-merkle`). Installing kubo just speeds up large publishes.
- Everything else is automatic: a recent `bulletin-deploy` is fetched via `npx` if a new-enough one isn't installed, and the `resolc` contract compiler (~170 MB) is downloaded on first run.

### What it writes

| File | Keys |
|------|------|
| `apps/web/.env.local` | `VITE_P2PMARKET_ADDRESS`, `VITE_CHAIN_ID`, `VITE_RPC_URL` |
| `.github/env` (if present) | `VITE_P2PMARKET_ADDRESS` |

### Notes

- **Domain** defaults to `localdot.dot` (the production label). Change it at the prompt to publish your own instance. (The deploy signer has PoP set, so DotNS accepts clean labels; without PoP, dev signers must use a ≥9-alphanumeric + 2-trailing-digits label.)
- Asset Hub Next's **AutoMapper** creates the SS58 ↔ H160 mapping on first use, so the deploy does **not** call `Revive.map_account`.
- `ZKPassportRegistry` is **not** part of this flow — deploy it separately with `pnpm --filter @localdot/contracts exec hardhat run scripts/deploy-zkpassport.ts --network paseo`.

### Lower-level / manual deploys

The individual steps still work standalone:

| Command | What it does |
|---------|--------------|
| `pnpm contracts:deploy` | Deploy `P2PMarket` via Hardhat/ethers (uses `PRIVATE_KEY` in `packages/contracts/.env`). |
| `pnpm contracts:seed` | Populate a deployment with demo agents + offers. |
| `pnpm --filter @localdot/web build` | Build the static frontend to `apps/web/dist`. |
| `bulletin-deploy --env paseo-next-v2 ./apps/web/dist <domain>.dot` | Publish a built frontend (needs `MNEMONIC`). |

See the deployment skills in [.claude/skills/](../.claude/skills/) for more detail.

---

# Understanding LocalDOT

> This is the part for everyone. No technical background needed.

## The problem it solves

Billions of people still run their daily lives on **physical cash**. They have a smartphone, but they don't have easy, cheap, trustworthy access to "digital dollars" — and they often don't want a bank account or to hand over their ID just to move small amounts of money.

The usual way to turn cash into digital money (or back) is to trust a company: a bank, a money-transfer app, a local e-wallet. That company holds your money, knows every transaction you make, and can freeze your account.

**LocalDOT removes the company.** It's a marketplace where a person with cash and a person with digital tokens can find each other and make the swap directly — with the blockchain acting as the neutral referee that holds the money safely until both sides confirm the deal happened. No bank, no sign-up, no ID required to trade.

The hardest part of "meet a stranger and exchange a stack of cash" is **trust**. LocalDOT solves that two ways:

1. An automated **escrow** — the smart contract locks the seller's tokens up front, so the buyer knows the tokens are really there before handing over any cash.
2. An optional **Handoff Agent** — a real local shop that acts as a vetted middleman, the same way Uber puts a vetted driver between two strangers.

## The three kinds of people (roles)

Everyone on LocalDOT is one (or more) of three roles:

### 🧑 Buyer
*"I have cash, I want digital dollars"* (or the reverse). The buyer browses offers, picks one, and completes the swap. They're the one who **starts** a trade by sending a request.

### 🏪 Provider
The market-maker. A provider **posts an offer**: either *"I'm selling tokens for cash"* or *"I'm buying tokens with cash."* They set the amount range, their fee, and how the trade can happen (in person, or through which agents). The provider's tokens are what gets locked in escrow.

### 🤝 Handoff Agent
A **physical location** — picture a neighborhood money-changer, a corner shop, or a kiosk — that acts as a trusted, in-person exchange point. The agent:

- Registers on the blockchain as a permanent business listing (name, location, working hours, fee).
- **Counts and receives the cash** from the buyer, then taps "cash received" in the app — which is what releases the digital tokens.
- Charges a **flat fee, in cash, at the counter**. The fee is shown on-chain so people can compare agents, but the money itself never touches the blockchain.
- Can **stake some of their own money** as a public "insurance deposit" to signal they're trustworthy.

An agent turns *"meet a stranger with a bag of cash"* into *"go to a known shop that handles the exchange."*

## Key words, in plain language

| Word | What it means here |
|------|--------------------|
| **Digital dollar / Hollar** | A token meant to be worth about \$1. It's the "digital cash" you swap for. *(Note: on the current test network the app actually moves Polkadot's native test token, PAS, priced at \$1 — a real stablecoin like Hollar is on the roadmap.)* |
| **Escrow** | The automated middleman. The smart contract locks the seller's tokens and only releases them when the right people confirm the swap — or refunds them if the deal stalls. |
| **Asset Hub** | The Polkadot chain that runs LocalDOT's smart contracts — the ledger where offers, agents, and the locked money live. |
| **Bulletin Chain** | A short-term storage chain for bigger data: listing details, locations, profile photos, handover videos. Data here is meant to expire automatically so nothing piles up forever. |
| **Statement Store** | Polkadot's lightweight, decentralized messaging system. LocalDOT uses it to deliver a **trade request** to a provider's "inbox," carry the **accept/decline**, and (for in-person trades) let both sides agree a **time and place** and share a live *"on my way / I'm here"* status. It is **not** an open chat. |
| **Polkadot Host / Triangle / Product** | LocalDOT is a **Product** — a mini-app that runs *inside* a **Host** (the Polkadot wallet app, e.g. the Polkadot desktop app or dot.li). The Host lends the app its wallet, so you never paste a private key or "connect" an extension. |
| **Contextual alias** | A privacy feature: you show up under a per-context nickname rather than broadcasting your real wallet address everywhere. |
| **ZKPassport** | An optional way to prove *"I'm a unique, real, adult human"* using a zero-knowledge proof of your passport — **without revealing who you are**. Earns you a "Verified" badge. |
| **Native token / PAS** | The blockchain's built-in currency. On the test network it's PAS; it's what's actually locked in escrow and what pays transaction fees. |

## The app, tab by tab

The top of the screen has a few main destinations. Here's what each one is for.

### 🔁 Exchange — *"just match me with a good deal"*
The guided, fastest path. You pick **Deposit cash** (you have cash, you want tokens) or **Withdraw cash** (you have tokens, you want cash), type an amount, and choose **via an exchange agent** or **direct trade**. The app instantly searches every live offer and shows you the best matches — ranked by price, distance from you, and whether the provider/agent is open right now. Tap a match to start the trade.

### 🧭 Explore — *"let me browse everything myself"*
A hub with two browsers:
- **Offers** — every live offer, shown as cards or pins on a map. Filter by buy/sell, sort by amount, fee, or distance.
- **Agents** — every registered exchange shop, as cards or map pins. See each one's fee, insurance deposit, hours, how long they'll hold your cash, and whether they're identity-verified.

### ➕ Create — *"I want to offer a service"*
Two things you can set up here:
- **Create Offer** (for providers) — a short wizard: are you selling or buying, the min/max amounts, your fee, your weekly availability, and *how* people can trade with you (through specific agents, and/or directly at a map location you pin). Offers automatically expire after **14 days**.
- **Register Agent** (for shops) — register your location as a handoff agent: name, address, cash fee per trade, how many hours you'll hold cash (2–72h), an optional insurance deposit, your hours, and (optionally) verify your identity.

### 👤 Profile — *"my activity"*
Your avatar, name, and verified badge, plus an **Identity Verification** section. Below that, tabs that appear as you need them:
- **Received** — trade requests other people sent you. Accept (lock your funds) or decline.
- **Sent** — requests you've sent, with their status (pending / accepted / declined) and a "Lock Funds" button when it's your turn.
- **Active Trades** — every trade you're currently part of (as buyer, provider, or agent), with its live status. This is where you jump into an in-progress trade.
- **My Offers** — the offers you've published.
- **My Agency** — appears only if you've registered as an agent; manage your insurance deposit, pause/reactivate, or close your agency.

### ℹ️ About
A built-in help page explaining escrow, the privacy model, and in-person safety tips.

*(There's also a **location pill** in the header — set your location once and the app uses it to find nearby offers and agents — and a **network badge** that warns you if your wallet is on the wrong chain.)*

## The two ways to trade

Every trade starts the same way: a **buyer finds an offer and sends a request**, and the **provider accepts**. Acceptance and the request travel over the Statement Store (the decentralized inbox); the moment money is involved, it's locked on the blockchain. From there, the trade follows one of two paths.

### Path 1 — Direct (no middleman)

Two people, meeting in person. Best for smaller amounts or people who already trust each other.

1. **Request & accept.** Buyer requests, provider accepts.
2. **Lock.** Whoever is bringing the **tokens** locks them in the escrow contract. The money is now provably set aside.
3. **Agree a meetup.** Inside the trade screen, both sides propose and accept a **time and place**, and can broadcast a live *"on my way / I'm here / running late"* status.
4. **Meet.** The person with **cash** shows a QR code (which quietly confirms their side); the person with **tokens** scans it, counts the cash, and swipes to release.
5. **Done.** When both have confirmed, the escrow releases the tokens. ✅

If the meetup never happens, after **24 hours** the person who locked the tokens can reclaim them (see [What keeps a trade safe](#what-keeps-a-trade-safe)).

### Path 2 — Agent-mediated (through a shop)

Three people: a buyer, a provider, and a handoff agent. Best for larger amounts or trading with someone you don't know — the shop absorbs the in-person risk.

Walking through the most common case (a provider *selling* tokens to a buyer):

1. **Request & accept.** Buyer requests the offer, choosing one of the agents the provider works with. Provider accepts and **locks the tokens** in escrow.
2. **Buyer goes to the shop.** The buyer brings physical cash to the agent's location and shows their trade QR code. The amount to hand over is the token value **plus** the provider's fee **plus** the agent's fee — all in cash.
3. **Agent confirms the cash.** The agent counts the money and swipes to confirm. ✅ **This instantly releases the digital tokens to the buyer** — the buyer's part is now finished.
4. **Provider collects.** Later, the provider goes to the same shop to pick up their cash. They show *their* QR code, the agent hands over the cash, and the provider swipes **"I picked up the cash"** to finish the trade.
5. **Fees.** The agent keeps their flat fee in cash; the provider gets the token value + their fee in cash. None of the fees move on the blockchain.

The agent can hold the cash for a set window (their chosen 2–72 hours); past that, an extra hourly fee (cash) may apply.

## What keeps a trade safe

LocalDOT can't stop someone from being dishonest in real life, but it stacks the deck heavily toward fair trades:

- **Escrow first.** The tokens are locked *before* any cash changes hands. A buyer can always verify the tokens are really there.
- **24-hour auto-refund.** If a trade is locked but never completed, after 24 hours the person who locked the tokens can reclaim them. Nobody's money gets stuck.
- **Mutual cancel.** If both sides agree to call it off while the trade is still locked, the tokens go straight back.
- **Agent insurance (today: a public signal).** Agents can stake their own money as a visible insurance deposit, and that deposit is **frozen while they have active trades** — so they can't register, take cash, and vanish with their stake free. *(Automatically paying that deposit out to a wronged provider — "slashing" — is designed but not yet enforced on-chain; see the roadmap.)*
- **Optional video evidence.** During a handover the buyer can record a short video that's stored on the Bulletin Chain and attached to the trade, as a record in case of a later dispute.
- **Meet smart.** The built-in About page recommends meeting in public, starting small, and confirming the escrow is funded before handing over cash.

## Proving you're a real person (optional)

To raise trust without asking anyone for ID documents, LocalDOT supports **ZKPassport**. You scan your passport with the ZKPassport mobile app, which creates a **zero-knowledge proof** — a mathematical proof that you hold a genuine passport and are over 18, *without revealing your name, number, or any passport data*. The app records only a one-way fingerprint on the blockchain, which:

- gives your profile a green **Verified** badge (and optionally a country flag), and
- guarantees **one real person can't verify many accounts** (the same passport can't be reused on a second wallet).

It's entirely optional — you can trade without it — but it's especially useful for agents, who are vouching for trades.

---

# Under the hood

*For developers and the technically curious.*

LocalDOT is a **single-page React app with no backend of its own**. Everything it needs is read from and written to public Polkadot chains:

| Layer | Choice | Notes |
|-------|--------|-------|
| Monorepo | pnpm workspaces + Turborepo | |
| Frontend | React 18 + TypeScript (strict) + Vite + Tailwind | Dark, warm "stone" palette; DM Sans / DM Serif / JetBrains Mono. |
| Smart contracts | Solidity `^0.8.28` → compiled with **Revive** (`resolc`) → **PolkaVM** | Run with **Hardhat** + `@parity/hardhat-polkadot`. |
| Contract calls | **PAPI** (`polkadot-api` v2) over the `Revive` pallet | `ethers` v6 is used **only** to ABI-encode/decode calldata, *not* as a wallet or RPC transport. |
| Wallet / signing | **Host-injected** (Polkadot Triangle) | The Host provides a signer via its `createTransaction` slot; there is no browser-extension or private-key flow. |
| Messaging | **Statement Store** (`@novasamatech/sdk-statement`) on the People chain | Trade request / accept-decline / meetup proposals / live status. Cleartext in V1. |
| Bulk storage | **Bulletin Chain** + IPFS gateway | Listing metadata, profile photos (encrypted), handover videos — addressed by content hash (CID). |
| Identity | **ZKPassport** (`@zkpassport/sdk`) + an on-chain registry | Off-chain zero-knowledge proof; only a hash is stored on-chain. |

**The two smart contracts** ([packages/contracts/contracts/](../packages/contracts/contracts/)):

- **`P2PMarket.sol`** — the heart of the system: the agent registry, the offer book, and the escrow. Escrow holds the chain's **native token** (not an ERC-20). Trades move through five states: `LOCKED → RELEASED → COMPLETED`, with `REFUNDED` (timeout) and `CANCELLED` (mutual) as exits. Reentrancy is guarded with a custom modifier; access control is per-function sender checks (there is no admin/owner).
- **`ZKPassportRegistry.sol`** — records one proof-of-personhood attestation per wallet (just a hash + optional country code), and enforces one-passport-per-wallet. It does **not** verify the zero-knowledge proof on-chain — that happens off-chain in the client.

**Why no "connect wallet" button?** The app is sandboxed inside the Polkadot Host, which holds the keys and signs on the app's behalf. This is deliberate (it's the Polkadot "Triangle" Product model) — it's also why signing only works inside a Host. The detailed reasoning (and why the legacy `signPayload`/pjs-signer path was abandoned on Asset Hub Next) is documented in [apps/web/src/lib/host/signer.ts](../apps/web/src/lib/host/signer.ts).

The networks targeted are the **Paseo Next v2** stack: **Asset Hub Next** (contracts), **Bulletin Next** (storage), and **People Next** (messaging). They're reached over WSS via generated PAPI descriptors (`paseohubnext`, `bulletinnext`, `peoplenext`) — not bundled light-client specs.

For the full development guide, architecture rules, and quality gates, see [CLAUDE.md](../CLAUDE.md).

## Project structure

```
localdot/
├── apps/
│   └── web/                     # The React single-page app
│       └── src/
│           ├── pages/           # Exchange, Explore, Create, Profile, About, trade detail…
│           ├── components/      # layout, offers, agents, trade, profile, zkpassport, common
│           ├── hooks/           # useP2PMarket, useEscrow, useTradeRequests, useZKPassport…
│           ├── context/         # Wallet, Offers, Location
│           ├── lib/
│           │   ├── host/        # The Polkadot Host integration (signer, contract calls, storage)
│           │   ├── evidence/    # Handover video → Merkle commitment → QR
│           │   ├── photo/       # Encrypted profile photos
│           │   └── zkpassport/  # Zero-knowledge identity client
│           └── abi/             # Contract ABIs the frontend encodes against
├── packages/
│   ├── contracts/               # Solidity (P2PMarket, ZKPassportRegistry) + Hardhat
│   ├── bulletin/                # Bulletin Chain upload helper (CID + TransactionStorage)
│   ├── types/                   # Shared TypeScript types
│   └── config/                  # Shared ESLint / Prettier / TypeScript configs
├── .claude/                     # AI-assistant skills & command docs for this repo
├── CLAUDE.md                    # Architecture & development guide
└── README.md                    # Quick start
```

## What's built vs. what's coming

LocalDOT is a working V1, but parts of the long-term vision are still ahead. In the spirit of honest docs:

**Working today**
- ✅ Three-role marketplace (buyer / provider / agent), all on-chain.
- ✅ Buy & sell offers with 14-day expiry; permanent on-chain agent registry; one offer can list at many agents.
- ✅ Both trade paths — **direct** and **agent-mediated** — end to end.
- ✅ Safety nets: 24-hour timeout refund and mutual cancel.
- ✅ Agent insurance staking (publicly visible; frozen during active trades).
- ✅ Optional handover video evidence on the Bulletin Chain.
- ✅ Optional ZKPassport proof-of-personhood with a one-per-passport guard.
- ✅ Map-based discovery and a guided "Quick Match" exchange flow.
- ✅ Encrypted profile photos.

**On the roadmap (designed, not yet enforced on-chain)**
- ⏳ **A real Hollar stablecoin.** Today the escrow moves the native test token (PAS), priced \$1; integrating an actual digital-dollar stablecoin is future work.
- ⏳ **Agent slashing.** The insurance deposit is visible and frozen during trades, but the contract can't yet *pay it out* to a wronged provider (the `DEFAULTED` state / slashing path isn't implemented). For now the stake is a trust signal, not enforced collateral.
- ⏳ **Reputation** and **dispute resolution** — none on-chain yet; safety is escrow + timeout + mutual cancel.
- ⏳ **Multi-asset / multi-currency** — USD and a single token only for now.
- ⏳ **Gas sponsorship (PGAS).** The Host's "SmartContractAllowance" only **auto-signs** your contract calls — it does **not** pay your gas. Your account must hold a little native token to transact.
