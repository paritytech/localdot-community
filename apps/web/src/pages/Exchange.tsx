import { ArrowDownToLine, ArrowUpFromLine, HelpCircle, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";

import { useLocationContext } from "../context/LocationContext";
import { useOffersContext } from "../context/OffersContext";
import { useWalletContext } from "../context/WalletContext";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import { type ContractAgent, useP2PMarket } from "../hooks/useP2PMarket";
import { timeToMinutes } from "../lib/format";
import { filterIntegerInput } from "../lib/input-filters";
import { fetchJSONFromIPFS } from "../lib/ipfs";
import {
  type AgentMatchedOffer,
  getAgentRecommendations,
  getDirectRecommendations,
  getResultLabels,
} from "../lib/recommendations";

type FlowMode = null | "deposit" | "withdraw";
type TradeMode = "agent" | "direct";

const JS_DAY_MAP = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function getTodayKey(): string {
  return JS_DAY_MAP[new Date().getDay()] ?? "Mon";
}

interface AgentInfo {
  wallet: string;
  name: string;
  address: string;
  city: string;
  flatFee: number;
  lat: number;
  lon: number;
  rating: number;
  schedule: Record<string, { open: string; close: string }>;
}

export default function Exchange(): JSX.Element {
  const { nativeCurrency } = useWalletContext();
  const { offers } = useOffersContext();
  const { getAllAgents } = useP2PMarket();

  const inputRef = useRef<HTMLInputElement>(null);

  // Flow state — restore from URL params on back navigation, else from router state
  const [searchParams, setSearchParams] = useSearchParams();
  const routerLocation = useLocation();
  const initialMode =
    searchParams.get("mode") ??
    (routerLocation.state as { mode?: string } | null)?.mode;
  const [flowMode, setFlowMode] = useState<FlowMode>(
    initialMode === "deposit" || initialMode === "withdraw"
      ? initialMode
      : null,
  );
  const [tradeMode, setTradeMode] = useState<TradeMode>(
    (searchParams.get("via") as TradeMode) === "direct" ? "direct" : "agent",
  );
  const [amount, setAmount] = useState(searchParams.get("amount") ?? "");

  // Sync key state to URL so back-navigation restores it
  useEffect(() => {
    const params = new URLSearchParams();
    if (flowMode) params.set("mode", flowMode);
    if (tradeMode !== "agent") params.set("via", tradeMode);
    if (amount) params.set("amount", amount);
    setSearchParams(params, { replace: true });
  }, [flowMode, tradeMode, amount, setSearchParams]);

  // Location — from global context
  const { location: globalLocation } = useLocationContext();
  const location = globalLocation ? { ...globalLocation, radiusKm: 0 } : null;

  // When — always now until end of day
  const whenDay = getTodayKey();
  const now = new Date();
  const whenFrom = `${String(now.getHours()).padStart(2, "0")}:${now.getMinutes() < 30 ? "00" : "30"}`;
  const whenTo = "23:30";

  // Data
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [results, setResults] = useState<AgentMatchedOffer[]>([]);
  const [allMatched, setAllMatched] = useState<AgentMatchedOffer[]>([]);
  const [noResultsReason, setNoResultsReason] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [showAgentInfo, setShowAgentInfo] = useState(false);

  // Derive role from flow mode
  const role = flowMode === "deposit" ? "buyer" : "seller";

  // Location comes from global context — no auto-detect needed here
  const locationLoading = false;

  // Location comes from global context — auto-detected on app startup

  // Load + enrich agents. Kept silent so background refreshes don't disturb
  // the list; on failure we keep the last good agents.
  const loadAgents = useCallback(async () => {
    try {
      const contractAgents = await getAllAgents();
      const enriched = await Promise.all(
        contractAgents.map(async (a: ContractAgent) => {
          let city = "";
          let address = "";
          let lat = 0;
          let lon = 0;
          let schedule: Record<string, { open: string; close: string }> = {};
          try {
            const meta = await fetchJSONFromIPFS<{
              location?: {
                city?: string;
                address?: string;
                lat?: number;
                lng?: number;
              };
              workingHours?: {
                schedule?: Record<string, { open: string; close: string }>;
              };
            }>(a.metadataCID);
            city = meta.location?.city || "";
            address = meta.location?.address || "";
            lat = meta.location?.lat || 0;
            lon = meta.location?.lng || 0;
            if (meta.workingHours?.schedule) {
              schedule = meta.workingHours.schedule;
            }
          } catch {
            /* skip */
          }
          return {
            wallet: a.wallet,
            name: a.name,
            address,
            city,
            flatFee: Number(a.flatFee),
            lat,
            lon,
            rating: 4.0,
            schedule,
          };
        }),
      );
      setAgents(enriched);
    } catch {
      // background refresh — keep last good agents
    }
  }, [getAllAgents]);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  // Keep agents fresh without a manual reload.
  useAutoRefresh(loadAgents, { intervalMs: 60_000 });

  // Search
  const handleSearch = useCallback(() => {
    const amt = parseFloat(amount);
    if (!amt || !location || !flowMode) return;

    const userLocation = { lat: location.lat, lon: location.lon };

    // Filter agents by availability on selected day/time
    const availableAgents = agents.filter((a) => {
      const daySchedule = a.schedule[whenDay];
      if (!daySchedule) return false;
      const agentOpen = timeToMinutes(daySchedule.open);
      const agentClose = timeToMinutes(daySchedule.close);
      const userFrom = timeToMinutes(whenFrom);
      const userTo = timeToMinutes(whenTo);
      return Math.min(agentClose, userTo) > Math.max(agentOpen, userFrom);
    });

    if (tradeMode === "agent") {
      const rec = getAgentRecommendations({
        offers,
        agents: availableAgents,
        userRole: role,
        amount: amt,
        userLocation,
        userDay: whenDay,
        userTimeRange: { from: whenFrom, to: whenTo },
      });
      setResults(rec.results);
      setAllMatched(rec.allMatched);
      setNoResultsReason(rec.noResultsReason || null);
    } else {
      const rec = getDirectRecommendations({
        offers,
        userRole: role,
        amount: amt,
        userLocation,
        userDay: whenDay,
        userTimeRange: { from: whenFrom, to: whenTo },
      });
      setResults(rec.results);
      setAllMatched(rec.allMatched);
      setNoResultsReason(rec.noResultsReason || null);
    }
    setSearched(true);
  }, [
    amount,
    location,
    flowMode,
    tradeMode,
    role,
    offers,
    agents,
    whenDay,
    whenFrom,
    whenTo,
  ]);

  // Auto-search when inputs change
  useEffect(() => {
    if (location && amount && parseFloat(amount) > 0 && flowMode) {
      handleSearch();
    }
  }, [location, amount, tradeMode, whenDay, whenFrom, whenTo, handleSearch]);

  const isAgent = tradeMode === "agent";
  const labelsMap = getResultLabels(allMatched, results);

  // Handle mode selection — auto-detect location + focus input
  const handleModeSelect = (mode: FlowMode) => {
    setFlowMode(mode);
    setAmount("");
    setResults([]);
    setAllMatched([]);
    setSearched(false);
    if (mode) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  // ─── LANDING VIEW ────────────────────────────────────────
  if (!flowMode) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 md:py-20">
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-serif mb-3">Exchange</h1>
          <p className="text-stone-500 text-sm">
            Trade cash for digital dollars with people near you
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {/* Deposit Cash */}
          <button
            onClick={() => handleModeSelect("deposit")}
            className="group p-8 rounded-xl border border-stone-700 bg-stone-900/50 hover:border-green-500/30 hover:bg-stone-800/60 hover:shadow-lg hover:shadow-green-500/5 transition-all text-left"
          >
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-14 h-14 rounded-full bg-green-500/10 text-green-400 group-hover:bg-green-500/15 group-hover:scale-105 transition-all flex-shrink-0">
                <ArrowDownToLine className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-2xl font-serif text-stone-100 mb-1 group-hover:text-white transition-colors">
                  Deposit Cash
                </h2>
                <p className="text-stone-500 text-sm group-hover:text-stone-400 transition-colors">
                  Hand over cash, get digital dollars in your wallet
                </p>
              </div>
            </div>
          </button>

          {/* Withdraw Cash */}
          <button
            onClick={() => handleModeSelect("withdraw")}
            className="group p-8 rounded-xl border border-stone-700 bg-stone-900/50 hover:border-amber-500/30 hover:bg-stone-800/60 hover:shadow-lg hover:shadow-amber-500/5 transition-all text-left"
          >
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center w-14 h-14 rounded-full bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/15 group-hover:scale-105 transition-all flex-shrink-0">
                <ArrowUpFromLine className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-2xl font-serif text-stone-100 mb-1 group-hover:text-white transition-colors">
                  Withdraw Cash
                </h2>
                <p className="text-stone-500 text-sm group-hover:text-stone-400 transition-colors">
                  Send digital dollars, receive cash in hand
                </p>
              </div>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // ─── ACTIVE FLOW (Deposit or Withdraw) ───────────────────
  const isDeposit = flowMode === "deposit";
  const flowTitle = isDeposit ? "Deposit Cash" : "Withdraw Cash";
  const flowSubtitle = isDeposit
    ? "How much cash do you want to exchange?"
    : "How much cash do you need?";

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8 md:py-12">
      {/* Header — back button inline with title */}
      <div className="flex items-center justify-center gap-3 mb-2">
        <button
          onClick={() => setFlowMode(null)}
          className="text-stone-500 hover:text-stone-200 transition-colors p-1.5 rounded-lg hover:bg-stone-800"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <h2 className="text-3xl md:text-4xl font-serif">{flowTitle}</h2>
      </div>
      <p className="text-stone-500 text-sm text-center mb-8">{flowSubtitle}</p>

      {/* Amount Input — big and centered */}
      <div className="max-w-xs mx-auto mb-6">
        <div className="relative group">
          <input
            ref={inputRef}
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(filterIntegerInput(e.target.value))}
            placeholder="100"
            min="1"
            className="w-full rounded-xl border border-stone-700 bg-stone-900 py-5 px-6 pr-16 text-4xl font-serif text-stone-100 placeholder-stone-600 shadow-md transition-all focus:border-amber-500/50 focus:outline-none focus:shadow-lg focus:shadow-amber-500/5 hover:border-stone-600 text-center"
          />
          <span className="absolute right-5 top-1/2 -translate-y-1/2 text-lg text-stone-500 group-focus-within:text-amber-400 transition-colors">
            $
          </span>
        </div>
      </div>

      {/* Mode toggle — agent/direct */}
      <div className="flex rounded-lg bg-stone-800 p-1 max-w-sm mx-auto mb-2">
        <button
          type="button"
          onClick={() => setTradeMode("agent")}
          className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
            isAgent
              ? "bg-stone-100 text-stone-900"
              : "text-stone-400 hover:text-stone-300"
          }`}
        >
          Via exchange agent
        </button>
        <button
          type="button"
          onClick={() => setTradeMode("direct")}
          className={`flex-1 py-2 rounded-md text-sm font-medium transition-colors ${
            !isAgent
              ? "bg-stone-100 text-stone-900"
              : "text-stone-400 hover:text-stone-300"
          }`}
        >
          Direct trade
        </button>
      </div>

      <div className="text-center mb-6">
        <p className="text-[11px] text-stone-600">
          {isAgent
            ? "Meet at a verified location, an agent counts the cash and confirms the trade."
            : "Meet the provider directly at a location you both agree on."}
        </p>
        {isAgent && (
          <button
            type="button"
            onClick={() => setShowAgentInfo(true)}
            className="inline-flex items-center gap-1 text-[11px] text-amber-400/70 hover:text-amber-400 transition-colors mt-1"
          >
            <HelpCircle className="w-3 h-3" />
            Why use an agent?
          </button>
        )}
      </div>

      {/* Why use an agent modal */}
      {showAgentInfo && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 px-4">
          <div className="bg-stone-900 border border-stone-700 rounded-xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-stone-100">Why use an agent?</h3>
              <button
                onClick={() => setShowAgentInfo(false)}
                className="text-stone-500 hover:text-stone-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              {[
                {
                  n: "1",
                  title: "Safety",
                  desc: "Agents verify both parties before exchanging cash and crypto",
                },
                {
                  n: "2",
                  title: "Trust",
                  desc: "They're vetted facilitators with reputation scores",
                },
                {
                  n: "3",
                  title: "Convenience",
                  desc: "Meet at their known venue location instead of coordinating",
                },
                {
                  n: "4",
                  title: "Protection",
                  desc: "Agents help resolve disputes if something goes wrong",
                },
                {
                  n: "5",
                  title: "Peace of mind",
                  desc: "Especially valuable for first trades or larger amounts",
                },
              ].map((item) => (
                <div key={item.n} className="flex gap-3">
                  <span className="text-amber-400 font-medium text-sm w-4 flex-shrink-0">
                    {item.n}
                  </span>
                  <div>
                    <span className="text-sm font-medium text-stone-200">
                      {item.title}
                    </span>
                    <span className="text-sm text-stone-400">
                      {" "}
                      - {item.desc}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-stone-500 mt-4">
              Agent fees are typically $3–5 per trade.
            </p>
          </div>
        </div>
      )}

      {/* Results */}
      {searched && results.length === 0 && (
        <div className="text-center py-10">
          <p className="text-stone-400 mb-1">No offers found</p>
          <p className="text-stone-500 text-sm">
            {noResultsReason || "Try a different amount, time, or location."}
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {results.map((match, i) => {
            const offerLabels = labelsMap.get(match.offer.id);
            const label = offerLabels ? offerLabels.join(" · ") : "Good match";
            const distLabel =
              match.distance < 1
                ? `${Math.round(match.distance * 1000)}m`
                : `${match.distance.toFixed(1)}km`;
            const locationName =
              isAgent && match.agent.wallet
                ? match.agent.city || "Unknown"
                : match.offer.city || "Unknown";

            // Compute "Open until" from agent schedule or offer hours
            let activeUntil: string | null = null;
            if (isAgent && match.agent.wallet) {
              const agentData = agents.find(
                (a) =>
                  a.wallet.toLowerCase() === match.agent.wallet.toLowerCase(),
              );
              const daySchedule = agentData?.schedule[whenDay];
              if (daySchedule?.close) activeUntil = daySchedule.close;
            } else if (match.offer.availability?.hours) {
              const parts = match.offer.availability.hours.split(/[–\-]/);
              if (parts[1]) activeUntil = parts[1].trim();
            }

            // Build link with pre-fill params for request trade modal
            const tradeParams = new URLSearchParams();
            tradeParams.set("trade", "1");
            if (isAgent && match.agent.wallet) {
              tradeParams.set("agent", match.agent.wallet);
              if (match.agent.name)
                tradeParams.set("agentName", match.agent.name);
            }
            if (amount) tradeParams.set("amount", amount);

            return (
              <Link
                key={`${match.offer.id}-${i}`}
                to={`/offer/${match.offer.id}?${tradeParams.toString()}`}
                className="block group"
              >
                <div className="rounded-xl border border-stone-700 bg-stone-900/50 p-5 relative hover:border-stone-500 hover:bg-stone-800/40 hover:shadow-lg hover:shadow-stone-900/50 transition-all h-full flex flex-col">
                  {/* Label badge */}
                  {label && (
                    <div className="absolute -top-2.5 left-4 px-2.5 py-0.5 rounded-full bg-amber-500 text-[10px] font-bold text-white whitespace-nowrap">
                      {label}
                    </div>
                  )}

                  {/* Top: fee + distance + location */}
                  <div className="flex items-start justify-between mt-1 mb-3">
                    <div>
                      <span className="mono text-3xl font-medium text-stone-100 group-hover:text-white transition-colors">
                        ${match.totalFee}
                      </span>
                      <span className="text-[11px] text-stone-500 ml-1">
                        fee
                      </span>
                    </div>
                    <div className="text-right flex-shrink-0 ml-3">
                      <span className="text-amber-400 font-medium text-sm">
                        {distLabel}
                      </span>
                      <p className="text-xs text-stone-500 mt-0.5 max-w-[120px] truncate">
                        {locationName}
                      </p>
                    </div>
                  </div>

                  {/* Open until */}
                  {activeUntil && (
                    <div className="flex items-center gap-1.5 mb-3">
                      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse flex-shrink-0" />
                      <span className="text-xs text-green-400/80">
                        Open until {activeUntil}
                      </span>
                    </div>
                  )}

                  {/* Divider */}
                  <div className="border-t border-stone-800 mb-3" />

                  {/* Detail rows */}
                  <div className="space-y-2 flex-1 text-[13px]">
                    {isAgent && match.agent.wallet && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-stone-500">Agent</span>
                        <span className="text-stone-200 font-medium truncate">
                          {match.agent.name}
                        </span>
                      </div>
                    )}

                    {isAgent && match.agent.wallet && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-stone-500">Agent fee</span>
                        <span className="text-stone-300">
                          ${match.agent.flatFee}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-stone-500">Provider fee</span>
                      <span className="text-stone-300">
                        {match.offer.fee || "Free"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <span className="text-stone-500">Range</span>
                      <span className="text-stone-300 mono">
                        {match.offer.minAmount}–{match.offer.maxAmount}{" "}
                        {nativeCurrency.symbol}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {!searched && !location && !locationLoading && (
        <div className="text-center py-8">
          <p className="text-stone-500 text-sm">
            Tap the location pill above to set your location
          </p>
        </div>
      )}

      {!searched && locationLoading && (
        <div className="text-center py-8">
          <p className="text-stone-500 text-sm">Detecting your location...</p>
        </div>
      )}

      {!searched && location && !amount && (
        <div className="text-center py-8">
          <p className="text-stone-500 text-sm">
            Enter an amount to find offers near you
          </p>
        </div>
      )}

      {/* Explore link */}
      {searched && (
        <div className="text-center mt-6">
          <Link
            to="/explore"
            className="text-xs text-stone-500 hover:text-stone-300 transition-colors"
          >
            Want to browse manually? Go to Explore
          </Link>
        </div>
      )}
    </div>
  );
}
