# Design System — LocalDOT

## Direction

**Personality:** Polkadot.com native — warm-stone monochrome, editorial, considered
**Foundation:** Warm neutral (stone palette — NOT pure gray, NOT cool slate)
**Depth:** Borders-first, with layered shadow only for floating overlays (dropdowns, nav blur)

## Intent

**Who:** Three roles. **Buyer** — someone in an emerging market with cash in hand, meeting a stranger to exchange for digital dollars (conceptually USD-priced; the escrowed asset is the native chain token, PAS on testnet). **Provider** — manages offers between other work. **Handoff Agent** — a physical shop that confirms cash on the buyer's behalf so the two principals never have to meet. Mobile-first, harsh sunlight, nervous energy.

**What they do:**
- **Direct path (two people meet):** Find provider → agree terms → lock escrow (LOCKED) → meet in person → both `confirmTrade` → escrow releases, COMPLETED → walk away safe.
- **Agent-mediated path:** Buyer drops cash at the agent shop → agent `confirmCashReceived` releases tokens to the buyer (RELEASED) → provider later does `confirmPickup` to collect the cash → COMPLETED. The agent fee is cash / off-chain (stored on-chain only for display).
- **Escape hatch:** if a LOCKED trade is never confirmed, anyone can `refundTrade` after the 24h `CONFIRMATION_TIMEOUT` (REFUNDED); a mutual `requestCancel` returns funds (CANCELLED).

**Feel:** Assured. Solid like a notarized receipt. The confidence of a stamped document. Serious because it handles real money, but warm because Polkadot's identity is warm.

## Signature

**Escrow Stamp Bar** — horizontal state machine styled as sequential stamps. On-chain states are LOCKED → RELEASED → COMPLETED, with the terminal branches REFUNDED and CANCELLED ([`P2PMarket.sol`](../packages/contracts/contracts/P2PMarket.sol) enum `TradeState`). The UI labels them via [`tradeStateLabel()`](../apps/web/src/lib/trade-state.ts): **Active** (LOCKED) → for agent trades **Cash ready** / for direct trades **Tokens out** (RELEASED) → **Settled** (COMPLETED), or **Refunded** / **Cancelled** as terminal states. Direct trades skip the RELEASED leg (both parties `confirmTrade` jumps LOCKED → COMPLETED); agent trades use the full LOCKED → RELEASED (agent `confirmCashReceived`) → COMPLETED (provider `confirmPickup`) path. Filled circles for complete, color-coded active state, empty for pending. Appears on trade detail and compact in trade cards.

## Typography

- **Sans:** DM Sans (from polkadot.com) — weights 300, 400, 500, 600, 700
- **Serif:** DM Serif Display (from polkadot.com) — headings, hero numbers, stats
- **Mono:** JetBrains Mono (from polkadot.com) — addresses, amounts, hashes, data

Headings use serif with tight tracking (-0.02em to -0.03em). Body uses sans. Data uses mono with tabular-nums.

## Tokens

### Colors (Dark Mode — from polkadot.com CSS .dark)

```
--color-bg: #0f0f0f             (near-black)
--color-surface: #1c1917        (stone-900)
--color-surface-secondary: #292524  (stone-800)
--color-text-primary: #fafaf9   (stone-50)
--color-text-secondary: #d6d3d1 (stone-300)
--color-text-tertiary: #a8a29e  (stone-400)
--color-text-muted: #78716c     (stone-500)
--color-border: #44403c         (stone-700)
--color-border-strong: #57534e  (stone-600)
--color-accent: #d6d3d1         (stone-300)
--color-accent-hover: #fafaf9   (stone-50)
```

### Semantic Colors

```
--color-escrow-locked: #d97706    (amber-600 — Active, funds held, waiting)
--color-escrow-released: #0891b2  (cyan-600 — Cash ready / Tokens out, mid-flight)
--color-escrow-completed: #16a34a (green-600 — Settled, success)
--color-escrow-refunded: #dc2626  (red-600 — Refunded, timeout stopped)
--color-escrow-cancelled: #78716c (stone-500 — Cancelled, mutual unwind)
```

### Spacing

Base: 4px
Scale: 4, 8, 12, 16, 20, 24, 32, 48, 64, 80, 96

### Radius

```
sm: 8px   (default .rounded from polkadot.com)
md: 12px  (.rounded-lg)
lg: 16px  (.rounded-xl)
full: 9999px
```

### Shadows (from polkadot.com)

```
sm: 0 1px 2px rgba(0, 0, 0, 0.04)
md: 0 4px 12px rgba(0, 0, 0, 0.06), 0 1px 3px rgba(0, 0, 0, 0.04)
lg: 0 12px 40px rgba(0, 0, 0, 0.12), 0 4px 8px rgba(0, 0, 0, 0.06)
```

## Patterns

### Button Primary
- Height: 44px min (touch target)
- Padding: 10px 20px
- Radius: 12px
- Font: 14px DM Sans, 500 weight
- Background: stone-100 (inverted for dark mode)
- Text: stone-900
- Hover: white bg
- No gradients, no shadows

### Button Secondary
- Same sizing as primary
- Background: transparent
- Border: 1px solid stone-700
- Text: stone-200
- Hover: stone-800 bg, stone-600 border

### Card
- Background: stone-900
- Border: 1px solid stone-700
- Radius: 16px
- Padding: 24px
- No shadow (borders-only depth)

### Card Interactive
- Same as card
- Hover: border-stone-600, shadow-sm

### Input
- Height: 44px min
- Background: stone-800
- Border: 1px solid stone-700
- Radius: 12px
- Padding: 12px 16px
- Text: stone-100
- Placeholder: stone-500
- Focus: stone-500 border, ring-2 stone-100/5

### Badge (Trade States)
- Padding: 4px 10px
- Radius: full
- Font: 12px, 500 weight
- Labels come from [`tradeStateLabel()`](../apps/web/src/lib/trade-state.ts); the agent/direct context swaps the RELEASED label.
- LOCKED → "Active": amber-900/30 bg, amber-400 text
- RELEASED → "Cash ready" (agent) / "Tokens out" (direct): cyan-900/30 bg, cyan-400 text
- COMPLETED → "Settled": green-900/30 bg, green-400 text
- REFUNDED → "Refunded": red-900/30 bg, red-400 text
- CANCELLED → "Cancelled": stone-800 bg, stone-400 text

> Note: `tradeStateLabel()` also maps `5 = "Insured"`, but there is **no on-chain INSURED (or DEFAULTED) state** — the contract enum has exactly 5 values (0–4). The 5=Insured label is a known frontend bug, not a real state; do not design for it.

### Navigation
- Sticky top, z-40
- Background: stone-950/95 + backdrop-blur-xl
- Border-bottom: 1px stone-700
- Height: 64px
- Active link: stone-800 bg, stone-100 text

### Segmented Control (filters/sorts)
- Container: stone-800 bg, rounded-lg, p-1
- Active: stone-700 bg, stone-100 text, shadow-sm
- Inactive: transparent, stone-400 text

### Section Labels
- 11-12px uppercase tracking-wider
- stone-400 color
- Font-medium weight
- Used to label card sections

## Decisions

| Decision | Rationale | Date |
|----------|-----------|------|
| DM Sans + DM Serif Display + JetBrains Mono | Exact fonts from polkadot.com production CSS | 2026-02-06 |
| Stone palette (warm gray) not pure gray or slate | Extracted from polkadot.com CSS variables | 2026-02-06 |
| Borders-only depth | Matches polkadot.com — cards use borders not shadows | 2026-02-06 |
| Serif headings, sans body, mono data | Polkadot.com pattern — serif for editorial feel | 2026-02-06 |
| 44px min touch targets | Mobile-first for emerging market users | 2026-02-06 |
| Escrow stamp bar signature | Unique to P2P escrow flow — not found in generic dashboards | 2026-02-06 |
| Stamp bar tracks real on-chain states (LOCKED/RELEASED/COMPLETED + REFUNDED/CANCELLED) | Matches `P2PMarket.sol` enum and `tradeStateLabel()`; direct trades skip RELEASED, agent trades use it | 2026-06-03 |
| No bright accent color | polkadot.com accent is stone-600, not a saturated color | 2026-02-06 |
| Dark mode default | Inverted to dark bg (polkadot.com .dark vars) per user request | 2026-02-06 |
