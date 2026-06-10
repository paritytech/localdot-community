// Live preview of how the agent location will appear in the marketplace,
// mirroring the ExploreAgents grid card with the user's in-progress form state.
// Read-only. Insurance is shown in the native token; fees in USD (whole units).

import { Check } from "lucide-react";

import type { WeeklySchedule } from "../common/WorkingHoursPicker";
import { AvailabilityStrip } from "./ui";

interface AgentPreviewProps {
  name: string;
  streetAddress: string;
  flatFee: string;
  holdHours: string;
  extraHourFee: string;
  stakeAmount: string;
  schedule: WeeklySchedule;
  verified: boolean;
  symbol: string;
}

export function AgentPreview({
  name,
  streetAddress,
  flatFee,
  holdHours,
  extraHourFee,
  stakeAmount,
  schedule,
  verified,
  symbol,
}: AgentPreviewProps): JSX.Element {
  const displayName = name.trim() || "Your location";
  const initial = (name.trim() || "?")[0]!.toUpperCase();
  const fee = Math.round(parseFloat(flatFee || "0"));
  const hold = Math.round(parseFloat(holdHours || "0"));
  const late = Math.round(parseFloat(extraHourFee || "0"));
  const stake = parseFloat(stakeAmount || "0");
  const stakeLabel = Number.isFinite(stake)
    ? stake.toLocaleString(undefined, { maximumFractionDigits: 2 })
    : "0";

  const stats: [string, string][] = [
    ["Fee / trade", `$${fee || 0}`],
    ["Holds", `${hold || 0}h`],
    ["Late / h", `$${late || 0}`],
  ];

  return (
    <div className="overflow-hidden rounded-3xl border border-stone-800 bg-gradient-to-b from-stone-900/60 to-stone-950">
      <div className="flex items-start gap-4 px-5 py-5">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-stone-800 font-serif text-xl text-stone-300">
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className={`truncate text-base font-semibold ${
                name.trim() ? "text-stone-100" : "text-stone-600"
              }`}
            >
              {displayName}
            </span>
            {verified && (
              <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-stone-950">
                <Check className="h-3 w-3" />
              </span>
            )}
          </div>
          <div className="mt-0.5 truncate text-xs text-stone-500">
            {streetAddress.trim() || "Street address…"}
          </div>
          <div className="mt-2 font-mono text-[11px] text-stone-600">
            New agent
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 font-mono text-[11px] text-emerald-300">
          {stakeLabel} {symbol}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-px border-t border-stone-800/70 bg-stone-800/40">
        {stats.map(([label, value]) => (
          <div key={label} className="bg-stone-950 px-4 py-3 text-center">
            <div className="text-[9px] font-medium uppercase tracking-[0.1em] text-stone-500">
              {label}
            </div>
            <div className="mt-1 font-mono text-sm text-stone-100">{value}</div>
          </div>
        ))}
      </div>

      <div className="px-5 py-4">
        <AvailabilityStrip
          schedule={schedule}
          accent="emerald"
          label="Working hours"
        />
      </div>
    </div>
  );
}
