---
name: security
description: "Implement security best practices and avoid common vulnerabilities. Triggers: security, validation, audit, input, sanitize, XSS, injection"
---

# Security Skill

> **Scope for LocalDOT.** This is a **zero-backend static SPA** that runs sandboxed inside the
> Polkadot Host (Triangle). There is **no server, no server-side auth, no database, no sessions,
> no HTTP server we control**. Signing is host-injected (`accounts.getProductAccountSigner`, see
> [`apps/web/src/lib/host/signer.ts`](../../apps/web/src/lib/host/signer.ts)) — the app never
> handles passwords or secrets. So the sections below on password hashing, constant-time
> comparison, session expiration, SQL injection, and HTTP response headers are kept as
> **general reference only** — they do not apply to this codebase. The parts that DO apply:
> input validation, no PII in logs, `pnpm audit`, no `eval()`/`innerHTML`, and CSP.

## When to Activate

- Handling user input (trade requests, offer/agent metadata, Statement Store payloads)
- Adding dependencies
- Implementing logging
- Touching the smart contracts (see [Contract Security](#contract-security))
- Any user-facing changes

---

## Global Invariants

| Rule | Enforcement | Status |
|------|-------------|--------|
| Validate all input | Schema validation at boundary | MANDATORY |
| No PII in logs | Runtime checks | MANDATORY |
| Audit dependencies | `pnpm audit` in CI | MANDATORY |
| No `eval()` / `innerHTML` | Lint + review | MANDATORY |
| CSP-compatible code | Static build, no inline-eval | MANDATORY |

Note: Statement Store payloads (`req` / `res` / `prop` / `prop-res` / `status` / `ack`) are
**cleartext JSON in V1** — no message encryption (see
[`apps/web/src/lib/statement-store.ts`](../../apps/web/src/lib/statement-store.ts)). Treat
anything that crosses the wire as public; never put a secret in a payload.

---

## Input Validation

### Always Validate

Validate at the boundary — incoming Statement Store payloads, offer/agent metadata pulled from
IPFS, and any value passed into a contract write. Decode with a typed schema before use; never
trust the shape of JSON that crossed the wire. (The example below uses Zod for illustration —
use whatever typed-decode approach the touched module already uses.)

```typescript
// Illustrative: parse an untrusted trade-request payload at the boundary
const TradeRequestSchema = z.object({
  kind: z.literal('req'),
  amount: z.string().regex(/^\d+$/),       // stringified integer, no float/NaN
  currency: z.string().length(3),
  offerId: z.string().min(1).max(128),
});

function handleInbound(payload: unknown) {
  const req = TradeRequestSchema.parse(payload); // throws on malformed input
  // Now safe to use
}
```

### Validation Rules

| Type | Constraints |
|------|-------------|
| Strings | Max length, no HTML, pattern match |
| Numbers | Range-checked, no NaN |
| Arrays | Max length, element validation |
| URLs | Valid URL, no javascript: scheme |

---

## Contrastive Exemplars

### Input Handling

CORRECT:
```typescript
// Validate at boundary, use typed result
const req = TradeRequestSchema.parse(inboundPayload);
await handleTradeRequest(req);
```

FAIL:
```typescript
// Trust the wire
await handleTradeRequest(inboundPayload as TradeRequest);
```

### Logging

CORRECT:
```typescript
logger.error('Trade lock failed', {
  errorCode: error.code,
  state: trade.state,
});
```

FAIL:
```typescript
logger.error('Trade lock failed', {
  location: offer.location,  // user PII — geolocation!
  payload: inboundPayload,   // may contain recognition/meetup details
});
```

### Error Messages

CORRECT:
```typescript
// Map an on-chain custom error to a generic, user-facing message
throw new AppError('Could not lock trade — please retry');
```

FAIL:
```typescript
// Leaks internal detail / counterparty data to the UI
throw new Error(`Trade ${id} for ${buyerAddress} rejected: ${rawRevert}`);
```

---

## HTTP Security Headers

> **Not applicable to LocalDOT directly.** We ship a static SPA hosted on the Bulletin Chain;
> there is no application server emitting response headers, so we cannot set these from
> middleware. Keep this as general reference. The one piece that still matters to us is
> **writing CSP-compatible code** (no inline scripts, no `eval`) so the bundle works under a
> strict policy if the Host enforces one.

```typescript
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=()' },
];

// If using CSP
const csp = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
].join('; ');
```

---

## Dependency Security

### Audit Process

```bash
# Run on every install
pnpm audit

# CI must pass with zero critical/high
pnpm audit --audit-level=high
```

### Dependency Rules

| Rule | Reason |
|------|--------|
| Justify every dependency | Attack surface |
| Lock versions | Reproducibility |
| Review changelogs | Breaking changes |
| Check maintenance | Bus factor |

---

## Secure Coding Checklist

### Before Every PR

- [ ] All input validated
- [ ] No PII in logs
- [ ] No hardcoded secrets
- [ ] No `eval()` or `innerHTML`
- [ ] `pnpm audit` passes

### For Auth Changes (general reference — NOT used in LocalDOT)

> LocalDOT has no auth layer of its own. Signing is host-injected and identity is
> ZKPassport + the on-chain registry. The list below is generic background only.

- [ ] Password hashing (bcrypt/argon2)
- [ ] Constant-time comparison
- [ ] Rate limiting
- [ ] Session expiration

### For Contract Changes

- [ ] State-changing functions emit events
- [ ] `noReentrant` guard on any function that sends value (`.call{value:}`)
- [ ] Custom errors (not string `require`) for revert reasons
- [ ] Per-function `msg.sender` checks for access control
- [ ] No `tx.origin`, no `selfdestruct`, no untrusted `delegatecall`
- [ ] `hardhat test` + `solidity-coverage` pass

---

## Contract Security

> **What this repo actually does.** Two Solidity files in
> [`packages/contracts/contracts/`](../../packages/contracts/contracts/):
> `P2PMarket.sol` (escrows the **chain-native token** via `msg.value` / `.call{value:}` — PAS on
> testnet, the traded token is a conceptual USD-pegged display label, **not** an ERC-20) and
> `ZKPassportRegistry.sol`. Neither inherits OpenZeppelin (it's an unused devDependency).
> Contracts are **non-upgradeable** — no proxy, no UUPS, no initializer.

| Concern | LocalDOT approach |
|---------|-------------------|
| Reentrancy | Custom `noReentrant` modifier (single `bool` guard), not OZ `ReentrancyGuard` |
| Access control | Per-function `msg.sender` checks; **no** owner/admin, **no** `Ownable` |
| Revert reasons | Custom errors (e.g. `TransferFailed`, `TradeNotLocked`, `NotAgent`) |
| Value transfer | Native token via `.call{value:}`, checked for `TransferFailed` |
| Pragma | Floating `^0.8.28` (acceptable here; pin if reproducibility matters) |

Forbidden in contracts: `tx.origin`, `selfdestruct`, untrusted `delegatecall`. There is **no**
protocol fee, **no** stake-slashing, and **no** `DEFAULTED` trade state — trade states are
`LOCKED / RELEASED / COMPLETED / REFUNDED / CANCELLED`.

### Known audit item: profile-photo encryption uses a global static key

[`apps/web/src/lib/photo/encryption.ts`](../../apps/web/src/lib/photo/encryption.ts) derives the
AES-GCM key from `SHA-256("localdot-profile-photos-v1")` — a constant compiled into every client
(`APP_KEY_SEED` in [`photo/types.ts`](../../apps/web/src/lib/photo/types.ts)). This is
**obfuscation, not confidentiality**: anyone with the bundle can derive the key and decrypt any
photo. It is a deliberate V1 trade-off, but do not treat encrypted profile photos as private,
and do not reuse this pattern for anything that needs real confidentiality.

---

## Anti-Patterns

| Pattern | Status | Reason |
|---------|--------|--------|
| `eval()` | FORBIDDEN | Code injection |
| `innerHTML` | FORBIDDEN | XSS |
| Trust wire/client input | FORBIDDEN | Statement Store payloads are public, hostile |
| Log PII | FORBIDDEN | Compliance/privacy |
| Hardcode secrets | FORBIDDEN | Source control leak |
| `tx.origin` for auth (contracts) | FORBIDDEN | Phishing via intermediary contract |
| `selfdestruct` / untrusted `delegatecall` | FORBIDDEN | Code/state hijack |
| String `require` reasons (contracts) | AVOID | Use custom errors (cheaper, typed) |
| SQL string concat | N/A | No database — general reference only |
| Disable HTTPS | N/A | No server we control — general reference only |
