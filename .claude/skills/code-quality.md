---
name: code-quality
description: "Enforce minimal code philosophy with measurable constraints. Triggers: quality, refactor, clean, minimal, bloat, simplify, YAGNI"
---

# Code Quality Skill

## When to Activate

- Writing new code
- Reviewing code changes
- Refactoring existing code
- Responding to "improve" or "optimize" requests

> **This repo (LocalDOT):** TypeScript is strict mode with no `any`; smart contracts are built/tested with Hardhat (`@parity/hardhat-polkadot`, not Foundry); no `console.log` in production code.

---

## Global Invariants

| Rule | Constraint | Status |
|------|------------|--------|
| Least code wins | Fewer lines = better | MANDATORY |
| Function length | <=60 lines | MANDATORY |
| Cyclomatic complexity | <=15 per function | MANDATORY |
| Function parameters | <=4 (use options object beyond) | MANDATORY |
| File length | 300-450 soft limit, 600 hard limit | MANDATORY |
| Build only what's requested | No speculative features | MANDATORY |
| Delete unused code | Don't comment out | MANDATORY |

---

## Numeric Constraints

| Metric | Soft Limit | Hard Limit | Action |
|--------|------------|------------|--------|
| Function lines | 40 | 60 | Extract helper |
| File lines | 300 | 600 | Split file |
| Parameters | 3 | 4 | Use options object |
| Nesting depth | 3 | 4 | Extract or early return |
| Cyclomatic complexity | 10 | 15 | Simplify logic |

---

## Parameter Patterns

| Pattern | When to Use | Example |
|---------|-------------|---------|
| Positional (1-2 args) | Simple, obvious order | `add(a, b)` |
| Positional (3 args) | Still clear, rare | `clamp(value, min, max)` |
| Options object | 4+ args or optional params | `createUser({ name, email, role? })` |
| Builder pattern | Complex construction | `QueryBuilder.select().where().limit()` |

**Options Object Pattern:**
```typescript
// CORRECT: Options object for 4+ params
interface CreateUserOptions {
  name: string;
  email: string;
  role?: 'admin' | 'user';
  sendWelcome?: boolean;
}
function createUser(options: CreateUserOptions): User

// FAIL: Too many positional params
function createUser(name: string, email: string, role: string, sendWelcome: boolean): User
```

---

## Abstraction Decision Framework

Before extracting a function/class, answer these:

| Question | If NO | If YES |
|----------|-------|--------|
| Used 3+ times? | Don't extract | Consider extraction |
| Reduces complexity? | Don't extract | Extract |
| Has clear name? | Don't extract | Extract |
| Hides implementation detail? | Keep inline | Extract |
| Will change independently? | Keep together | Separate |

**Rule of Three**: Don't abstract until third occurrence.

---

## Core Principles

### YAGNI - You Aren't Gonna Need It

| DO | DON'T |
|-------|---------|
| Implement the requested feature | Add "configurable" options |
| Solve the specific problem | Design for hypothetical futures |
| Write minimal working code | Build "extensible" frameworks |

### Delete, Don't Comment

| DO | DON'T |
|-------|---------|
| `git rm unused-file.ts` | `// TODO: remove later` |
| Remove unused imports | `_unusedVariable` renaming |
| Delete dead branches | `// OLD: previous impl` |

---

## Naming Conventions

| Principle | Rule | Example |
|-----------|------|---------|
| What it does | Name describes behavior | `validateEmail` not `check` |
| Why it exists | Purpose is clear | `retryWithBackoff` not `retry2` |
| How much | Quantifiers when relevant | `maxRetries` not `retries` |

**Prohibited Patterns:**

| Pattern | Status | Instead |
|---------|--------|---------|
| Single letter vars (except loops) | FORBIDDEN | Descriptive name |
| Abbreviations | FORBIDDEN | Full words |
| Type in name | FORBIDDEN | `user` not `userObj` |
| Negative booleans | FORBIDDEN | `isEnabled` not `isNotDisabled` |

---

## File Organization

| Threshold | Action |
|-----------|--------|
| File > 300 lines | Consider splitting |
| File > 450 lines | Plan to split |
| File > 600 lines | MUST split |
| Function > 60 lines | MUST extract |

**Split Criteria:**
- Separate by feature/domain
- Separate by layer (data, logic, presentation)
- Separate by change frequency

---

## Contrastive Exemplars

### Feature Scope

CORRECT:
```typescript
// User asked: "Add loading state"
function Button({ loading, children }) {
  return (
    <button disabled={loading}>
      {loading ? 'Loading...' : children}
    </button>
  );
}
```

FAIL:
```typescript
// OVER-ENGINEERED: Added size, variant, icon nobody asked for
function Button({ loading, size, variant, icon, ... }) {
  // 50 lines of configuration
}
```

### Abstraction Timing

CORRECT:
```typescript
// First occurrence - just write it
const date1 = new Date(item1.createdAt).toLocaleDateString();

// Second occurrence - still fine
const date2 = new Date(item2.createdAt).toLocaleDateString();

// Third occurrence - NOW extract
const formatDate = (ts: number) => new Date(ts).toLocaleDateString();
```

---

## Anti-Patterns

| Pattern | Status | Instead |
|---------|--------|---------|
| Speculative features | FORBIDDEN | Build what's requested |
| Commented-out code | FORBIDDEN | Delete (git has history) |
| `_unusedVar` naming | FORBIDDEN | Remove the variable |
| Premature abstraction | FORBIDDEN | Wait for 3rd occurrence |
| Wrapper with no logic | FORBIDDEN | Call directly |
| Functions >60 lines | FORBIDDEN | Extract helper |
| Files >600 lines | FORBIDDEN | Split file |
| >4 function params | FORBIDDEN | Use options object |
