/**
 * Host bootstrap — RFC-0010 allowance grants + RFC-0002 JIT permissions.
 *
 * Single memoized entrypoint (`ensureBootstrap`) that:
 *   1. `hostApi.requestResourceAllocation([BulletinAllowance, StatementStoreAllowance])`
 *      — grants on-chain write quota for Bulletin (preimage submits) and
 *      Statement Store (chat / trade requests). Per-outcome tags: `Allocated`
 *      (granted), `NotAvailable` (host doesn't support this resource type),
 *      `Rejected` (user declined — the only fatal one). NOT idempotent: each
 *      call re-shows the host modal and may consume an additional quota slot,
 *      so we gate it behind the "ask once" check below rather than re-firing
 *      it on every reload.
 *   2. `requestPermission(StatementSubmit)` — separate JIT host-side gate,
 *      required before `statementStoreSubmit` will accept the call. Without
 *      it the host returns a permission error even if the on-chain allowance
 *      is granted.
 *   2b. `requestPermission(PreimageSubmit)` — the sibling JIT gate for Bulletin
 *      blob writes (`preimageManager.submit`). Pre-resolved here (best-effort)
 *      so it's batched into onboarding instead of prompting mid-flow on the
 *      first upload, e.g. when publishing an offer. Unlike StatementSubmit a
 *      denial is non-fatal — blob upload degrades to a just-in-time prompt.
 *
 * Runs once per session (memoized). Across reloads / new devices the heavy
 * allowance modal is suppressed by a two-layer "ask once, remember forever"
 * gate keyed by the *product account* (mirrors w3s-conference-app PR #151):
 *   1. Fast path — a per-account localStorage flag set the moment a grant
 *      succeeds. Bridges the ~40s on-chain finality lag after a fresh claim.
 *   2. Authoritative fallback — when the flag is absent (cleared storage, new
 *      device, new session) we read the product account's PGAS asset balance
 *      on Asset Hub Next; a positive balance proves the on-chain allowance is
 *      already active, so we skip the modal and re-cache the flag.
 * The modal is therefore surfaced at most once per account, ever. Only the
 * cheap StatementSubmit permission is re-requested every session as a liveness
 * probe. If any step throws, the session memo clears so the next call retries;
 * a denied permission drops the fast-path flag so the next run re-validates
 * against the chain (a lapsed JIT permission does NOT imply a lapsed on-chain
 * allowance, so the chain check still gates any re-request).
 *
 * The `SmartContractAllowance` is requested for derivation index 0 (carried as
 * its value). In the current hosts this grants host-side *auto-signing* of
 * `Revive.call` writes (createOffer, escrow, …) — they are signed without a
 * per-call modal. It does NOT sponsor gas: on-chain PGAS gas-sponsorship via
 * the `AsPgas` signed extension is not wired anywhere (product, SDK, or host),
 * so contract writes still pay gas from the product-derived account, which must
 * hold native balance (fund it via faucet on testnet).
 *
 * Future PGAS gas-sponsorship would require populating the `AsPgas` signed
 * extension on each `Revive.call` — via PAPI `customSignedExtensions` on the
 * Asset Hub Next client — with the PGAS designation for this derivation index.
 * Confirm the extension's value shape against the chain's runtime metadata
 * before wiring, since a wrong value breaks signing.
 */

import { enumValue } from "@novasamatech/host-api";
import { hostApi, requestPermission } from "@novasamatech/host-api-wrapper";

import { assetHubProvider } from "./assethub-provider";
import { getHostAddress } from "./signer";

export type BootstrapStep =
  | "requesting-allowance"
  | "allowance-ok"
  | "requesting-permission"
  | "permission-ok"
  | "error";

export interface BootstrapOpts {
  /** Step-by-step progress callback so the UI can surface what's happening. */
  onProgress?: (step: BootstrapStep, detail?: string) => void;
}

/** Derivation index of the product account (mirrors host/signer.ts). */
const DERIVATION_INDEX = 0;

/**
 * PGAS asset id on Asset Hub Next. The `SmartContractAllowance` granted at
 * bootstrap funds this asset on the product account; a positive balance is the
 * authoritative signal that the on-chain allowance is active. (Mirrors
 * w3s-conference-app's `checkAllowancesOnChain`.)
 */
const PGAS_ASSET_ID = 2_000_000_000;

let bootstrapPromise: Promise<void> | null = null;

/**
 * Per-*account* localStorage flag: records that the RFC-0010 allowance grant
 * already succeeded for this product account. On reload the JS memo
 * (`bootstrapPromise`) is gone, so without this flag `doBootstrap` would
 * re-call `requestResourceAllocation` and the host re-shows its allowance
 * modal — the "constantly asked to give allowance" complaint. The flag is the
 * fast path; `pgasAllowanceGranted` is the authoritative fallback when the
 * flag is absent (cleared storage, new device, new session). Keyed by the
 * product-account SS58 (not the origin) so a different account on the same
 * origin re-validates independently.
 */
const MARKER_PREFIX = "localdot:bootstrap:";

function markerKey(account: string): string {
  return `${MARKER_PREFIX}v2:${account}`;
}

function allowanceFlagSet(account: string): boolean {
  try {
    return localStorage.getItem(markerKey(account)) === "1";
  } catch {
    return false;
  }
}

function setAllowanceFlag(account: string): void {
  try {
    localStorage.setItem(markerKey(account), "1");
  } catch {
    /* storage unavailable — fall back to per-session memo only */
  }
}

function clearAllowanceFlag(account: string): void {
  try {
    localStorage.removeItem(markerKey(account));
  } catch {
    /* ignore */
  }
}

/**
 * Authoritative "already granted?" check: read the product account's PGAS
 * asset balance on Asset Hub Next. A positive balance means the
 * `SmartContractAllowance` has been activated on-chain, so the heavy allowance
 * modal can be skipped even with no localStorage flag. Never throws — a chain
 * read error degrades to `false` (we fall through to the request path, which
 * itself tolerates an unresponsive host), so a transient RPC blip can never
 * block bootstrap.
 */
async function pgasAllowanceGranted(account: string): Promise<boolean> {
  try {
    const { api } = await assetHubProvider.get();
    const acc = await api.query.Assets.Account.getValue(PGAS_ASSET_ID, account);
    return (acc?.balance ?? 0n) > 0n;
  } catch {
    return false;
  }
}

/**
 * Run the bootstrap exactly once per session. Returns the cached Promise on
 * subsequent calls. Throws on `Rejected` outcome or permission denial; on
 * throw the cache clears so the user can retry from a fresh modal.
 */
export function ensureBootstrap(opts: BootstrapOpts = {}): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = doBootstrap(opts).catch((err) => {
      bootstrapPromise = null;
      throw err;
    });
  }
  return bootstrapPromise;
}

async function doBootstrap(opts: BootstrapOpts): Promise<void> {
  const progress = opts.onProgress ?? (() => {});

  // Resolve the product account up front — both the localStorage flag and the
  // on-chain PGAS check are keyed by it. If the host can't resolve it
  // (broken/legacy host) we proceed without the gate; the request path below
  // tolerates an unresponsive host and the per-session memo still suppresses
  // repeats within this session.
  let account: string | null = null;
  try {
    account = await getHostAddress();
  } catch {
    account = null;
  }

  // 1. RFC-0010 allowance — Bulletin + StatementStore + SmartContract +
  // AutoSigning in one combined modal. Order matters: outcomes come back
  // parallel to this array. Only the first two gate the statement-store flow
  // and are fatal on Rejected; SmartContractAllowance + AutoSigning are
  // orthogonal — together they grant host-side auto-signing of Revive.call
  // writes (createOffer, escrow, …) so each trade action signs without a
  // per-call modal (they do NOT sponsor gas; see header). The host-playground
  // requests AutoSigning as a distinct resource; we mirror that. Declining or
  // NotAvailable on those two just means contract writes fall back to a
  // per-call signing prompt and must NOT break statement send/receive.
  const REQUESTED = [
    enumValue("BulletinAllowance", undefined),
    enumValue("StatementStoreAllowance", undefined),
    enumValue("SmartContractAllowance", DERIVATION_INDEX),
    enumValue("AutoSigning", undefined),
  ] as const;
  const FATAL_ALLOWANCE_COUNT = 2; // Bulletin + StatementStore only.

  // Ask-once gate: skip the heavy allowance modal when we've already recorded
  // a grant for this account (fast path) OR the chain confirms PGAS is funded
  // (authoritative fallback for new devices / cleared storage). Only when
  // neither says "granted" do we surface the modal — so it appears at most
  // once per account, ever. The chain read only runs when the flag is absent,
  // keeping the warm path (reload with flag set) free of an RPC round-trip.
  let alreadyGranted = false;
  if (account) {
    if (allowanceFlagSet(account)) {
      alreadyGranted = true;
    } else if (await pgasAllowanceGranted(account)) {
      alreadyGranted = true;
      setAllowanceFlag(account); // cache the chain truth for the next reload
    }
  }

  if (alreadyGranted) {
    progress("allowance-ok", "skipped (already granted for this account)");
  } else {
    progress("requesting-allowance");
    try {
      const result = await hostApi.requestResourceAllocation(
        enumValue("v1", [...REQUESTED]),
      );
      let rejected = false;
      result.match(
        (response) => {
          if (response.tag !== "v1") return;
          const outcomes = response.value as { tag: string }[];
          for (let i = 0; i < FATAL_ALLOWANCE_COUNT; i++) {
            if (outcomes[i]?.tag === "Rejected") rejected = true;
          }
        },
        () => {
          // Transport / network error — tolerate and continue. A per-action
          // prompt path may still grant when the user hits the submit button.
        },
      );
      if (rejected) {
        const msg =
          "An allowance was rejected by the host. Open Polkadot Mobile and approve to retry.";
        progress("error", msg);
        throw new Error(msg);
      }
      progress("allowance-ok");
    } catch (err) {
      if (
        err instanceof Error &&
        err.message.startsWith("An allowance was rejected")
      )
        throw err;
      // Host doesn't expose `requestResourceAllocation` (legacy host,
      // standalone mode). Not fatal — degrade to per-action prompts.
      progress("allowance-ok", "skipped (host did not respond)");
    }
  }

  // 2. RFC-0002 JIT permission. Separate gate from the on-chain allowance;
  // the host enforces this before forwarding the submit to its chain client.
  progress("requesting-permission", "StatementSubmit");
  const granted = await requestPermission({
    tag: "StatementSubmit",
    value: undefined,
  }).match(
    (g) => g === true,
    () => false,
  );
  if (!granted) {
    // Drop the fast-path flag so the next run re-validates against the chain.
    // A lapsed JIT permission does NOT imply a lapsed on-chain allowance, so
    // the chain check still gates any allowance re-request — this demotes us
    // from "trust the flag" to "re-check the chain", never to "blindly re-ask".
    if (account) clearAllowanceFlag(account);
    const msg = "StatementSubmit permission was denied.";
    progress("error", msg);
    throw new Error(msg);
  }
  progress("permission-ok");

  // 2b. RFC-0002 PreimageSubmit permission — gates Bulletin blob writes
  // (`preimageManager.submit`: offer metadata, recognition photos, trade
  // evidence; see lib/host/storage.ts). Pre-resolved here so the prompt is
  // batched into onboarding rather than surfacing mid-flow the first time a user
  // uploads — e.g. the two prompts seen when publishing an offer. The host
  // persists the decision permanently, so once granted it never re-prompts.
  //
  // Best-effort, NOT fatal: a denial only degrades blob upload (the host
  // re-prompts just-in-time at upload time), so unlike StatementSubmit it must
  // never block statement-store coordination. We don't touch the allowance flag
  // on denial for the same reason.
  progress("requesting-permission", "PreimageSubmit");
  await requestPermission({
    tag: "PreimageSubmit",
    value: undefined,
  }).match(
    () => undefined,
    () => undefined,
  );

  // Record success so future reloads hit the fast path (skip step 1). Set from
  // the host's synchronous outcome — we do NOT wait on ~40s chain finality.
  if (account) setAllowanceFlag(account);
}

/**
 * Reset the bootstrap cache. Use for sign-out flows and tests. Clears the
 * per-session memo and *all* persisted per-account allowance flags (incl. the
 * legacy v1 origin-keyed marker), so the next bootstrap re-validates from
 * scratch (chain check + modal if needed).
 */
export function resetBootstrap(): void {
  bootstrapPromise = null;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith(MARKER_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    /* storage unavailable */
  }
}
