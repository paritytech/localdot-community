import { formatUnits } from "ethers";
import {
  BadgeCheck,
  ChevronLeft,
  DollarSign,
  LayoutGrid,
  Map as MapIcon,
  MapPin,
  Repeat,
  Shield,
  Star,
  Zap,
} from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { VerifiedIcon } from "../components/zkpassport";
import { useLocationContext } from "../context/LocationContext";
import { useWalletContext } from "../context/WalletContext";
import { type ContractAgent, useP2PMarket } from "../hooks/useP2PMarket";
import { getAgentStatus } from "../lib/agent-hours";
import { calculateDistance } from "../lib/geo";
import { isZKPassportVerified } from "../lib/host";
import { fetchJSONFromIPFS } from "../lib/ipfs";

const MapView = lazy(() =>
  import("../components/offers/MapView").then((m) => {
    return { default: m.MapView };
  }),
);

interface AgentDisplay {
  wallet: string;
  name: string;
  address: string;
  city: string;
  country: string;
  flatFee: number;
  lat: number;
  lon: number;
  offerCount: number;
  workingDays: string;
  schedule: Record<string, { open: string; close: string }>;
  distance: number | null;
  stakedAmount: bigint;
  holdHours: number;
  extraHourFee: bigint;
  isVerified: boolean;
}

type SortOption = "fee" | "offers" | "distance" | "insurance";

export default function ScoutAgents(): JSX.Element {
  const { getAllAgents, getOffersByAgent } = useP2PMarket();
  const { nativeCurrency, evmDecimals } = useWalletContext();
  const { location: userLocation } = useLocationContext();

  const [agents, setAgents] = useState<AgentDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortOption>("fee");
  const [sortAsc, setSortAsc] = useState(true);

  const toggleSort = (field: SortOption) => {
    if (sortBy === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(field);
      // Default direction per field
      setSortAsc(field === "fee" || field === "distance");
    }
  };
  const [viewMode, setViewMode] = useState<"grid" | "map">("grid");
  const [verifiedOnly, setVerifiedOnly] = useState(false);

  useEffect(() => {
    void getAllAgents().then(async (contractAgents) => {
      const list = await Promise.all(
        contractAgents.map(async (a: ContractAgent) => {
          let city = "";
          let country = "";
          let address = "";
          let lat = 0;
          let lon = 0;
          let workingDays = "";
          let schedule: Record<string, { open: string; close: string }> = {};
          try {
            const meta = await fetchJSONFromIPFS<{
              location?: {
                city?: string;
                country?: string;
                address?: string;
                lat?: number;
                lng?: number;
              };
              workingHours?: {
                schedule?: Record<string, { open: string; close: string }>;
              };
            }>(a.metadataCID);
            city = meta.location?.city || "";
            country = meta.location?.country || "";
            address = meta.location?.address || "";
            lat = meta.location?.lat || 0;
            lon = meta.location?.lng || 0;
            if (meta.workingHours?.schedule) {
              schedule = meta.workingHours.schedule;
              workingDays = Object.keys(schedule).join(", ");
            }
          } catch {
            /* skip */
          }

          let offerCount = 0;
          try {
            const ids = await getOffersByAgent(a.wallet);
            offerCount = ids.length;
          } catch {
            /* skip */
          }

          let verified = false;
          try {
            verified = await isZKPassportVerified(a.wallet);
          } catch {
            /* skip */
          }

          return {
            wallet: a.wallet,
            name: a.name,
            address,
            city,
            country,
            flatFee: Number(a.flatFee),
            lat,
            lon,
            offerCount,
            workingDays,
            schedule,
            distance: null as number | null,
            stakedAmount: a.stakedAmount,
            holdHours: a.holdHours,
            extraHourFee: a.extraHourFee,
            isVerified: verified,
          };
        }),
      );
      setAgents(list);
      setLoading(false);
    });
  }, [getAllAgents, getOffersByAgent]);

  // Add distance when location available
  const agentsWithDistance = agents.map((a) => {
    return {
      ...a,
      distance:
        userLocation && a.lat && a.lon
          ? calculateDistance(userLocation.lat, userLocation.lon, a.lat, a.lon)
          : null,
    };
  });

  const filtered = agentsWithDistance
    .filter((a) => {
      if (verifiedOnly && !a.isVerified) return false;
      return true;
    })
    .sort((a, b) => {
      const dir = sortAsc ? 1 : -1;
      if (sortBy === "fee") return (a.flatFee - b.flatFee) * dir;
      if (sortBy === "offers") return (b.offerCount - a.offerCount) * dir;
      if (sortBy === "insurance")
        return Number(b.stakedAmount - a.stakedAmount) * dir;
      return ((a.distance ?? Infinity) - (b.distance ?? Infinity)) * dir;
    });

  const formatStake = (amount: bigint): string => {
    const formatted = formatUnits(amount, evmDecimals);
    const num = parseFloat(formatted);
    if (num === 0) return "0";
    if (num < 0.01) return "<0.01";
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 md:px-6 py-16 text-center">
        <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4" />
        <p className="text-stone-500 text-sm">Loading agents...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 md:py-12">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <Link
            to="/explore"
            className="flex items-center gap-1 text-stone-300 hover:text-stone-100 transition-colors text-sm font-medium"
          >
            <ChevronLeft className="w-4 h-4" />
            Explore
          </Link>
          <Link
            to="/exchange"
            className="flex items-center gap-1 text-stone-300 hover:text-stone-100 transition-colors text-sm font-medium"
          >
            <Zap className="w-3.5 h-3.5" />
            Quick Match
            <ChevronLeft className="w-4 h-4 rotate-180" />
          </Link>
        </div>
        <div className="text-center">
          <h2 className="mb-1">Explore Agents</h2>
          <p className="text-stone-500 text-sm">
            Compare exchange agents, fees and insurance
          </p>
        </div>
      </div>

      {/* Toolbar: view mode (left) + filters (right) */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center gap-1 bg-stone-800 p-1 rounded-lg">
            <button
              onClick={() => setViewMode("grid")}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                viewMode === "grid"
                  ? "bg-stone-700 text-stone-100"
                  : "text-stone-400 hover:text-stone-300"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode("map")}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                viewMode === "map"
                  ? "bg-stone-700 text-stone-100"
                  : "text-stone-400 hover:text-stone-300"
              }`}
            >
              <MapIcon className="w-3.5 h-3.5" />
            </button>
          </div>
          <span className="text-xs text-stone-500">
            {filtered.length} agent{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex items-center gap-1 bg-stone-800 p-1 rounded-lg">
          {[
            { key: "fee" as const, label: "Fee", Icon: DollarSign },
            { key: "insurance" as const, label: "Insurance", Icon: Shield },
            { key: "offers" as const, label: "Offers", Icon: Repeat },
            ...(userLocation
              ? [{ key: "distance" as const, label: "Near", Icon: MapPin }]
              : []),
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={() => toggleSort(opt.key)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-0.5 ${
                sortBy === opt.key
                  ? "bg-stone-700 text-stone-100"
                  : "text-stone-400 hover:text-stone-300"
              }`}
            >
              <opt.Icon className="w-3 h-3" />
              {opt.label}
              {sortBy === opt.key && (
                <svg
                  className={`w-3 h-3 transition-transform ${sortAsc ? "" : "rotate-180"}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 5v14M5 12l7-7 7 7" />
                </svg>
              )}
            </button>
          ))}
          <span className="w-px h-4 bg-stone-700" />
          <button
            onClick={() => setVerifiedOnly(!verifiedOnly)}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-0.5 ${
              verifiedOnly
                ? "bg-green-900/50 text-green-400"
                : "text-stone-500 hover:text-stone-300"
            }`}
          >
            <BadgeCheck className="w-3 h-3" />
            Verified
          </button>
        </div>
      </div>

      {/* Grid View */}
      {viewMode === "grid" && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4 w-full">
          {filtered.map((agent) => (
            <Link
              key={agent.wallet}
              to={`/agent/${agent.wallet}`}
              className="card hover:border-stone-600 transition-colors p-5"
            >
              {/* Top row: Name + verified + distance */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <h3 className="font-medium text-stone-100 truncate">
                    {agent.name}
                  </h3>
                  {agent.isVerified && <VerifiedIcon size="sm" />}
                </div>
                {agent.distance !== null && (
                  <span className="text-xs text-amber-400 flex-shrink-0 ml-2">
                    {agent.distance < 1
                      ? `${Math.round(agent.distance * 1000)}m`
                      : `${agent.distance.toFixed(1)}km`}
                  </span>
                )}
              </div>

              {/* Address */}
              <p className="text-stone-400 text-sm truncate">
                {agent.address ? `${agent.address}, ` : ""}
                {agent.city}
                {agent.country ? `, ${agent.country}` : ""}
              </p>

              {/* Insurance */}
              <div className="flex items-center gap-1.5 mt-3">
                <Shield className="w-3.5 h-3.5 text-stone-500" />
                <span className="mono text-sm text-stone-300">
                  {formatStake(agent.stakedAmount)} {nativeCurrency.symbol}
                </span>
                <span className="text-xs text-stone-500">insurance</span>
              </div>

              {/* Hold time + late fee */}
              <div className="flex items-center gap-3 mt-1.5 text-xs text-stone-500">
                <span>
                  Holds{" "}
                  <span className="mono text-stone-300">
                    {agent.holdHours}h
                  </span>
                </span>
                {agent.extraHourFee > 0n && (
                  <span>
                    +
                    <span className="mono text-stone-300">
                      ${agent.extraHourFee.toString()}
                    </span>
                    /h late
                  </span>
                )}
              </div>

              {/* Fee + offers */}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-stone-800">
                <div>
                  <span className="mono text-lg font-medium text-stone-100">
                    ${agent.flatFee}
                  </span>
                  <span className="text-xs text-stone-500 ml-1">fee</span>
                </div>
                <span className="text-sm font-medium text-stone-300">
                  {agent.offerCount} active{" "}
                  {agent.offerCount === 1 ? "offer" : "offers"}
                </span>
              </div>

              {/* Open/closed + rating */}
              <div className="flex items-center justify-between mt-2">
                {(() => {
                  const status = getAgentStatus(agent.schedule);
                  return (
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${status.isOpen ? "bg-green-400" : "bg-stone-600"}`}
                      />
                      <span
                        className={`text-xs ${status.isOpen ? "text-green-400" : "text-stone-500"}`}
                      >
                        {status.label}
                      </span>
                    </div>
                  );
                })()}
                <span className="text-xs text-stone-400 flex items-center gap-0.5">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  4.0
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Map View — convert agents to offer-like format for MapView */}
      {viewMode === "map" && (
        <Suspense
          fallback={
            <div className="h-[600px] w-full rounded-lg border border-stone-800 flex items-center justify-center">
              <p className="text-stone-400">Loading map...</p>
            </div>
          }
        >
          <MapView
            variant="agents"
            offers={filtered.map((a) => {
              return {
                id: a.wallet,
                alias: a.name,
                owner: a.wallet,
                role: "seller" as const,
                fiatCurrency: `$${a.flatFee} fee`,
                fee: `${a.offerCount} ${a.offerCount === 1 ? "offer" : "offers"}`,
                minAmount: "",
                maxAmount: "",
                metadataCID: "",
                city: a.city,
                country: a.country,
                lat: a.lat || undefined,
                lon: a.lon || undefined,
                availability: a.workingDays
                  ? { days: a.workingDays.split(", "), hours: "", timezone: "" }
                  : undefined,
                createdAt: "",
                agentAddresses: [],
              };
            })}
            userLocation={userLocation}
            nativeCurrencySymbol="offers"
            recommendedOfferIds={new Set()}
          />
        </Suspense>
      )}

      {filtered.length === 0 && viewMode === "grid" && (
        <div className="text-center py-16">
          <p className="text-stone-400 text-sm">No agents found.</p>
          <Link
            to="/create"
            className="text-sm text-amber-400 mt-2 inline-block"
          >
            Register as an agent
          </Link>
        </div>
      )}
    </div>
  );
}
