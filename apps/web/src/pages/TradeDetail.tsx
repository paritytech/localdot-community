/**
 * TradeDetail — route page for a single active trade.
 *
 * Entered via navigate('/trades/:id', { state: { trade } }) from the
 * active-trades list, which avoids a chain round-trip. On a page reload or a
 * direct deep link, React Router state is gone, so we fall back to fetching
 * the ContractTrade from chain by its id.
 *
 * Dispatches to:
 *   - DirectTradeDetail when trade.agent is the zero address
 *   - AgentTradeDetail otherwise — role determined by comparing the
 *     viewer's EVM-derived address against trade.locker / counterparty / agent
 */

import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { Spinner } from "../components/common/Spinner";
import { AgentTradeDetail } from "../components/trade/AgentTradeDetail";
import { DirectTradeDetail } from "../components/trade/DirectTradeDetail";
import { useWalletContext } from "../context/WalletContext";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import type { ContractTrade } from "../hooks/useEscrow";
import { useEscrow } from "../hooks/useEscrow";
import { ss58ToEvmAddress } from "../lib/address";
import { ZERO_ADDRESS } from "../lib/format";

export default function TradeDetail(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const {
    address: ss58,
    evmDecimals,
    nativeCurrency,
    isDetecting,
  } = useWalletContext();
  const { getTrade } = useEscrow();

  const stateTrade = (location.state as { trade?: ContractTrade } | null)
    ?.trade;

  const [trade, setTrade] = useState<ContractTrade | null>(stateTrade ?? null);
  const [loading, setLoading] = useState(!stateTrade);
  const [error, setError] = useState<"not-found" | "load-failed" | null>(null);

  // Reset scroll when entering a trade — without this the page inherits
  // whatever scroll offset the user had on the previous page.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [id]);

  // Deep-link / reload support: navigation state is dropped on a full page
  // reload, so when it's missing we read the trade straight off chain by id.
  useEffect(() => {
    if (stateTrade) {
      setTrade(stateTrade);
      setLoading(false);
      setError(null);
      return;
    }
    if (!id) {
      setError("not-found");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const fetched = await getTrade(BigInt(id));
        if (cancelled) return;
        // A non-existent trade decodes to a zero struct.
        const empty =
          fetched.locker.toLowerCase() === ZERO_ADDRESS &&
          fetched.counterparty.toLowerCase() === ZERO_ADDRESS;
        if (empty) {
          setError("not-found");
        } else {
          setTrade(fetched);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("[TradeDetail] failed to load trade:", err);
          setError("load-failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, stateTrade, getTrade]);

  // Silent re-read of the on-chain trade so its state (LOCKED → RELEASED /
  // REFUNDED / COMPLETED) updates live while the user watches the page,
  // without a manual reload and without flashing the spinner.
  const refreshTrade = useCallback(async () => {
    if (!id) return;
    try {
      const fetched = await getTrade(BigInt(id));
      const empty =
        fetched.locker.toLowerCase() === ZERO_ADDRESS &&
        fetched.counterparty.toLowerCase() === ZERO_ADDRESS;
      if (!empty) {
        setTrade(fetched);
        setError(null);
      }
    } catch {
      // background refresh — keep last good snapshot
    }
  }, [id, getTrade]);

  useAutoRefresh(refreshTrade, { intervalMs: 15_000, enabled: !!id });

  const myEvm = ss58 ? ss58ToEvmAddress(ss58) : null;

  // Show a spinner while fetching the trade, or while the wallet is still
  // reconnecting after a reload — role detection needs the connected address.
  if (loading || (trade && !myEvm && isDetecting)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !trade) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <p className="text-stone-300 text-base font-medium mb-2">
          {error === "not-found" ? "Trade not found" : "Couldn't load trade"}
        </p>
        <p className="text-stone-500 text-sm mb-6 max-w-sm">
          {error === "not-found"
            ? `There's no trade #${id ?? ""} on chain.`
            : "Something went wrong reading this trade. Try again from your active trades."}
        </p>
        <button
          onClick={() => navigate("/profile")}
          className="px-5 py-2.5 rounded-xl bg-stone-100 text-stone-900 text-sm font-medium hover:bg-white transition-colors"
        >
          Go to profile
        </button>
      </div>
    );
  }

  const hasAgent = trade.agent.toLowerCase() !== ZERO_ADDRESS;
  const me = myEvm?.toLowerCase() ?? "";
  const isLocker = trade.locker.toLowerCase() === me;
  const isCounterparty = trade.counterparty.toLowerCase() === me;
  const isAgent = trade.agent.toLowerCase() === me;

  return (
    <div className="min-h-screen bg-stone-950">
      {/* Page header */}
      <div className="sticky top-0 z-10 bg-stone-950/95 backdrop-blur border-b border-stone-800">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 text-stone-400 hover:text-stone-200"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-base font-medium text-stone-100 leading-none">
              Trade #{id}
            </h1>
            <p className="text-[11px] text-stone-500 mt-1">
              {hasAgent ? "Via agent" : "Direct"} ·{" "}
              {isLocker
                ? "Selling"
                : isCounterparty
                  ? "Buying"
                  : isAgent
                    ? "Mediating"
                    : "Read-only"}
            </p>
          </div>
        </div>
      </div>

      {hasAgent ? (
        <AgentTradeDetail
          trade={trade}
          role={isAgent ? "agent" : isLocker ? "provider" : "buyer"}
          decimals={evmDecimals}
          symbol={nativeCurrency.symbol}
        />
      ) : (
        <DirectTradeDetail
          trade={trade}
          role={isLocker ? "provider" : "buyer"}
          decimals={evmDecimals}
          symbol={nativeCurrency.symbol}
        />
      )}
    </div>
  );
}
