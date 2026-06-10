import { formatUnits } from "ethers";
import { CalendarDays, MapPin, Shield, Star } from "lucide-react";
import { useEffect, useState } from "react";

import { useWalletContext } from "../../context/WalletContext";
import { type ContractAgent, useP2PMarket } from "../../hooks/useP2PMarket";
import { timeToMinutes } from "../../lib/format";
import { calculateDistance } from "../../lib/geo";
import { isZKPassportVerified } from "../../lib/host";
import { fetchJSONFromIPFS } from "../../lib/ipfs";
import type { WeeklySchedule } from "../common/WorkingHoursPicker";
import { VerifiedIcon } from "../zkpassport";

interface AgentMetadata {
  location: {
    city: string;
    country: string;
    address?: string;
    lat: number;
    lng: number;
  };
  workingHours: {
    schedule?: Record<string, { open: string; close: string }>;
    timezone: string;
  };
}

interface ScheduleOverlap {
  days: number;
  avgHours: number;
}

function calculateOverlap(
  providerSchedule: WeeklySchedule,
  agentSchedule: Record<string, { open: string; close: string }>,
): ScheduleOverlap {
  let totalOverlapMinutes = 0;
  let overlapDays = 0;

  for (const day of Object.keys(providerSchedule)) {
    const prov = providerSchedule[day];
    const agent = agentSchedule[day];
    if (!prov || !agent) continue;

    const overlapStart = Math.max(
      timeToMinutes(prov.open),
      timeToMinutes(agent.open),
    );
    const overlapEnd = Math.min(
      timeToMinutes(prov.close),
      timeToMinutes(agent.close),
    );
    const overlap = overlapEnd - overlapStart;

    if (overlap > 0) {
      overlapDays++;
      totalOverlapMinutes += overlap;
    }
  }

  return {
    days: overlapDays,
    avgHours:
      overlapDays > 0
        ? Math.round((totalOverlapMinutes / overlapDays / 60) * 10) / 10
        : 0,
  };
}

interface AgentWithMetadata {
  wallet: string;
  name: string;
  flatFee: bigint;
  stakedAmount: bigint;
  holdHours: number;
  extraHourFee: bigint;
  isVerified: boolean;
  city: string;
  country: string;
  address: string;
  lat: number;
  lon: number;
  distance: number | null;
  schedule: Record<string, { open: string; close: string }>;
  overlap: ScheduleOverlap | null;
}

interface AgentSelectorProps {
  selected: string[];
  onChange: (agents: string[]) => void;
  providerLocation?: { lat: number; lon: number } | null;
  providerSchedule?: WeeklySchedule;
}

export function AgentSelector({
  selected,
  onChange,
  providerLocation,
  providerSchedule,
}: AgentSelectorProps): JSX.Element {
  const { getAllAgents } = useP2PMarket();
  const { nativeCurrency, evmDecimals } = useWalletContext();
  const [agents, setAgents] = useState<AgentWithMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [maxDistance, setMaxDistance] = useState("10");
  const [minOverlapDays, setMinOverlapDays] = useState("0");
  const [minRating, setMinRating] = useState("0");
  const [minInsurance, setMinInsurance] = useState("0");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const contractAgents = await getAllAgents();
        const enriched = await Promise.all(
          contractAgents.map(async (agent: ContractAgent) => {
            let city = "Unknown";
            let country = "";
            let address = "";
            let lat = 0;
            let lon = 0;
            let schedule: Record<string, { open: string; close: string }> = {};

            try {
              const meta = await fetchJSONFromIPFS<AgentMetadata>(
                agent.metadataCID,
              );
              if (meta.location) {
                city = meta.location.city || "Unknown";
                country = meta.location.country || "";
                address = meta.location.address || "";
                lat = meta.location.lat || 0;
                lon = meta.location.lng || 0;
              }
              if (meta.workingHours?.schedule) {
                schedule = meta.workingHours.schedule;
              }
            } catch {
              // Metadata fetch failed
            }

            const distance =
              providerLocation && lat !== 0 && lon !== 0
                ? calculateDistance(
                    providerLocation.lat,
                    providerLocation.lon,
                    lat,
                    lon,
                  )
                : null;

            const overlap =
              providerSchedule && Object.keys(providerSchedule).length > 0
                ? calculateOverlap(providerSchedule, schedule)
                : null;

            let verified = false;
            try {
              verified = await isZKPassportVerified(agent.wallet);
            } catch {
              /* skip */
            }

            return {
              wallet: agent.wallet,
              name: agent.name,
              flatFee: agent.flatFee,
              stakedAmount: agent.stakedAmount,
              holdHours: agent.holdHours,
              extraHourFee: agent.extraHourFee,
              isVerified: verified,
              city,
              country,
              address,
              lat,
              lon,
              distance,
              schedule,
              overlap,
            };
          }),
        );

        if (!cancelled) {
          enriched.sort((a, b) => {
            if (a.distance === null && b.distance === null) return 0;
            if (a.distance === null) return 1;
            if (b.distance === null) return -1;
            return a.distance - b.distance;
          });
          setAgents(enriched);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load agents",
          );
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [getAllAgents, providerLocation, providerSchedule]);

  const toggle = (wallet: string) => {
    onChange(
      selected.includes(wallet)
        ? selected.filter((a) => a !== wallet)
        : [...selected, wallet],
    );
  };

  const maxDist = parseInt(maxDistance) || 999;
  const minDays = parseInt(minOverlapDays) || 0;
  const minRate = parseFloat(minRating) || 0;
  const minIns = parseFloat(minInsurance) || 0;
  const HARDCODED_RATING = 4.0;

  const filtered = agents.filter((a) => {
    if (providerLocation && (a.distance === null || a.distance > maxDist))
      return false;
    if (a.overlap && a.overlap.days < minDays) return false;
    if (a.overlap && a.overlap.days === 0) return false;
    if (HARDCODED_RATING < minRate) return false;
    if (minIns > 0) {
      const stakeNum = parseFloat(formatUnits(a.stakedAmount, evmDecimals));
      if (stakeNum < minIns) return false;
    }
    return true;
  });

  const selectAllFiltered = () => {
    const wallets = filtered.map((a) => a.wallet);
    const merged = new Set([...selected, ...wallets]);
    onChange([...merged]);
  };

  const deselectAll = () => {
    onChange([]);
  };

  if (loading) {
    return (
      <div className="text-stone-500 text-sm py-4 text-center">
        Loading exchange agents...
      </div>
    );
  }

  if (error) {
    return <div className="text-red-400 text-sm py-4 text-center">{error}</div>;
  }

  if (agents.length === 0) {
    return (
      <div className="text-stone-500 text-sm py-4 text-center">
        No exchange agents registered yet. Your offer will be listed as direct
        P2P only.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="rounded-lg border border-stone-800 bg-stone-900/50 p-3">
        <div className="grid grid-cols-2 gap-3">
          {providerLocation && (
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-stone-500 mb-1.5 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-stone-400" />
                Max distance
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  inputMode="numeric"
                  value={maxDistance}
                  onChange={(e) =>
                    setMaxDistance(e.target.value.replace(/[^0-9]/g, ""))
                  }
                  className="input mono text-sm w-full py-1.5"
                />
                <span className="text-xs text-stone-400 flex-shrink-0">km</span>
              </div>
            </div>
          )}
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-stone-500 mb-1.5 flex items-center gap-1">
              <Shield className="w-3 h-3 text-stone-400" />
              Min insurance ({nativeCurrency.symbol})
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={minInsurance}
              onChange={(e) =>
                setMinInsurance(e.target.value.replace(/[^0-9.]/g, ""))
              }
              className="input mono text-sm w-full py-1.5"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wider text-stone-500 mb-1.5 flex items-center gap-1">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              Min rating
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={minRating}
              onChange={(e) =>
                setMinRating(e.target.value.replace(/[^0-9.]/g, ""))
              }
              className="input mono text-sm w-full py-1.5"
            />
          </div>
          {providerSchedule && Object.keys(providerSchedule).length > 0 && (
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-stone-500 mb-1.5 flex items-center gap-1">
                <CalendarDays className="w-3 h-3 text-stone-400" />
                Min shared days
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={minOverlapDays}
                onChange={(e) =>
                  setMinOverlapDays(e.target.value.replace(/[^0-9]/g, ""))
                }
                className="input mono text-sm w-full py-1.5"
              />
            </div>
          )}
        </div>
      </div>

      {/* Count + actions */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-stone-500">
          {filtered.length} {filtered.length === 1 ? "location" : "locations"}{" "}
          found
        </span>
        <div className="flex gap-2">
          {selected.length > 0 && (
            <button
              type="button"
              onClick={deselectAll}
              className="text-xs text-stone-500 hover:text-stone-300 transition-colors"
            >
              Clear
            </button>
          )}
          {filtered.length > 0 && (
            <button
              type="button"
              onClick={selectAllFiltered}
              className="text-xs font-medium text-amber-400 hover:text-amber-300 transition-colors"
            >
              Select all
            </button>
          )}
        </div>
      </div>

      {/* Agent list */}
      {filtered.length === 0 ? (
        <p className="text-xs text-stone-500 text-center py-4">
          No locations match your filters. Try increasing the range.
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((agent) => {
            const isSelected = selected.includes(agent.wallet);
            const ov = agent.overlap;
            return (
              <button
                key={agent.wallet}
                type="button"
                onClick={() => toggle(agent.wallet)}
                className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                  isSelected
                    ? "border-stone-100 bg-stone-800"
                    : "border-stone-700 bg-stone-900 hover:border-stone-600"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  {/* Left: Name, address */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">
                        {agent.name}
                      </span>
                      {agent.isVerified && <VerifiedIcon size="sm" />}
                      <span className="text-xs text-stone-400 flex items-center gap-1 flex-shrink-0">
                        <Shield className="w-3 h-3 text-stone-500" />
                        {parseFloat(
                          formatUnits(agent.stakedAmount, evmDecimals),
                        ).toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })}{" "}
                        {nativeCurrency.symbol}
                      </span>
                      {agent.distance !== null && (
                        <span className="text-xs text-amber-400 flex-shrink-0">
                          {agent.distance < 1
                            ? `${Math.round(agent.distance * 1000)}m`
                            : `${agent.distance.toFixed(1)}km`}
                        </span>
                      )}
                    </div>
                    <p className="text-stone-500 text-xs truncate mt-1">
                      {agent.address ? `${agent.address}, ` : ""}
                      {agent.city}
                      {agent.country ? `, ${agent.country}` : ""}
                    </p>
                    <p className="text-stone-500 text-[11px] mt-1">
                      Holds{" "}
                      <span className="mono text-stone-300">
                        {agent.holdHours}h
                      </span>
                      {agent.extraHourFee > 0n && (
                        <>
                          {" · "}
                          <span className="mono text-stone-300">
                            ${agent.extraHourFee.toString()}
                          </span>
                          /h late fee
                        </>
                      )}
                    </p>
                  </div>

                  {/* Right: Rating, overlap, checkbox */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs text-stone-400 flex items-center gap-0.5">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />{" "}
                        4.0
                      </span>
                      {ov !== null && ov.days > 0 && (
                        <span className="text-xs font-medium text-emerald-400">
                          {ov.days} shared {ov.days === 1 ? "day" : "days"}, ~
                          {ov.avgHours}h/day
                        </span>
                      )}
                    </div>
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                        isSelected
                          ? "border-stone-100 bg-stone-100"
                          : "border-stone-600"
                      }`}
                    >
                      {isSelected && (
                        <svg
                          className="w-3 h-3 text-stone-900"
                          viewBox="0 0 12 12"
                        >
                          <path
                            d="M2 6l3 3 5-5"
                            stroke="currentColor"
                            strokeWidth="2"
                            fill="none"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected.length > 0 && (
        <p className="text-xs text-stone-500 text-center">
          {selected.length} {selected.length === 1 ? "location" : "locations"}{" "}
          selected
        </p>
      )}
    </div>
  );
}
