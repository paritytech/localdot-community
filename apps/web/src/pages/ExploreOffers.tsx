import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  DollarSign,
  HandCoins,
  LayoutGrid,
  List,
  Map as MapIcon,
  MapPin,
  Zap,
} from "lucide-react";
import { lazy, Suspense, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { OffersTable } from "../components/offers/OffersTable";
import { useLocationContext } from "../context/LocationContext";
import { useOffersContext } from "../context/OffersContext";
import { useWalletContext } from "../context/WalletContext";
import { useP2PMarket } from "../hooks/useP2PMarket";
import { calculateDistance } from "../lib/geo";
import { loadOfferAgents, type OfferAgentInfo } from "../lib/offer-agents";
import type { Offer, OfferRole } from "../types/offers";

const MapView = lazy(() =>
  import("../components/offers/MapView").then((m) => {
    return { default: m.MapView };
  }),
);

const RequestTradeModal = lazy(
  () => import("../components/trade/RequestTradeModal"),
);

type SortField = "fee" | "amount" | "distance";
type RoleFilter = "all" | OfferRole;
type ViewMode = "grid" | "map";

export default function ScoutOffers(): JSX.Element {
  const { offers } = useOffersContext();
  const { nativeCurrency } = useWalletContext();
  const { location: userLocation } = useLocationContext();
  const { getAllAgents } = useP2PMarket();

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortBy, setSortBy] = useState<SortField>("amount");
  const [sortAsc, setSortAsc] = useState(true);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");

  // Request-trade modal — opened from a row's action button. We lazily load
  // the chosen offer's agents so the modal can offer agent-mediated routing.
  const [requestOffer, setRequestOffer] = useState<Offer | null>(null);
  const [requestOpen, setRequestOpen] = useState(false);
  const [offerAgents, setOfferAgents] = useState<OfferAgentInfo[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);

  // Guards against a slow agent-load for a previously-clicked offer resolving
  // after a newer one and overwriting the modal's agents with stale data.
  const agentReqIdRef = useRef(0);

  const handleRequest = (offer: Offer) => {
    setRequestOffer(offer);
    setOfferAgents([]);
    setRequestOpen(true);
    const reqId = ++agentReqIdRef.current;
    if (offer.agentAddresses.length > 0) {
      setAgentsLoading(true);
      void loadOfferAgents(offer.agentAddresses, getAllAgents)
        .then((agents) => {
          if (agentReqIdRef.current === reqId) setOfferAgents(agents);
        })
        .catch(() => {
          if (agentReqIdRef.current === reqId) setOfferAgents([]);
        })
        .finally(() => {
          if (agentReqIdRef.current === reqId) setAgentsLoading(false);
        });
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(field);
      setSortAsc(field === "fee" || field === "distance");
    }
  };

  const parseFee = (fee: string | null) =>
    fee ? parseFloat(fee.replace(/\$/g, "")) : Infinity;

  const offersWithDistance = offers.map((offer) => {
    const distance =
      userLocation &&
      offer.lat &&
      offer.lon &&
      (offer.lat !== 0 || offer.lon !== 0)
        ? calculateDistance(
            userLocation.lat,
            userLocation.lon,
            offer.lat,
            offer.lon,
          )
        : null;
    return { ...offer, distance };
  });

  const filtered = offersWithDistance
    .filter((d) => roleFilter === "all" || d.role === roleFilter)
    .sort((a, b) => {
      const dir = sortAsc ? 1 : -1;
      if (sortBy === "fee") return (parseFee(a.fee) - parseFee(b.fee)) * dir;
      if (sortBy === "distance")
        return ((a.distance ?? Infinity) - (b.distance ?? Infinity)) * dir;
      return (parseFloat(b.maxAmount) - parseFloat(a.maxAmount)) * dir;
    });

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
          <h2 className="mb-1">Explore Offers</h2>
          <p className="text-stone-500 text-sm">
            Compare prices and find the best deals
          </p>
        </div>
      </div>

      {/* Toolbar: view (left) + filters + sort (right) */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
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
            {filtered.length} offer{filtered.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Role filter */}
          <div className="flex items-center gap-1 bg-stone-800 p-1 rounded-lg">
            <button
              onClick={() => setRoleFilter("all")}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-0.5 ${
                roleFilter === "all"
                  ? "bg-stone-700 text-stone-100"
                  : "text-stone-400 hover:text-stone-300"
              }`}
            >
              <List className="w-3 h-3" />
              All
            </button>
            <button
              onClick={() => setRoleFilter("seller")}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-0.5 ${
                roleFilter === "seller"
                  ? "bg-stone-700 text-stone-100"
                  : "text-stone-400 hover:text-stone-300"
              }`}
            >
              <ArrowDown className="w-3 h-3" />
              Sell
            </button>
            <button
              onClick={() => setRoleFilter("buyer")}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-0.5 ${
                roleFilter === "buyer"
                  ? "bg-stone-700 text-stone-100"
                  : "text-stone-400 hover:text-stone-300"
              }`}
            >
              <ArrowUp className="w-3 h-3" />
              Buy
            </button>
          </div>
          {/* Sort */}
          {viewMode === "grid" && (
            <div className="flex items-center gap-1 bg-stone-800 p-1 rounded-lg">
              {[
                { key: "amount" as const, label: "Amount", Icon: HandCoins },
                { key: "fee" as const, label: "Fee", Icon: DollarSign },
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
            </div>
          )}
        </div>
      </div>

      {/* List View — dense offers table */}
      {viewMode === "grid" &&
        (filtered.length > 0 ? (
          <OffersTable
            offers={filtered}
            symbol={nativeCurrency.symbol}
            onRequest={handleRequest}
          />
        ) : (
          <div className="text-center py-16">
            <p className="text-stone-400 text-sm">
              No offers match your search.
            </p>
          </div>
        ))}

      {/* Map View */}
      {viewMode === "map" && (
        <Suspense
          fallback={
            <div className="h-[600px] w-full rounded-lg border border-stone-800 flex items-center justify-center">
              <p className="text-stone-400">Loading map...</p>
            </div>
          }
        >
          <MapView
            offers={filtered}
            userLocation={userLocation}
            nativeCurrencySymbol={nativeCurrency.symbol}
            recommendedOfferIds={new Set()}
          />
        </Suspense>
      )}

      {requestOffer && (
        <Suspense fallback={null}>
          <RequestTradeModal
            open={requestOpen}
            onClose={() => setRequestOpen(false)}
            offerAgents={offerAgents}
            agentsLoading={agentsLoading}
            prefill={{
              providerAddress: requestOffer.owner,
              offerId: requestOffer.id,
              fiatCurrency: requestOffer.fiatCurrency,
              providerFee: requestOffer.fee ?? undefined,
              offerLat: requestOffer.lat,
              offerLon: requestOffer.lon,
              offerRole: requestOffer.role,
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
