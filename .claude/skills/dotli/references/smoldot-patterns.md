# Smoldot Light Client Patterns

Reference implementation from the dot.li universal viewer. Use these patterns when building client-side Polkadot apps that need trustless chain access.

> **How LocalDOT actually connects (not this):** LocalDOT does **not** use bundled
> Smoldot light-client chain specs. It connects to the Paseo Next v2 chains over
> **WSS via PAPI descriptors** generated under `apps/web/.papi/descriptors/`
> (`paseohubnext`, `bulletinnext`, `peoplenext`), using `getWsProvider` from
> `polkadot-api/ws`. See [`apps/web/src/lib/host/assethub-provider.ts`](../../../../apps/web/src/lib/host/assethub-provider.ts)
> and [`apps/web/src/lib/statement-store.ts`](../../../../apps/web/src/lib/statement-store.ts).
> The Paseo Next v2 chains are not bundled as well-known light-client specs in
> `polkadot-api`, so the Smoldot patterns below are **upstream dot.li reference
> only**, not how this app reaches the chain.

---

## Dependencies

```json
{
  "dependencies": {
    "polkadot-api": "^1.23.3",
    "@ensdomains/content-hash": "^3.1.0",
    "viem": "^2.46.3"
  }
}
```

> **LocalDOT note:** these are dot.li's deps. LocalDOT is on `polkadot-api@^2.1.5`,
> where `Binary` is a function namespace (`Binary.fromHex` / `Binary.toHex`), not a
> class. LocalDOT also uses `ethers` v6 (`new ethers.Interface(abi)`) purely to
> ABI-encode/decode calldata — not `viem`, and never as a wallet or RPC transport.

**Key packages from polkadot-api:**
- `polkadot-api/smoldot/from-worker` - Worker initialization
- `polkadot-api/smoldot/worker?worker` - Web Worker (Vite syntax)
- `polkadot-api/chains/paseo` - Paseo relay chain spec
- `polkadot-api/chains/paseo_asset_hub` - Asset Hub chain spec
- `polkadot-api/sm-provider` - Smoldot provider for polkadot-api

---

## Initialization Pattern

```typescript
import { startFromWorker } from "polkadot-api/smoldot/from-worker";
import SmWorker from "polkadot-api/smoldot/worker?worker";
import { chainSpec as paseoChainSpec } from "polkadot-api/chains/paseo";
import { chainSpec as assetHubPaseoChainSpec } from "polkadot-api/chains/paseo_asset_hub";
import { getSmProvider } from "polkadot-api/sm-provider";
import { createClient, type PolkadotClient } from "polkadot-api";

let clientInstance: PolkadotClient | null = null;
let apiInstance: ReturnType<PolkadotClient["getUnsafeApi"]> | null = null;

/**
 * Initialize smoldot and connect to Asset Hub Paseo.
 * Returns when chain is synced and ready for queries.
 */
async function ensureClient(
  onStatus?: (status: string) => void,
): Promise<ReturnType<PolkadotClient["getUnsafeApi"]>> {
  // Singleton pattern - reuse existing client
  if (apiInstance) return apiInstance;

  // Step 1: Start smoldot in Web Worker
  onStatus?.("Starting light client...");
  const smoldot = startFromWorker(new SmWorker());

  // Step 2: Add relay chain (required for parachain validation)
  onStatus?.("Adding Paseo relay chain...");
  const relayChain = await smoldot.addChain({
    chainSpec: paseoChainSpec
  });

  // Step 3: Add parachain with relay chain reference
  onStatus?.("Adding Asset Hub Paseo...");
  const chain = smoldot.addChain({
    chainSpec: assetHubPaseoChainSpec,
    potentialRelayChains: [relayChain],
  });

  // Step 4: Create polkadot-api provider and client
  const provider = getSmProvider(chain);
  clientInstance = createClient(provider);

  // Step 5: Wait for chain sync (CRITICAL - don't skip)
  onStatus?.("Syncing with Asset Hub Paseo...");
  await clientInstance.getFinalizedBlock();

  // Step 6: Get API instance for queries
  apiInstance = clientInstance.getUnsafeApi();
  onStatus?.("Connected to Asset Hub Paseo");

  return apiInstance;
}
```

---

## Cleanup Pattern

```typescript
/**
 * Destroy the light client (cleanup on page unload).
 */
export function destroyClient(): void {
  clientInstance?.destroy();
  clientInstance = null;
  apiInstance = null;
}

// Usage: call on page unload
window.addEventListener("beforeunload", destroyClient);
```

---

## Revive EVM Contract Calls

For calling EVM contracts on Asset Hub via the Revive pallet:

```typescript
import { Binary } from "polkadot-api";
import { encodeFunctionData, decodeFunctionResult } from "viem";

// Configuration
const DRY_RUN_WEIGHT_LIMIT = {
  ref_time: 18446744073709551615n,   // Max u64
  proof_size: 18446744073709551615n, // Max u64
};
const DRY_RUN_STORAGE_LIMIT = 18446744073709551615n;
const DUMMY_ORIGIN = "5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY"; // Alice

/**
 * Call a Revive EVM contract (read-only dry-run).
 */
async function reviveCall(
  api: ReturnType<PolkadotClient["getUnsafeApi"]>,
  contractAddress: string,
  encodedData: `0x${string}`,
): Promise<`0x${string}`> {
  const result = await api.apis.ReviveApi.call(
    DUMMY_ORIGIN,
    Binary.fromHex(contractAddress as `0x${string}`),
    0n,                      // value (0 for read-only)
    DRY_RUN_WEIGHT_LIMIT,
    DRY_RUN_STORAGE_LIMIT,
    Binary.fromHex(encodedData),
  );

  // Unwrap the result
  const execResult = (result as any).result;
  const ok =
    execResult?.value ??
    (execResult?.isOk ? execResult : null) ??
    execResult?.ok ??
    null;

  if (!ok) {
    throw new Error("Revive call failed: no result");
  }

  // Check for revert
  const flags = BigInt(ok.flags?.toString?.() ?? ok.flags ?? 0);
  if ((flags & 1n) === 1n) {
    throw new Error("Contract execution reverted");
  }

  // Extract return data (handle multiple formats)
  const data = ok.data;
  if (typeof data === "string") return data as `0x${string}`;
  if (typeof data?.asHex === "function") return data.asHex() as `0x${string}`;
  if (typeof data?.toHex === "function") return data.toHex() as `0x${string}`;
  if (data instanceof Uint8Array) {
    return ("0x" +
      Array.from(data)
        .map((b: number) => b.toString(16).padStart(2, "0"))
        .join("")) as `0x${string}`;
  }
  return "0x";
}
```

---

## Complete Resolution Example

```typescript
import { namehash } from "viem";

const CONTRACTS = {
  DOTNS_REGISTRY: "0x4Da0d37aBe96C06ab19963F31ca2DC0412057a6f",
  DOTNS_CONTENT_RESOLVER: "0x7756DF72CBc7f062e7403cD59e45fBc78bed1cD7",
};

const REGISTRY_ABI = [
  {
    type: "function",
    name: "recordExists",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view",
  },
] as const;

const CONTENT_RESOLVER_ABI = [
  {
    type: "function",
    name: "contenthash",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "hash", type: "bytes" }],
    stateMutability: "view",
  },
] as const;

/**
 * Resolve a .dot name to an IPFS CID.
 */
async function resolveDotName(
  label: string,
  onStatus?: (status: string) => void,
): Promise<string | null> {
  const api = await ensureClient(onStatus);

  const domain = `${label}.dot`;
  const node = namehash(domain);

  // Check if domain exists
  onStatus?.(`Checking if "${domain}" exists...`);
  const existsCalldata = encodeFunctionData({
    abi: REGISTRY_ABI,
    functionName: "recordExists",
    args: [node as `0x${string}`],
  });

  const existsResult = await reviveCall(
    api,
    CONTRACTS.DOTNS_REGISTRY,
    existsCalldata,
  );

  const exists = decodeFunctionResult({
    abi: REGISTRY_ABI,
    functionName: "recordExists",
    data: existsResult,
  }) as boolean;

  if (!exists) {
    onStatus?.(`Domain "${domain}" not found`);
    return null;
  }

  // Get content hash
  onStatus?.(`Resolving content for "${domain}"...`);
  const contentCalldata = encodeFunctionData({
    abi: CONTENT_RESOLVER_ABI,
    functionName: "contenthash",
    args: [node as `0x${string}`],
  });

  const contentResult = await reviveCall(
    api,
    CONTRACTS.DOTNS_CONTENT_RESOLVER,
    contentCalldata,
  );

  const contenthashBytes = decodeFunctionResult({
    abi: CONTENT_RESOLVER_ABI,
    functionName: "contenthash",
    data: contentResult,
  }) as `0x${string}`;

  // Decode to CID (using @ensdomains/content-hash)
  const cid = decodeIpfsContenthash(contenthashBytes);
  onStatus?.(`Resolved "${domain}" -> ${cid}`);

  return cid;
}
```

---

## Chain Specs

Available chain specs from polkadot-api:

| Chain | Import Path |
|-------|-------------|
| Polkadot | `polkadot-api/chains/polkadot` |
| Polkadot Asset Hub | `polkadot-api/chains/polkadot_asset_hub` |
| Paseo | `polkadot-api/chains/paseo` |
| Paseo Asset Hub | `polkadot-api/chains/paseo_asset_hub` |
| Westend | `polkadot-api/chains/westend2` |

> **LocalDOT note:** the Paseo Next v2 chains LocalDOT targets (Asset Hub Next,
> Bulletin Next, People Next System) are **not** in this list — there are no bundled
> light-client specs for them. LocalDOT connects to them over WSS using generated
> PAPI descriptors instead (`paseohubnext` / `bulletinnext` / `peoplenext`).

---

## Performance Considerations

| Aspect | Recommendation |
|--------|----------------|
| First load | ~3s for initial sync (expected) |
| Subsequent queries | <100ms (chain already synced) |
| Memory | ~50-100MB for light client |
| Caching | Singleton pattern prevents re-init |
| Cleanup | Always call `destroyClient()` on unload |

---

## When NOT to Use Smoldot

| Scenario | Use Instead |
|----------|-------------|
| Triangle Product (Desktop/Web/Mobile) | Host provides chain access |
| Server-side application | Standard RPC endpoint |
| High-frequency queries | RPC with connection pooling |
| Need historical data | Archive node RPC |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Chain not syncing" | Check network connectivity, try different relay chain |
| "Revive call failed" | Verify contract address, check ABI matches |
| Memory leak | Ensure `destroyClient()` called on cleanup |
| Slow first load | Expected - light client needs to sync |
| Worker not loading | Check Vite config for worker support |
