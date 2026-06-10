---
name: testing-patterns
description: "Implement effective testing patterns with strategy selection. Triggers: test patterns, coverage, mutation, spec, unit, integration, mock, stub"
---

# Testing Patterns Skill

> **This repo's actual stack.** Contracts use **Hardhat** with Mocha/Chai/ethers
> (via `@nomicfoundation/hardhat-toolbox`) and `solidity-coverage` — see
> [`packages/contracts/test/`](../../packages/contracts/test/) and run `pnpm contracts:test`.
> Web tests are **Playwright** end-to-end specs in [`apps/web/e2e/`](../../apps/web/e2e/)
> (`pnpm --filter web test:e2e`). There is **no vitest**, **no fast-check**, **no Stryker
> (mutation testing)**, and **no Zod** installed. The Vitest-style snippets below
> (`vi.fn()`, `toMatchObject`, etc.) and the fast-check / mutation / Zod guidance are kept
> as **generic reference only** — adapt them to Chai (`expect(...).to.equal(...)`) or
> Playwright assertions for this project, or add the tooling first if you actually want it.

## When to Activate

- Writing new tests
- Improving test coverage
- Setting up test infrastructure
- Choosing testing strategy
- Evaluating test quality

---

## Global Invariants

| Rule | Constraint | Status |
|------|------------|--------|
| Line coverage | >=80% | MANDATORY |
| Security-critical code (contracts) | 100% coverage | MANDATORY |
| No test without assertions | Always | MANDATORY |
| Descriptive test names | Self-documenting | MANDATORY |
| Mutation score | >=80% | Recommended (no mutation tooling installed) |

---

## Test Strategy Decision Matrix

| Scenario | Strategy | Rationale |
|----------|----------|-----------|
| Pure function, clear I/O | Unit test | Fast, deterministic |
| Business logic with rules | Property-based | Finds edge cases |
| External dependencies | Integration test | Verifies real behavior |
| UI components | Snapshot + interaction | Visual + behavioral |
| API endpoints | Integration test | Full request/response |
| Database operations | Integration test | Real DB behavior |
| Complex algorithms | Property-based + unit | Exhaustive + readable |

---

## Test Doubles Taxonomy (Meszaros)

| Double | Purpose | When to Use |
|--------|---------|-------------|
| **Dummy** | Fill parameter, never used | Required arg you don't care about |
| **Stub** | Return canned answers | Control indirect inputs |
| **Spy** | Record calls for verification | Verify interactions |
| **Mock** | Verify expectations | Behavior verification |
| **Fake** | Working implementation (simplified) | Replace slow/complex dependency |

### Decision Guide

```
Need to fill a parameter?           -> Dummy
Need to control what SUT receives?  -> Stub
Need to verify what SUT sends?      -> Spy/Mock
Need simplified but working impl?   -> Fake
```

### Examples

```typescript
// Dummy - just fills the parameter
const dummyLogger = {} as Logger;
new Service(dummyLogger);

// Stub - returns controlled value
const stubRepo = { findById: () => ({ id: 1, name: 'Test' }) };

// Spy - records calls
const sendEmailSpy = vi.fn();
service.notify(user);
expect(sendEmailSpy).toHaveBeenCalledWith(user.email);

// Fake - simplified working implementation
const fakeDb = new Map<string, User>();
const fakeRepo = {
  save: (u: User) => fakeDb.set(u.id, u),
  findById: (id: string) => fakeDb.get(id),
};
```

---

## Test Shapes

| Shape | Ratio (Unit:Integration:E2E) | When to Use |
|-------|------------------------------|-------------|
| **Pyramid** | 70:20:10 | Traditional, most projects |
| **Trophy** | 20:60:20 | Integration-heavy (APIs, DBs) |
| **Diamond** | 10:70:20 | Microservices, heavy I/O |

**Default to Pyramid** unless project characteristics suggest otherwise.

---

## Test Naming

### Pattern: `it('should <behavior> when <condition>')`

CORRECT:
```typescript
it('should return null when user not found')
it('should throw ValidationError when input is empty')
it('should emit event when status changes')
```

FAIL:
```typescript
it('test 1')
it('works')
it('handles error')
```

---

## Test Structure: AAA Pattern

```typescript
it('calculates total correctly', () => {
  // Arrange
  const items = [{ price: 10 }, { price: 20 }];

  // Act
  const total = calculateTotal(items);

  // Assert
  expect(total).toBe(30);
});
```

---

## Property-Based Testing

> Recommended technique, not used in this repo — `fast-check` is not installed.
> Treat the snippet below as generic reference; add `fast-check` first if you want it.

Use when inputs have broad ranges or complex constraints.

```typescript
import { fc } from 'fast-check';

// Property: sorting is idempotent
it('sort(sort(arr)) === sort(arr)', () => {
  fc.assert(
    fc.property(fc.array(fc.integer()), (arr) => {
      const sorted = sort(arr);
      expect(sort(sorted)).toEqual(sorted);
    })
  );
});

// Property: reverse is its own inverse
it('reverse(reverse(arr)) === arr', () => {
  fc.assert(
    fc.property(fc.array(fc.anything()), (arr) => {
      expect(reverse(reverse(arr))).toEqual(arr);
    })
  );
});
```

**When to use property-based:**
- Mathematical operations
- Serialization/deserialization
- Sorting/filtering
- Any function with invariants

---

## Assertion Strength

| Strength | Example | Use When |
|----------|---------|----------|
| **Strong** | `expect(x).toBe(42)` | Exact value known |
| **Medium** | `expect(x).toMatchObject({...})` | Partial match needed |
| **Weak** | `expect(x).toBeDefined()` | AVOID - rarely useful |

CORRECT:
```typescript
expect(result).toBe(30);
expect(user.email).toBe('test@example.com');
expect(items).toHaveLength(3);
```

FAIL:
```typescript
expect(result).toBeDefined();    // Misses wrong values
expect(user).toBeTruthy();       // Misses structure issues
expect(items.length).toBeGreaterThan(0);  // Misses exact count
```

---

## Boundary Testing

Always test boundaries for numeric/range logic:

```typescript
describe('validateAge', () => {
  // Boundary: exactly at threshold
  it('accepts age 18', () => expect(validateAge(18)).toBe(true));

  // Boundary: just below threshold
  it('rejects age 17', () => expect(validateAge(17)).toBe(false));

  // Edge: negative
  it('rejects negative age', () => expect(validateAge(-1)).toBe(false));

  // Edge: non-integer
  it('rejects non-integer', () => expect(validateAge(18.5)).toBe(false));
});
```

---

## Coverage Types

| Type | Target | Catches | Tooling |
|------|--------|---------|---------|
| Line coverage | 80% | Untouched code | `solidity-coverage` (contracts) |
| Branch coverage | 75% | Missing conditions | `solidity-coverage` (contracts) |
| Mutation score | 80% | Weak assertions | Recommended — no mutation tooling installed |

---

## Anti-Patterns

| Pattern | Status | Reason |
|---------|--------|--------|
| Test without assertions | FORBIDDEN | 0% bug detection |
| `expect(x).toBeDefined()` only | FORBIDDEN | Misses value bugs |
| Testing implementation details | FORBIDDEN | Test behavior |
| `it.skip` / `it.todo` left in | FORBIDDEN | Fix or delete |
| Hardcoded dates/times | FORBIDDEN | Flaky tests |
| `sleep()` / `setTimeout` in tests | FORBIDDEN | Use async utilities |
| Shared mutable state | FORBIDDEN | Test isolation |
| Over-mocking | CAUTION | Test real behavior when possible |
