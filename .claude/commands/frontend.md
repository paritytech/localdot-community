# /frontend - Frontend Implementation

Build the LocalDOT React SPA.

Top navigation is **Exchange · Explore · Create · Profile · About**. The router
uses `HashRouter` (the SPA is served from the Bulletin Chain, so hash routing
avoids server-side rewrite requirements). See [`apps/web/src/App.tsx`](../../apps/web/src/App.tsx).

```typescript
// apps/web/src/App.tsx (abridged)
import { HashRouter, Navigate, Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { Layout } from './components/layout/Layout';
import { Spinner } from './components/common/Spinner';

const Home = lazy(() => import('./pages/landing/Landing2'));
const Exchange = lazy(() => import('./pages/Exchange'));
const Explore = lazy(() => import('./pages/Explore'));
const ExploreOffers = lazy(() => import('./pages/ExploreOffers'));
const ExploreAgents = lazy(() => import('./pages/ExploreAgents'));
const OfferDetail = lazy(() => import('./pages/OfferDetail'));
const AgentDetail = lazy(() => import('./pages/AgentDetail'));
const Create = lazy(() => import('./pages/Create')); // renders CreateListing / RegisterAgent inline
const Profile = lazy(() => import('./pages/Profile'));
const TradeDetail = lazy(() => import('./pages/TradeDetail'));
const About = lazy(() => import('./pages/About'));

export function App() {
  return (
    <HashRouter>
      <Layout>
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/exchange" element={<Exchange />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/explore/offers" element={<ExploreOffers />} />
            <Route path="/explore/agents" element={<ExploreAgents />} />
            <Route path="/offer/:id" element={<OfferDetail />} />
            <Route path="/agent/:address" element={<AgentDetail />} />
            <Route path="/create" element={<Create />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/profile/:address" element={<Profile />} />
            <Route path="/trades/:id" element={<TradeDetail />} />
            <Route path="/about" element={<About />} />
            <Route path="/offers" element={<Navigate to="/explore/offers" replace />} />
          </Routes>
        </Suspense>
      </Layout>
    </HashRouter>
  );
}
```

> Note: Profile carries sub-tabs (Received / Sent / Active Trades / My Offers / My Agency).

---

## State Management

**Global State:** React Context for wallet and trade state

```typescript
// apps/web/src/context/WalletContext.tsx
import { createContext, useContext, useReducer, ReactNode } from 'react';

interface WalletState {
  account: string | null;
  isConnecting: boolean;
  error: string | null;
}

type WalletAction =
  | { type: 'CONNECT_START' }
  | { type: 'CONNECT_SUCCESS'; account: string }
  | { type: 'CONNECT_ERROR'; error: string }
  | { type: 'DISCONNECT' };

const WalletContext = createContext<{
  state: WalletState;
  dispatch: React.Dispatch<WalletAction>;
} | null>(null);

function walletReducer(state: WalletState, action: WalletAction): WalletState {
  switch (action.type) {
    case 'CONNECT_START':
      return { ...state, isConnecting: true, error: null };
    case 'CONNECT_SUCCESS':
      return { account: action.account, isConnecting: false, error: null };
    case 'CONNECT_ERROR':
      return { ...state, isConnecting: false, error: action.error };
    case 'DISCONNECT':
      return { account: null, isConnecting: false, error: null };
    default:
      return state;
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(walletReducer, {
    account: null,
    isConnecting: false,
    error: null,
  });

  return (
    <WalletContext.Provider value={{ state, dispatch }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWalletContext() {
  const context = useContext(WalletContext);
  if (!context) throw new Error('useWalletContext must be within WalletProvider');
  return context;
}
```

**Server State:** TanStack Query is wired in `App.tsx` for chain data. Offers
themselves are **read from the P2PMarket contract**, not from a Bulletin offer
query — `OffersContext` loads them via [`lib/host/offers.ts`](../../apps/web/src/lib/host/offers.ts)
(`getAllOffers()` → `ReviveApi.call`), enriches each with IPFS metadata, drops
expired ones, and exposes them through `useOffers()`. There is no
`@localdot/shared` package (workspace packages are `config`, `types`,
`contracts`, `bulletin`); shared types live in [`@localdot/types`](../../packages/types).

```typescript
// apps/web/src/context/OffersContext.tsx (abridged)
import { useP2PMarket } from '../hooks/useP2PMarket';
import { fetchJSONFromIPFS } from '../lib/ipfs';
import type { Offer } from '../types/offers';

// OffersProvider calls getAllOffers() from the contract, joins each entry with
// its IPFS metadata CID, filters out entries older than OFFER_TTL_MS, and
// dispatches SET_OFFERS. Components consume it via the useOffers() hook:
const { offers, loading, getOffer, refreshOffers } = useOffers();
```

---

## Wallet Connection

The app runs as a sandboxed Product inside the Polkadot Triangle (Polkadot
Desktop / iOS / dot.li). Signing is **Host-injected only** — there is no
standalone-browser wallet flow, no `window.ethereum`, and no
`window.injectedWeb3` extension to discover. We use the Host API wrapper's
**product-account** flow:

- `accounts.getProductAccount(window.location.host, 0)` resolves the
  product-derived account from the Host (derivation index `0`).
- `accounts.getProductAccountSigner(account, "createTransaction")` returns a
  `PolkadotSigner` that forwards every signed-extension's real `extra` +
  `additionalSigned` bytes to `host.createTransaction`.

> Note: the legacy `signPayload` / `polkadot-api/pjs-signer` path was abandoned.
> Asset Hub Next declares custom signed-extensions (`AuthorizeCall`, `AsPgas`,
> `AsRingAlias`, `EthSetOrigin`, …) that pjs-signer can't encode; the iOS legacy
> builder silently drops `EthSetOrigin` (the H160 origin `Revive.call` needs) →
> `BadProof`. There is no `@novasamatech/product-sdk` and no `injectSpektrExtension`.
> See [`apps/web/src/lib/host/signer.ts`](../../apps/web/src/lib/host/signer.ts).

```typescript
// apps/web/src/lib/host/signer.ts (excerpt)
import { accounts } from '@novasamatech/host-api-wrapper';
import { AccountId } from 'polkadot-api';
import type { PolkadotSigner } from 'polkadot-api/signer';

const accountIdCodec = AccountId();

export async function getHostSignerAndAddress(): Promise<{
  signer: PolkadotSigner;
  address: string;
}> {
  const result = await accounts.getProductAccount(window.location.host, 0);
  const productAccount = result.match(
    (v) => v,
    (e) => { throw new Error(`Failed to fetch product account: ${JSON.stringify(e)}`); },
  );
  const signer = accounts.getProductAccountSigner(productAccount, 'createTransaction');
  const address = accountIdCodec.dec(productAccount.publicKey);
  return { signer, address };
}
```

`WalletContext` calls `getHostAccount()` on connect and caches the
`PolkadotSigner` + address. Synchronous consumers read it via
`getSignerAndAddress()`; the cached signer is then used by `useP2PMarket` /
`useEscrow` for `Revive.call` writes. Before any write, `ensureBootstrap`
([`lib/host/allowances.ts`](../../apps/web/src/lib/host/allowances.ts)) must have
granted `SmartContractAllowance` (derivation index 0) — that allowance only
**auto-signs** the `Revive.call` (skips the per-call modal); it is **not** gas
sponsorship, so the product account must hold native PAS (faucet on testnet).

---

## Contract Interaction

> Note: this app does **not** use ethers as a wallet or RPC transport, and there
> is no `lib/contracts.ts` / `ESCROW_ABI` / `getEscrowContract` / `VITE_ESCROW_ADDRESS`.
> The single contract is **P2PMarket** (there is no separate escrow contract);
> the escrowed asset is the **chain native token** (PAS) sent via `msg.value`,
> not an ERC-20. ethers v6 is used **only** to ABI encode/decode calldata
> (`new ethers.Interface(abi)`); all chain access is PAPI over WSS.

P2PMarket runs on PolkaVM via Revive. Both reads and writes go through PAPI
against Asset Hub Next — there is no EVM JSON-RPC provider in the app and no
`window.ethereum`. The ABI lives at
[`apps/web/src/abi/P2PMarket.json`](../../apps/web/src/abi/P2PMarket.json) and the
address comes from `env.VITE_P2PMARKET_ADDRESS`.

- **Reads** → `ReviveApi.call` (a dry-run; origin is any SS58, defaulting to
  `VITE_READONLY_ORIGIN` / Alice). Decoded with `ethers.Interface`.
- **Writes** → the Host `createTransaction` signer submits a `Revive.call`
  extrinsic (`api.tx.Revive.call`) with the encoded calldata and `value`.

See [`apps/web/src/lib/host/_p2p-market-call.ts`](../../apps/web/src/lib/host/_p2p-market-call.ts).

```typescript
// apps/web/src/lib/host/_p2p-market-call.ts (abridged)
import { ethers } from 'ethers';
import { Binary } from 'polkadot-api';
import P2PMarketArtifact from '../../abi/P2PMarket.json';
import { addressToH160, ALICE_SS58_ADDRESS } from './_internal';
import { assetHubProvider } from './assethub-provider';

export async function queryP2PMarket(functionName: string, params: unknown[]) {
  const { api } = await assetHubProvider.get();
  const iface = new ethers.Interface(P2PMarketArtifact.abi);
  const calldata = iface.encodeFunctionData(functionName, params);

  const result = await api.apis.ReviveApi.call(
    ALICE_SS58_ADDRESS,
    addressToH160(getP2PMarketAddress()),
    0n,                       // value (reads send none)
    undefined, undefined,     // gas / storage limits — auto
    Binary.fromHex(calldata),
  );
  if (!result.result.success) throw new Error(`${functionName} failed`);
  return iface.decodeFunctionResult(functionName, Binary.toHex(result.result.value.data));
}

// submitP2PMarketCall(originAddress, signer, calldata, value) builds
// api.tx.Revive.call({ dest, value, weight_limit, ... }) and signs it with the
// Host PolkadotSigner. Accounts are auto-mapped (AutoMapper) — no map_account.
```

**Usage in hooks:** [`useP2PMarket`](../../apps/web/src/hooks/useP2PMarket.ts)
covers agents + offers; [`useEscrow`](../../apps/web/src/hooks/useEscrow.ts)
covers trades. They read the cached Host signer via `getSignerAndAddress()` from
`WalletContext`, then call the `*ViaSubstrate` helpers in `lib/host`. The trade
lifecycle is `lockTrade` (payable → **LOCKED**) → `confirmTrade` / `confirmCashReceived`
(agent → **RELEASED**) / `confirmPickup` (provider → **COMPLETED**), with
`requestCancel` (mutual → **CANCELLED**) and `refundTrade` (anyone, after the 24h
`CONFIRMATION_TIMEOUT` while LOCKED → **REFUNDED**). There is no
`createTrade` / `fundEscrow` / `confirmHandover` / `claimTimeout`.

```typescript
// apps/web/src/hooks/useEscrow.ts (abridged)
import { getSignerAndAddress } from '../context/WalletContext';
import { lockTradeViaSubstrate, getTradeViaSubstrate } from '../lib/host';

export function useEscrow() {
  const lockTrade = async (params: LockTradeParams) => {
    const wallet = getSignerAndAddress();
    if (!wallet) throw new Error('Wallet not connected or read-only.');
    const { parseUnits } = await import('ethers');
    const amountWei = parseUnits(params.amount, nativeCurrency.decimals); // PAS, 10 decimals
    return lockTradeViaSubstrate(
      wallet.address, wallet.signer,
      params.counterparty, params.offerId, params.agent /* ZERO_ADDRESS for direct */, amountWei,
    );
  };
  // ... confirmTrade / confirmCashReceived / confirmPickup / requestCancel / refundTrade
}
```

---

## Styling Guidelines

The canonical design system is [`.interface-design/system.md`](../../.interface-design/system.md) —
read it before touching UI. The aesthetic is **polkadot.com-native dark warm
stone** (not black/white, not cool slate, not a light theme).

- **Colors:** dark warm STONE palette — bg `#0f0f0f`, surfaces stone-900/800
  (`#1c1917` / `#292524`), text stone-50→stone-500, borders stone-700/600.
  Semantic escrow colors: amber-600 (waiting), green-600 (success), red-600 (stopped).
- **Typography:** **DM Sans** (body, weights 300–700), **DM Serif Display**
  (headings / hero numbers, tight tracking), **JetBrains Mono** (addresses,
  amounts, hashes — `tabular-nums`). Not Inter.
- **Layout:** borders-first; layered shadow only for floating overlays
  (dropdowns, nav blur). Radius sm 8px / md 12px / lg 16px. 4px spacing base.
- **Signature:** the Escrow Stamp Bar — a horizontal trade state machine styled
  as sequential stamps (see the design system for the live LOCKED → RELEASED /
  COMPLETED / REFUNDED / CANCELLED states).
- **Mobile-first:** designed for someone in harsh sunlight with cash in hand.
  375px first, touch targets ≥ 44px, focus rings for accessibility.

Refer to [`.interface-design/system.md`](../../.interface-design/system.md) for
the exact tokens, button/card patterns, and component recipes rather than
hardcoding values here.

---

## Error Handling

```typescript
// apps/web/src/lib/errors.ts
export type ErrorCode =
  | 'RPC_UNAVAILABLE'
  | 'TX_REVERTED'
  | 'INSUFFICIENT_FUNDS'
  | 'USER_REJECTED'
  | 'TIMEOUT'
  | 'INVALID_STATE';

export class ChainError extends Error {
  constructor(
    message: string,
    public readonly code: ErrorCode,
    public readonly recoverable: boolean = false
  ) {
    super(message);
    this.name = 'ChainError';
  }
}

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  RPC_UNAVAILABLE: 'Unable to connect to Polkadot. Check your internet connection.',
  TX_REVERTED: 'Transaction failed. Your funds are safe.',
  INSUFFICIENT_FUNDS: 'Insufficient PAS balance for gas/escrow.',
  USER_REJECTED: 'Transaction cancelled.',
  TIMEOUT: 'Request timed out. Please try again.',
  INVALID_STATE: 'Trade is no longer in the expected state. Please refresh.',
};

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelay = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt === maxAttempts;
      const isRetryable = error instanceof ChainError && error.recoverable;

      if (isLastAttempt || !isRetryable) throw error;

      await new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt - 1)));
    }
  }
  throw new Error('Unreachable');
}
```

---

## Phase 2 Tasks

- [ ] Set up apps/web with Vite + React + TS + Tailwind
- [ ] Configure the dark warm-stone theme (DM Sans / DM Serif Display / JetBrains Mono) per [`.interface-design/system.md`](../../.interface-design/system.md)
- [ ] Implement Host-injected signing via `@novasamatech/host-api-wrapper` (`getProductAccount` + `getProductAccountSigner(account, "createTransaction")`)
- [ ] Build Layout: Header (logo, nav: Exchange · Explore · Create · Profile · About)
- [ ] Build pages: Landing2, Explore (ExploreOffers / ExploreAgents), Profile
- [ ] Set up React Router (`HashRouter`) with lazy loading
- [ ] Set up TanStack Query provider + OffersProvider (contract-backed offers)

## Phase 2 Acceptance Criteria

- [ ] `pnpm web:dev` (or `turbo dev --filter=@localdot/web`) starts on localhost:5173
- [ ] `turbo build` succeeds with no warnings
- [ ] `turbo lint` passes with zero errors/warnings
- [ ] `turbo typecheck` passes with zero errors
- [ ] Host product account connects in the Triangle host and address shows in header
- [ ] Theme matches the dark warm-stone design system
- [ ] Mobile layout works at 375px width
- [ ] All pages render without errors
- [ ] No console errors in browser DevTools
