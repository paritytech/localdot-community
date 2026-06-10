/**
 * Wallet Context
 *
 * App runs inside the Polkadot Triangle iframe. We use the host's product-
 * account flow (`accounts.getProductAccount(getProductIdentifier(), 0)`),
 * which is the only signing path Polkadot Desktop currently wires up
 * end-to-end. The derived address is stable per product identifier — the bare
 * dotNS domain (VITE_DOTNS_ID) in prod, `localhost:PORT` in dev. See
 * lib/host/product-identifier.ts for why we don't use window.location.host.
 */
import { accounts } from "@novasamatech/host-api-wrapper";
import type { PolkadotSigner } from "polkadot-api/signer";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { env } from "../env";
import { ss58ToEvmAddress } from "../lib/address";
import { getNativeCurrency } from "../lib/constants";
import { waitForNativeToEvmRatio } from "../lib/host/assethub-provider";
import { getHostAccount } from "../lib/host/signer";
import {
  startMessageSubscriber,
  stopMessageSubscriber,
} from "../lib/message-store";

export interface WalletContextValue {
  address: string | null;
  /** Display name from the host wallet account (e.g. "Alice"). Null when not connected. */
  accountName: string | null;
  chainId: number | null;
  isConnected: boolean;
  provider: null;
  signer: null;
  nativeCurrency: ReturnType<typeof getNativeCurrency>;
  /** EVM decimals derived from on-chain NativeToEthRatio (defaults to 18). */
  evmDecimals: number;
  signMessage: (message: string) => Promise<string>;
  connect: () => void;
  isDetecting: boolean;
}

const WalletContext = createContext<WalletContextValue | null>(null);

// Substrate signer cache (used by useP2PMarket for Revive.call)
let _cachedPolkadotSigner: PolkadotSigner | null = null;
let _cachedSubstrateAddress: string | null = null;

/** Get cached Substrate signer for Revive.call */
export function getSignerAndAddress(): {
  signer: PolkadotSigner;
  address: string;
} | null {
  if (_cachedPolkadotSigner && _cachedSubstrateAddress) {
    return { signer: _cachedPolkadotSigner, address: _cachedSubstrateAddress };
  }
  return null;
}

function waitForHostConnection(): Promise<boolean> {
  // Host registers its handlers inside a React effect; our iframe's main.tsx
  // may run first. Poll the connection-status subscription until we see
  // "connected" or run out of attempts.
  return new Promise<boolean>((resolve) => {
    let resolved = false;
    const finish = (ok: boolean) => {
      if (resolved) return;
      resolved = true;
      try {
        sub.unsubscribe();
      } catch {
        /* no-op */
      }
      resolve(ok);
    };

    const sub = accounts.subscribeAccountConnectionStatus((status) => {
      if (status === "connected") finish(true);
    });

    // Cap the wait so a missing host doesn't hang detection forever.
    setTimeout(() => finish(false), 5_000);
  });
}

async function tryHostAutoConnect(): Promise<{
  address: string;
  name: string;
  polkadotSigner: PolkadotSigner;
} | null> {
  const connected = await waitForHostConnection();
  if (!connected) return null;

  try {
    return await getHostAccount();
  } catch (e) {
    console.warn("[wallet] auto-connect failed:", e);
    return null;
  }
}

export function WalletProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const [account, setAccount] = useState<{
    address: string;
    name: string;
    polkadotSigner: PolkadotSigner;
  } | null>(null);
  const [isDetecting, setIsDetecting] = useState(true);
  const nativeCurrency = useMemo(
    () => getNativeCurrency(env.VITE_CHAIN_ID),
    [],
  );

  // EVM decimals derived from on-chain NativeToEthRatio (default 18 until loaded)
  const [evmDecimals, setEvmDecimals] = useState(18);

  useEffect(() => {
    let cancelled = false;
    void waitForNativeToEvmRatio().then((ratio) => {
      if (cancelled) return;
      const decimals =
        nativeCurrency.decimals + Math.round(Math.log10(Number(ratio)));
      setEvmDecimals(decimals);
    });
    return () => {
      cancelled = true;
    };
  }, [nativeCurrency.decimals]);

  // Once the wallet has an SS58 address, open a single Statement Store
  // subscription on the corresponding EVM-derived inbox topic. The
  // subscriber writes everything it sees into the local Dexie store; UI
  // hooks (useTradeRequests, useDirectTradeChannel) subscribe to the DB.
  // The subscriber also publishes ack receipts itself — the host signs all
  // submissions, so no wallet signer needs to be threaded through here.
  useEffect(() => {
    if (!account?.address) {
      stopMessageSubscriber();
      return;
    }
    let evm: string;
    try {
      evm = ss58ToEvmAddress(account.address).toLowerCase();
    } catch (err) {
      console.warn(
        "[WalletContext] cannot derive EVM addr for subscriber:",
        err,
      );
      return;
    }

    startMessageSubscriber(evm);
  }, [account?.address]);

  const connect = useCallback(() => {
    void tryHostAutoConnect().then((acc) => {
      if (acc) {
        setAccount(acc);
        _cachedPolkadotSigner = acc.polkadotSigner;
        _cachedSubstrateAddress = acc.address;
      }
    });
  }, []);

  // On mount: auto-connect Spektr (host permissions are fired earlier
  // in main.tsx, before any UI mounts).
  useEffect(() => {
    void tryHostAutoConnect().then((acc) => {
      if (acc) {
        setAccount(acc);
        _cachedPolkadotSigner = acc.polkadotSigner;
        _cachedSubstrateAddress = acc.address;
      }
      setIsDetecting(false);
    });
  }, []);

  const value = useMemo<WalletContextValue>(() => {
    return {
      address: account?.address ?? null,
      accountName: account?.name ?? null,
      chainId: env.VITE_CHAIN_ID,
      isConnected: account !== null,
      provider: null,
      signer: null,
      nativeCurrency,
      evmDecimals,
      signMessage: () => Promise.reject(new Error("Not supported")),
      connect,
      isDetecting,
    };
  }, [account, nativeCurrency, evmDecimals, connect, isDetecting]);

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWalletContext(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context)
    throw new Error("useWalletContext must be used within WalletProvider");
  return context;
}
