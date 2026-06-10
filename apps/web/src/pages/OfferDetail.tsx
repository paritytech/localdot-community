import { ChevronLeft, ChevronRight } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";

import { AddAgentModal } from "../components/offers/AddAgentModal";
import { useOffersContext } from "../context/OffersContext";
import { useWalletContext } from "../context/WalletContext";
import { useP2PMarket } from "../hooks/useP2PMarket";
import { isOwner } from "../lib/address";
import { loadOfferAgents, type OfferAgentInfo } from "../lib/offer-agents";

const RequestTradeModal = lazy(
  () => import("../components/trade/RequestTradeModal"),
);

function getGoogleMapsUrl(lat: number, lon: number): string {
  return `https://www.google.com/maps?q=${lat},${lon}`;
}

export default function OfferDetail(): JSX.Element {
  const { id } = useParams();
  const { getOffer, refreshOffers } = useOffersContext();
  const { address, nativeCurrency } = useWalletContext();
  const { getAllAgents, removeOffer } = useP2PMarket();
  const [locationDetailsOpen, setLocationDetailsOpen] = useState(false);
  const [offerAgents, setOfferAgents] = useState<OfferAgentInfo[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const [requestOpen, setRequestOpen] = useState(false);
  const [addAgentOpen, setAddAgentOpen] = useState(false);
  const navigate = useNavigate();

  const prefillAgent = searchParams.get("agent") ?? undefined;
  const prefillAgentName = searchParams.get("agentName") ?? undefined;
  const prefillAmount = searchParams.get("amount") ?? undefined;
  useEffect(() => {
    if (searchParams.get("trade") === "1") setRequestOpen(true);
  }, [searchParams]);

  const offer = getOffer(id ?? "");

  const loadAgents = useCallback(async () => {
    if (!offer || offer.agentAddresses.length === 0) return;
    setAgentsLoading(true);
    try {
      setOfferAgents(await loadOfferAgents(offer.agentAddresses, getAllAgents));
    } catch {
      /* skip */
    } finally {
      setAgentsLoading(false);
    }
  }, [offer, getAllAgents]);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  const handleRemove = async () => {
    if (
      !offer ||
      !confirm("Are you sure you want to permanently remove this offer?")
    )
      return;
    setRemoving(true);
    setRemoveError(null);
    try {
      await removeOffer(BigInt(offer.id));
      await refreshOffers();
      navigate(-1);
    } catch (err) {
      setRemoveError(
        err instanceof Error ? err.message : "Failed to remove offer",
      );
    } finally {
      setRemoving(false);
    }
  };

  if (!offer) {
    return (
      <div className="max-w-2xl mx-auto px-4 md:px-6 py-8">
        <p className="text-stone-400 text-sm">Offer not found.</p>
        <button
          onClick={() => navigate(-1)}
          className="text-sm text-stone-500 hover:text-stone-300 mt-4 inline-flex items-center gap-1"
        >
          <ChevronLeft className="w-4 h-4" /> Go back
        </button>
      </div>
    );
  }

  const isProvider = offer.role === "seller";
  const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
  const hasLocation =
    offer.lat != null &&
    offer.lon != null &&
    offer.radiusKm != null &&
    (offer.lat !== 0 || offer.lon !== 0);

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-4 md:py-6">
      {/* Back */}
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-stone-500 hover:text-stone-300 transition-colors inline-flex items-center gap-1 mb-4"
      >
        <ChevronLeft className="w-4 h-4" /> Back
      </button>

      {/* Hero */}
      <div className="flex items-start gap-3 mb-5">
        <div className="w-10 h-10 rounded-full bg-stone-800 border border-stone-700 flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="mono text-xs text-stone-400">
            {offer.owner.slice(2, 4)}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${isProvider ? "bg-green-500/15 text-green-400" : "bg-amber-500/15 text-amber-400"}`}
            >
              {isProvider ? "Selling" : "Buying"}
            </span>
            {offer.city && (
              <span className="text-sm text-stone-300">{offer.city}</span>
            )}
            <span className="text-[11px] text-stone-600">#{offer.id}</span>
          </div>
          <p className="mono text-xs text-stone-500 truncate">{offer.owner}</p>
          <p className="text-[11px] text-stone-600">
            Created {offer.createdAt}
          </p>
        </div>
      </div>

      {/* Key info — compact card */}
      <div className="rounded-xl border border-stone-700/80 bg-stone-900 mb-4">
        <div className="grid grid-cols-2 divide-x divide-stone-800">
          <div className="p-4">
            <p className="text-[11px] text-stone-500 uppercase tracking-wider mb-1">
              Range
            </p>
            <p className="mono text-lg text-stone-100">
              {offer.minAmount}
              <span className="text-stone-600 mx-0.5">–</span>
              {offer.maxAmount}
            </p>
            <p className="text-[11px] text-stone-500">
              {nativeCurrency.symbol} · {offer.fiatCurrency}
            </p>
          </div>
          <div className="p-4">
            <p className="text-[11px] text-stone-500 uppercase tracking-wider mb-1">
              Fee
            </p>
            <p className="mono text-lg text-stone-100">{offer.fee ?? "Free"}</p>
            <p className="text-[11px] text-stone-500">flat fee</p>
          </div>
        </div>
        {offer.availability && (
          <div className="border-t border-stone-800 p-4">
            <div className="flex items-center justify-between">
              <div className="flex gap-1">
                {DAY_LETTERS.map((letter, i) => {
                  const isAvailable =
                    offer.availability?.days.includes(DAY_NAMES[i] ?? "") ??
                    false;
                  return (
                    <div
                      key={i}
                      className={`w-7 h-7 rounded text-[11px] flex items-center justify-center font-medium ${isAvailable ? "bg-stone-100 text-stone-900" : "bg-stone-800 text-stone-600"}`}
                    >
                      {letter}
                    </div>
                  );
                })}
              </div>
              <p className="text-sm text-stone-300">
                {offer.availability.hours}
                <span className="text-stone-500 ml-1 text-xs">
                  {offer.availability.timezone}
                </span>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Agents */}
      {offerAgents.length > 0 && (
        <div className="rounded-xl border border-stone-700/80 bg-stone-900 mb-4 overflow-hidden">
          <p className="text-[11px] text-stone-500 uppercase tracking-wider px-4 pt-3 pb-2">
            Exchange Agents ({offerAgents.length})
          </p>
          {offerAgents.map((agent, i) => (
            <Link
              key={agent.wallet}
              to={`/agent/${agent.wallet}`}
              className={`flex items-center justify-between px-4 py-3 hover:bg-stone-800/50 transition-colors ${i > 0 ? "border-t border-stone-800" : ""}`}
            >
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-stone-800 border border-stone-700 flex items-center justify-center flex-shrink-0">
                  <span className="mono text-[10px] text-stone-400">
                    {agent.name.slice(0, 2)}
                  </span>
                </div>
                <div>
                  <span className="text-sm font-medium text-stone-200">
                    {agent.name}
                  </span>
                  {agent.city && (
                    <span className="text-xs text-stone-500 ml-1.5">
                      {agent.city}
                    </span>
                  )}
                </div>
              </div>
              <span className="mono text-xs text-stone-400">
                ${agent.flatFee}
              </span>
            </Link>
          ))}
        </div>
      )}

      {/* Location */}
      {hasLocation && (
        <div className="rounded-xl border border-stone-700/80 bg-stone-900 mb-4 overflow-hidden">
          <a
            href={getGoogleMapsUrl(offer.lat!, offer.lon!)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 hover:bg-stone-800/50 transition-colors group"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-amber-500/80 group-hover:text-amber-400 flex-shrink-0"
            >
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <div className="flex-1">
              <p className="text-sm text-stone-200 group-hover:text-amber-400 transition-colors">
                {offer.city}
                {offer.country ? `, ${offer.country}` : ""}
              </p>
              <p className="text-[11px] text-stone-500">
                {offer.radiusKm} km radius
              </p>
            </div>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-stone-600 group-hover:text-amber-400 flex-shrink-0"
            >
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
          <button
            onClick={() => setLocationDetailsOpen(!locationDetailsOpen)}
            className="flex items-center gap-2 px-4 py-2.5 text-xs text-stone-500 hover:text-stone-300 transition-colors border-t border-stone-800 w-full"
          >
            <ChevronRight
              className={`w-3.5 h-3.5 transition-transform ${locationDetailsOpen ? "rotate-90" : ""}`}
            />
            Coordinates
          </button>
          {locationDetailsOpen && (
            <div className="px-4 pb-3 text-xs mono text-stone-400 space-y-0.5">
              <p>
                {offer.lat}, {offer.lon}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Request Trade CTA — not owner */}
      {!isOwner(address, offer.owner) && (
        <button
          onClick={() => setRequestOpen(true)}
          className="w-full mb-4 py-3 rounded-xl bg-stone-100 text-stone-900 text-sm font-medium hover:bg-white transition-colors flex items-center justify-center gap-2"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
            />
          </svg>
          Request Trade
        </button>
      )}

      {/* Manage — owner only */}
      {isOwner(address, offer.owner) && (
        <div className="rounded-xl border border-stone-700/80 bg-stone-900 p-4 mb-4">
          <p className="text-[11px] text-stone-500 uppercase tracking-wider mb-3">
            Manage
          </p>

          {/* Info — provider waits for trade requests */}
          <p className="text-xs text-stone-500 mb-3">
            Trade requests from buyers will appear in your{" "}
            <Link to="/profile" className="text-stone-300 underline">
              Profile
            </Link>{" "}
            under Requests. Accept by locking funds.
          </p>

          {removeError && (
            <div className="rounded-lg bg-red-950/50 border border-red-800 text-red-200 px-3 py-2 text-sm mb-3">
              {removeError}
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setAddAgentOpen(true)}
              className="px-4 py-2 rounded-lg border border-stone-700 text-stone-300 text-sm hover:bg-stone-800 transition-colors"
            >
              Add agent
            </button>
            <button
              onClick={() => void handleRemove()}
              disabled={removing}
              className="px-4 py-2 rounded-lg border border-red-800/50 text-red-400 text-sm hover:bg-red-950/50 transition-colors disabled:opacity-50"
            >
              {removing ? "Removing..." : "Remove Offer"}
            </button>
          </div>
        </div>
      )}

      {/* Modal */}
      <Suspense fallback={null}>
        <RequestTradeModal
          open={requestOpen}
          onClose={() => setRequestOpen(false)}
          offerAgents={offerAgents}
          agentsLoading={agentsLoading}
          prefill={{
            providerAddress: offer.owner,
            offerId: offer.id,
            fiatCurrency: offer.fiatCurrency,
            providerFee: offer.fee ?? undefined,
            offerLat: offer.lat,
            offerLon: offer.lon,
            agentAddress: prefillAgent,
            agentName: prefillAgentName,
            amount: prefillAmount,
            offerRole: offer.role,
          }}
        />
      </Suspense>

      <AddAgentModal
        open={addAgentOpen}
        onClose={() => setAddAgentOpen(false)}
        offerId={offer.id}
        existingAgents={offer.agentAddresses}
        onAdded={() => {
          void refreshOffers();
          void loadAgents();
        }}
      />
    </div>
  );
}
