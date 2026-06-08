> [!WARNING]
> The following is a prototype, reference implementation, and proof-of-concept. This open source code is provided for research, experimentation, and developer education only. This code has not been audited, is actively experimental, and may contain bugs, vulnerabilities, or incomplete features. Use at your own risk.

# LocalDOT

A Web3, peer-to-peer marketplace for swapping physical **cash** for **digital tokens** — and back — built entirely on Polkadot. On-chain escrow, a handoff-agent registry, and an offer book on Asset Hub; listing metadata and handover videos on the Bulletin Chain; trade signaling over the Statement Store. Runs inside the Polkadot Host (desktop, mobile, web).

## How it works

- A smart contract on **Asset Hub** holds the offer book, the handoff-agent registry, and the **escrow** that locks a seller's tokens until both sides confirm — or a 24-hour timeout refunds them.
- Bulk data (listing details, profile photos, handover videos) lives on the **Bulletin Chain**, addressed by content hash (CID).
- Trade requests, accept/decline, and meetup coordination travel over the **Statement Store** — Polkadot's decentralized messaging, not an open chat.
- No "connect wallet" button — the app is a **Product** that runs inside a Polkadot **Host** (the desktop app or [dot.li](https://dot.li)), which lends it the signer.
- Two ways to trade: **direct** (two people meet) or **agent-mediated** (a local shop confirms the cash handover).

## Deployed Contracts (Paseo Next v2)

| Contract | Address |
|----------|---------|
| `P2PMarket` | `0x86a9F3fe05CA4Bba050CF271Ac64fDF0D893F09E` |
| `ZKPassportRegistry` | `0xAA7C4b07c7040D31e40ad60E9e35257E376BD717` |

## Getting Started

Requires **Node 22+** and **pnpm 10+**.

### Deploy your own (recommended)

One guided command stands up a full instance — it deploys the `P2PMarket` contract, wires in its address, builds the app, and publishes it to a `.dot` domain. One mnemonic, end to end; you don't enter any address by hand:

```bash
pnpm install
pnpm run deploy        # interactive: wallet → fund → deploy → build → publish
```

See [docs/GUIDE.md](docs/GUIDE.md#deploying) for the full walkthrough (funding, custom domain, lower-level steps).

### Run locally against the existing deployment (quick look)

To browse or develop without deploying your own, start the dev server and point it at the deployed contracts above:

```bash
pnpm install
pnpm dev               # web app on http://localhost:5173
```

Create `apps/web/.env.local` with the deployed addresses — otherwise the app starts but shows **"contract not deployed"**:

```bash
VITE_P2PMARKET_ADDRESS=0x86a9F3fe05CA4Bba050CF271Ac64fDF0D893F09E
VITE_ZKPASSPORT_REGISTRY_ADDRESS=0xAA7C4b07c7040D31e40ad60E9e35257E376BD717
```

Network endpoints default to Paseo Next v2, so nothing else is needed. You can **browse** offers and agents read-only without a wallet; **signing** (creating an offer, locking funds, confirming a trade) only works inside a Polkadot Host.

## Environment Variables

`apps/web/.env.local` — everything except the contract addresses has a Paseo Next v2 default:

| Variable | Description |
|----------|-------------|
| `VITE_P2PMARKET_ADDRESS` | P2PMarket contract address (required to load data) |
| `VITE_ZKPASSPORT_REGISTRY_ADDRESS` | ZKPassportRegistry address (optional — identity verification) |
| `VITE_CHAIN_ID` | EVM chain id (default `420420417`) |
| `VITE_ASSET_HUB_ENDPOINT` · `VITE_BULLETIN_ENDPOINT` · `VITE_PEOPLE_CHAIN_ENDPOINT` | WSS endpoints (default Paseo Next v2) |
| `VITE_IPFS_GATEWAY` | Bulletin IPFS gateway |

`pnpm run deploy` fills in the contract address automatically; CI builds load these from [.github/env](.github/env). Full list with validation lives in [apps/web/src/env.ts](apps/web/src/env.ts).

## Learn more

[**docs/GUIDE.md**](docs/GUIDE.md) is the full tour — the three roles, the app tab-by-tab, the two trade paths, what keeps a trade safe, configuration, deploying, the architecture, and what's built vs. on the roadmap. For the development guide and quality gates, see [CLAUDE.md](CLAUDE.md).

## Security

> [!WARNING]
> The following is a prototype, reference implementation, and proof-of-concept. This open source code is provided for research, experimentation, and developer education only. This code has not been audited, is actively experimental, and may contain bugs, vulnerabilities, or incomplete features. Use at your own risk.

Before deploying it for real use cases, you are responsible for:

- Reviewing the code yourself, we publish a reference, not a hardened production build
- Checking that the dependencies are up to date and free of known vulnerabilities
- Securing your own fork or deployment environment (keys, secrets, network configuration)
- Tracking the latest tagged release/commits for security fixes; older releases are not backported (exceptions might apply)

For Parity's security disclosure process, and Bug Bounty program, feel free to visit: https://parity.io/bug-bounty

LocalDOT is experimental proof-of-concept code **developed and published by Parity Technologies**. It is **not** a Parity product or service, and Parity does **not** operate, host, deploy, or endorse any deployment of it — anyone who runs it does so on their own infrastructure and at their own discretion.

## License

Licensed under the **GNU General Public License v3.0 (GPL-3.0-only)** — see [LICENSE](LICENSE) for the full text. Third-party dependency licenses are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Copyright (C) 2026 Parity Technologies (UK) Ltd. and contributors.
