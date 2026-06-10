import { MapPin, Star } from "lucide-react";
import { Link } from "react-router-dom";

import { useWalletContext } from "../../context/WalletContext";
import type { OfferRole } from "../../types/offers";
import { PhotoThumbnail } from "../profile/PhotoThumbnail";

interface ProviderCardProps {
  id: string;
  alias: string;
  owner?: string;
  photoCid?: string;
  role?: OfferRole;
  city: string;
  country: string;
  fiatCurrency?: string;
  fee: string | null;
  minAmount: string;
  maxAmount: string;
  availability?: {
    days: string[];
    hours: string;
    timezone: string;
  };
  distance?: number | null;
  isRecommended?: boolean;
  agentCount?: number;
}

export function ProviderCard({
  id,
  alias,
  owner,
  photoCid,
  role = "seller",
  city,
  country,
  fiatCurrency,
  fee,
  minAmount,
  maxAmount,
  availability,
  distance,
  isRecommended = false,
  agentCount = 0,
}: ProviderCardProps): JSX.Element {
  const { nativeCurrency } = useWalletContext();

  return (
    <Link to={`/offer/${id}`} className="card-interactive group block relative">
      {/* Recommended badge */}
      {isRecommended && (
        <div className="absolute -top-2 -right-2 z-10 flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500 text-white text-[10px] font-bold shadow-lg">
          <Star className="w-3 h-3 fill-white text-white" /> Recommended
        </div>
      )}

      {/* Top row: alias + location + distance */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            {owner && (
              <PhotoThumbnail cid={photoCid} address={owner} size="sm" />
            )}
            <span className="text-sm font-medium text-stone-100">{alias}</span>
          </div>
          {city && (
            <p className="text-xs text-stone-400 mt-0.5">
              {city}
              {country ? `, ${country}` : ""}
            </p>
          )}
          {distance !== null && distance !== undefined && (
            <p className="text-xs text-amber-400 mt-0.5">
              <MapPin className="w-3 h-3 inline" /> {distance.toFixed(1)} km
              away
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="mono text-xs text-stone-500">{fiatCurrency ?? "USD"}</p>
        </div>
      </div>

      {/* Role badge + agent badge */}
      <div className="mb-3 flex items-center gap-2">
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
            role === "seller"
              ? "bg-green-500/15 text-green-400"
              : "bg-amber-500/15 text-amber-400"
          }`}
        >
          {role === "seller" ? "Selling" : "Buying"}
        </span>
        {agentCount > 0 && (
          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-stone-700 text-stone-300">
            {agentCount} {agentCount === 1 ? "agent" : "agents"}
          </span>
        )}
      </div>

      {/* Hero: min–max range */}
      <div className="mb-4">
        <div className="flex items-baseline gap-2">
          <span className="mono text-3xl text-stone-50 tracking-tight">
            {minAmount}
          </span>
          <span className="text-stone-600">–</span>
          <span className="mono text-3xl text-stone-50 tracking-tight">
            {maxAmount}
          </span>
          <span className="text-sm text-stone-500">
            {nativeCurrency.symbol}
          </span>
        </div>
        <p className="text-xs text-stone-500 mt-1">
          {role === "seller" ? "Tokens to sell" : "Tokens wanted"}
        </p>
      </div>

      {/* Fee */}
      <div className="flex items-center gap-3 mb-4 pb-4 border-b border-stone-800">
        <div>
          <p className="text-[11px] text-stone-500 uppercase tracking-wider">
            Fee
          </p>
          <p className="mono text-sm text-stone-300">{fee ?? "No fee"}</p>
        </div>
      </div>

      {/* Availability */}
      <div className="flex items-center justify-between">
        {availability ? (
          <div className="flex items-center gap-1.5">
            <div className="flex gap-0.5">
              {["M", "T", "W", "T", "F", "S", "S"].map((day, i) => {
                const dayNames = [
                  "Mon",
                  "Tue",
                  "Wed",
                  "Thu",
                  "Fri",
                  "Sat",
                  "Sun",
                ];
                const isAvailable = availability.days.includes(
                  dayNames[i] ?? "",
                );
                return (
                  <div
                    key={i}
                    className={`w-5 h-5 rounded text-[10px] flex items-center justify-center font-medium ${
                      isAvailable
                        ? "bg-stone-100 text-stone-900"
                        : "bg-stone-800 text-stone-600"
                    }`}
                  >
                    {day}
                  </div>
                );
              })}
            </div>
            <span className="text-[11px] text-stone-500 ml-1">
              {availability.hours}
            </span>
          </div>
        ) : (
          <span className="text-xs text-stone-500">Availability not set</span>
        )}

        <span
          className="btn-primary text-xs px-3 py-1.5 inline-flex items-center justify-center"
          style={{ minHeight: "36px" }}
        >
          View
        </span>
      </div>
    </Link>
  );
}
