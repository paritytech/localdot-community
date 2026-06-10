// Live preview of how the offer will appear in the marketplace, mirroring
// ProviderCard's fields with the user's in-progress form state. Read-only —
// no contract calls. Honest identity: account name or truncated address, and
// no fabricated rating/trade count for a brand-new listing.

import { Shield, Users } from "lucide-react";

import type { OfferRole } from "../../types/offers";
import type { WeeklySchedule } from "../common/WorkingHoursPicker";
import { PhotoThumbnail } from "../profile/PhotoThumbnail";
import { AvailabilityStrip } from "./ui";

interface OfferPreviewProps {
  role: OfferRole;
  minAmount: string;
  maxAmount: string;
  flatFee: string;
  enableAgent: boolean;
  enableDirect: boolean;
  agentCount: number;
  directCity?: string;
  schedule: WeeklySchedule;
  symbol: string;
  address: string | null;
  accountName: string | null;
}

export function OfferPreview({
  role,
  minAmount,
  maxAmount,
  flatFee,
  enableAgent,
  enableDirect,
  agentCount,
  directCity,
  schedule,
  symbol,
  address,
  accountName,
}: OfferPreviewProps): JSX.Element {
  const isSeller = role === "seller";
  const feeNum = Math.round(parseFloat(flatFee || "0"));
  const displayName =
    accountName ??
    (address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Your offer");

  return (
    <div className="overflow-hidden rounded-3xl border border-stone-800 bg-gradient-to-b from-stone-900/60 to-stone-950">
      {/* Header: who + side */}
      <div className="flex items-center justify-between border-b border-stone-800/70 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <PhotoThumbnail cid={null} address={address ?? "0x"} size="md" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-stone-100">
              {displayName}
            </div>
            <div className="text-[11px] text-stone-500">New listing</div>
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
            isSeller
              ? "bg-amber-400/15 text-amber-300"
              : "bg-sky-400/15 text-sky-300"
          }`}
        >
          {isSeller ? "Selling" : "Buying"}
        </span>
      </div>

      <div className="px-5 py-5">
        <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-stone-500">
          {isSeller ? "Tokens to sell" : "Tokens wanted"}
        </div>
        <div className="mt-1.5 flex items-baseline gap-2 whitespace-nowrap">
          <span className="font-mono text-[26px] font-light leading-none tabular-nums text-stone-100">
            {minAmount || "—"}–{maxAmount || "—"}
          </span>
          <span className="font-mono text-sm uppercase tracking-wide text-stone-500">
            {symbol}
          </span>
        </div>

        {/* Fee */}
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-stone-800 bg-stone-950/50 px-3.5 py-2.5">
          <span className="text-sm text-stone-300">Flat fee</span>
          <span className="ml-auto font-mono text-sm text-stone-100">
            {feeNum > 0 ? `$${feeNum}` : "No fee"}
          </span>
        </div>

        {/* Methods */}
        <div className="mt-3 flex flex-wrap gap-2">
          {enableAgent && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300">
              <Shield className="h-3.5 w-3.5" /> Via Agent
            </span>
          )}
          {enableDirect && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300">
              <Users className="h-3.5 w-3.5" /> Direct
            </span>
          )}
          {!enableAgent && !enableDirect && (
            <span className="rounded-full border border-stone-800 px-3 py-1.5 text-xs text-stone-600">
              No method selected
            </span>
          )}
        </div>

        {/* Availability */}
        <div className="mt-4 border-t border-stone-800/70 pt-4">
          <AvailabilityStrip schedule={schedule} accent="amber" />
          {(enableAgent || enableDirect) && (
            <div className="mt-3 space-y-1.5">
              {enableAgent && (
                <div className="flex items-center gap-2 text-xs text-stone-400">
                  <Shield className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  {agentCount} {agentCount === 1 ? "agent" : "agents"} selected
                </div>
              )}
              {enableDirect && (
                <div className="flex items-center gap-2 text-xs text-stone-400">
                  <Users className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                  Direct meetup{directCity ? ` · ${directCity}` : ""}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
