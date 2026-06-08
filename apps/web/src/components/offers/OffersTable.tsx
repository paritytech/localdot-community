/**
 * OffersTable — dense, order-book style list of offers.
 *
 * Columns: Provider (avatar + alias + location) · Fee · Limit · Route · action.
 * Row click → offer detail page; the action button opens the request-trade
 * modal directly (the parent owns that state). We only render columns we
 * actually have data for — no rating / trade-count / online status, which the
 * Offer model doesn't carry.
 */

import { useNavigate } from "react-router-dom";

import type { Offer } from "../../types/offers";
import { AgentAvatar } from "../agents/AgentVisuals";

type OfferWithDistance = Offer & { distance?: number | null };

// Every track is a fixed width (not `auto`) so the header and the rows resolve
// to identical columns — an `auto` action track sized to its content (0 in the
// header vs the button width in rows), which shifted the headers out of line.
const COLS =
  "grid-cols-[1fr_84px] sm:grid-cols-[minmax(0,1.6fr)_88px_140px_150px_84px]";

/** Proximity tiers — closer is greener, farther fades to amber/rose. */
function distanceColor(km: number): string {
  if (km <= 5) return "text-emerald-400";
  if (km <= 20) return "text-amber-400";
  return "text-rose-400";
}

export function OffersTable({
  offers,
  symbol,
  onRequest,
}: {
  offers: OfferWithDistance[];
  symbol: string;
  onRequest: (offer: Offer) => void;
}): JSX.Element {
  return (
    <div className="rounded-2xl border border-stone-800/80 bg-stone-900/30 overflow-hidden">
      <div
        className={`grid ${COLS} items-center gap-3 px-4 py-2.5 border-b border-stone-900 bg-stone-950/40`}
      >
        <span className="text-[10px] uppercase tracking-[0.12em] text-stone-500 font-medium">
          Provider
        </span>
        <span className="hidden sm:block text-[10px] uppercase tracking-[0.12em] text-stone-500 font-medium">
          Fee
        </span>
        <span className="hidden sm:block text-[10px] uppercase tracking-[0.12em] text-stone-500 font-medium">
          Limit
        </span>
        <span className="hidden sm:block text-[10px] uppercase tracking-[0.12em] text-stone-500 font-medium">
          Route
        </span>
        <span />
      </div>

      {offers.map((offer) => (
        <OfferRow
          key={offer.id}
          offer={offer}
          symbol={symbol}
          onRequest={onRequest}
        />
      ))}
    </div>
  );
}

function OfferRow({
  offer,
  symbol,
  onRequest,
}: {
  offer: OfferWithDistance;
  symbol: string;
  onRequest: (offer: Offer) => void;
}): JSX.Element {
  const navigate = useNavigate();
  const open = () => navigate(`/offer/${offer.id}`);

  const selling = offer.role === "seller";
  const cityCountry = [offer.city, offer.country].filter(Boolean).join(", ");
  const hasDistance = offer.distance != null;
  const agentCount = offer.agentAddresses.length;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      className={`grid ${COLS} items-center gap-3 px-4 py-3 border-t border-stone-900 hover:bg-stone-900/50 transition-colors cursor-pointer focus:outline-none focus:bg-stone-900/50`}
    >
      {/* Provider */}
      <div className="flex items-center gap-3 min-w-0">
        <AgentAvatar name={offer.alias} wallet={offer.owner} size="sm" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-stone-100 font-medium truncate">
              {offer.alias}
            </span>
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${
                selling
                  ? "bg-green-500/15 text-green-400"
                  : "bg-amber-500/15 text-amber-400"
              }`}
            >
              {selling ? "Selling" : "Buying"}
            </span>
          </div>
          <p className="text-xs text-stone-500 truncate">
            {cityCountry || (hasDistance ? "Location" : "Location not set")}
            {hasDistance && (
              <>
                {" · "}
                <span className={distanceColor(offer.distance!)}>
                  {offer.distance!.toFixed(1)} km
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Fee */}
      <div className="hidden sm:block">
        <span className="mono text-sm text-stone-200">
          {offer.fee ?? "No fee"}
        </span>
      </div>

      {/* Limit */}
      <div className="hidden sm:block">
        <span className="mono text-sm text-stone-200 tabular-nums">
          {offer.minAmount}–{offer.maxAmount}
        </span>
        <span className="text-stone-600 text-xs"> {symbol}</span>
      </div>

      {/* Route — direct is always possible; agents are an added option */}
      <div className="hidden sm:flex items-center min-w-0">
        <span className="inline-flex items-center gap-1.5 text-xs text-stone-400 px-2 py-1 rounded-md border border-stone-800 truncate">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              agentCount > 0 ? "bg-amber-400" : "bg-sky-400"
            }`}
          />
          {agentCount > 0
            ? `Direct + ${agentCount} agent${agentCount > 1 ? "s" : ""}`
            : "Direct"}
        </span>
      </div>

      {/* Action */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRequest(offer);
        }}
        className={`justify-self-end rounded-lg text-stone-950 px-4 py-1.5 text-sm font-medium transition-colors ${
          selling
            ? "bg-green-500 hover:bg-green-400"
            : "bg-amber-500 hover:bg-amber-400"
        }`}
      >
        {selling ? "Buy" : "Sell"}
      </button>
    </div>
  );
}
