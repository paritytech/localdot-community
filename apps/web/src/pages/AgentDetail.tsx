import { formatUnits } from "ethers";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  DollarSign,
  MapPin,
  Shield,
  Timer,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  AgentAvatar,
  StatTile,
  StatusPill,
} from "../components/agents/AgentVisuals";
import { AgentLocationCard } from "../components/trade/agent-detail/AgentLocationCard";
import { VerifiedBadge } from "../components/zkpassport";
import { useOffersContext } from "../context/OffersContext";
import { useWalletContext } from "../context/WalletContext";
import { type ContractAgent, useP2PMarket } from "../hooks/useP2PMarket";
import { isOwner } from "../lib/address";
import {
  type AgentSchedule,
  getAgentStatus,
  groupSchedule,
} from "../lib/agent-hours";
import type { ZKPassportAttestation } from "../lib/host";
import { getZKPassportAttestation, isZKPassportVerified } from "../lib/host";
import { fetchJSONFromIPFS } from "../lib/ipfs";
import type { Offer } from "../types/offers";

interface AgentMetadata {
  location?: {
    city?: string;
    country?: string;
    address?: string;
    lat?: number;
    lng?: number;
  };
  workingHours?: {
    schedule?: AgentSchedule;
    timezone?: string;
  };
}

interface AgentInfo {
  wallet: string;
  name: string;
  flatFee: string;
  city: string;
  country: string;
  address: string;
  schedule: AgentSchedule;
  lat: number | null;
  lng: number | null;
  stakedAmount: bigint;
  holdHours: number;
  extraHourFee: bigint;
}

export default function AgentDetail(): JSX.Element {
  const { address } = useParams<{ address: string }>();
  const {
    address: walletAddress,
    nativeCurrency,
    evmDecimals,
  } = useWalletContext();
  const {
    getAllAgents,
    deactivateAgent,
    reactivateAgent,
    removeAgent,
    stakeInsurance,
    unstakeInsurance,
  } = useP2PMarket();
  const { offers } = useOffersContext();
  const navigate = useNavigate();
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [agentActive, setAgentActive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [offersOpen, setOffersOpen] = useState(false);
  const [offerSort, setOfferSort] = useState<{
    key: "fee" | "amount";
    dir: "asc" | "desc";
  }>({ key: "fee", dir: "asc" });
  const [stakeInput, setStakeInput] = useState("");
  const [unstakeInput, setUnstakeInput] = useState("");
  const [isVerified, setIsVerified] = useState(false);
  const [attestation, setAttestation] = useState<ZKPassportAttestation | null>(
    null,
  );

  const loadAgent = useCallback(async () => {
    if (!address) return;

    try {
      setLoading(true);
      const allAgents = await getAllAgents();
      const found = allAgents.find(
        (a: ContractAgent) => a.wallet.toLowerCase() === address.toLowerCase(),
      );

      if (!found) {
        setError("Agent not found");
        return;
      }

      let city = "Unknown";
      let country = "";
      let streetAddress = "";
      let schedule: AgentSchedule = {};
      let lat: number | null = null;
      let lng: number | null = null;

      try {
        const meta = await fetchJSONFromIPFS<AgentMetadata>(found.metadataCID);
        if (meta.location) {
          city = meta.location.city || "Unknown";
          country = meta.location.country || "";
          streetAddress = meta.location.address || "";
          lat =
            typeof meta.location.lat === "number" ? meta.location.lat : null;
          lng =
            typeof meta.location.lng === "number" ? meta.location.lng : null;
        }
        // RegisterAgent writes workingHours.schedule (a {day:{open,close}} map);
        // older docs referenced .days/.hours which never existed on the wire.
        if (meta.workingHours?.schedule) {
          schedule = meta.workingHours.schedule;
        }
      } catch {
        // Metadata fetch failed — leave defaults
      }

      // Check ZK passport status
      try {
        const verified = await isZKPassportVerified(found.wallet);
        setIsVerified(verified);
        if (verified) {
          const att = await getZKPassportAttestation(found.wallet);
          setAttestation(att);
        }
      } catch {
        // ZK passport check failed
      }

      setAgent({
        wallet: found.wallet,
        name: found.name,
        flatFee: found.flatFee.toString(),
        city,
        country,
        address: streetAddress,
        schedule,
        lat,
        lng,
        stakedAmount: found.stakedAmount,
        holdHours: found.holdHours,
        extraHourFee: found.extraHourFee,
      });
      setAgentActive(found.active);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agent");
    } finally {
      setLoading(false);
    }
  }, [address, getAllAgents]);

  useEffect(() => {
    void loadAgent();
  }, [loadAgent]);

  // Filter offers that include this agent
  const agentOffers = address
    ? offers.filter((o) =>
        o.agentAddresses.some((a) => a.toLowerCase() === address.toLowerCase()),
      )
    : [];

  const formatStake = (amount: bigint): string =>
    formatUnits(amount, evmDecimals);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-16 text-center">
        <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4" />
        <p className="text-stone-500 text-sm">Loading agent...</p>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="max-w-4xl mx-auto px-4 md:px-6 py-16 text-center">
        <p className="text-red-400 mb-4">{error || "Agent not found"}</p>
        <Link
          to="/explore/agents"
          className="btn-primary inline-flex items-center gap-1"
        >
          <ChevronLeft className="w-4 h-4" /> Back to agents
        </Link>
      </div>
    );
  }

  const owner = isOwner(walletAddress, agent.wallet);
  const scheduleGroups = groupSchedule(agent.schedule);
  const hasSchedule = scheduleGroups.length > 0;
  const status = agentActive
    ? hasSchedule
      ? getAgentStatus(agent.schedule)
      : { isOpen: false, label: "Hours not set" }
    : { isOpen: false, label: "Inactive" };
  const locationLine = [agent.address, agent.city, agent.country]
    .filter(Boolean)
    .join(", ");
  const mapLocation =
    agent.lat !== null && agent.lng !== null
      ? {
          label: agent.address || agent.city || agent.name,
          address: [agent.city, agent.country].filter(Boolean).join(", "),
          lat: agent.lat,
          lon: agent.lng,
        }
      : null;

  const toggleOfferSort = (key: "fee" | "amount") => {
    setOfferSort((s) =>
      s.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "fee" ? "asc" : "desc" },
    );
  };
  const sortedOffers = [...agentOffers].sort((a, b) => {
    let cmp: number;
    if (offerSort.key === "fee") {
      const fa = a.fee ? parseFloat(a.fee.replace(/\$/g, "")) : 0;
      const fb = b.fee ? parseFloat(b.fee.replace(/\$/g, "")) : 0;
      cmp = fa - fb;
    } else {
      cmp = parseFloat(a.maxAmount) - parseFloat(b.maxAmount);
    }
    return offerSort.dir === "asc" ? cmp : -cmp;
  });

  return (
    <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 md:py-12">
      <Link
        to="/explore/agents"
        className="inline-flex items-center gap-1.5 text-sm text-stone-500 hover:text-stone-300 transition-colors mb-5"
      >
        <ChevronLeft className="w-4 h-4" />
        All agents
      </Link>

      {/* Hero */}
      <div className="rounded-2xl border border-stone-800 bg-stone-900/40 p-5 md:p-6 mb-5">
        <div className="flex items-start gap-4">
          <AgentAvatar name={agent.name} wallet={agent.wallet} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-serif text-2xl text-stone-100 leading-tight">
                {agent.name}
              </h2>
              {isVerified && (
                <VerifiedBadge
                  countryCode={attestation?.countryCode}
                  size="sm"
                />
              )}
              <StatusPill isOpen={status.isOpen} label={status.label} />
            </div>
            {locationLine && (
              <p className="text-stone-400 text-sm mt-1.5 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                <span className="truncate">{locationLine}</span>
              </p>
            )}
            {hasSchedule && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <Clock className="w-3 h-3 text-stone-600 shrink-0" />
                {scheduleGroups.map((g) => (
                  <span key={g.days} className="text-stone-500">
                    <span className="text-stone-400">{g.days}</span>{" "}
                    <span className="mono">
                      {g.open}–{g.close}
                    </span>
                  </span>
                ))}
              </div>
            )}
            <p className="mono text-[11px] text-stone-600 mt-2 truncate select-all">
              {agent.wallet}
            </p>
          </div>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatTile
          icon={DollarSign}
          label="Fee per trade"
          value={`$${agent.flatFee}`}
          sub="paid in cash"
        />
        <StatTile
          icon={Shield}
          label="Insurance"
          value={`${formatStake(agent.stakedAmount)} ${nativeCurrency.symbol}`}
          sub={agent.stakedAmount > 0n ? "staked coverage" : "none staked"}
          tone={agent.stakedAmount > 0n ? "green" : "stone"}
        />
        <StatTile
          icon={Clock}
          label="Hold time"
          value={`${agent.holdHours}h`}
          sub="before late fee"
        />
        <StatTile
          icon={Timer}
          label="Late fee"
          value={`$${agent.extraHourFee.toString()}`}
          sub="per extra hour"
        />
      </div>

      {/* Location map */}
      {mapLocation && (
        <div className="mb-6">
          <AgentLocationCard location={mapLocation} />
        </div>
      )}

      {/* Offers at this location — collapsed by default, compact + sortable */}
      <section>
        <button
          type="button"
          onClick={() => setOffersOpen((v) => !v)}
          aria-expanded={offersOpen}
          className="w-full flex items-center justify-between rounded-2xl border border-stone-800 bg-stone-900/40 px-5 py-3.5 hover:bg-stone-900/60 transition-colors"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-stone-200">
            Offers at this location
            <span className="mono text-[11px] text-stone-500 px-1.5 py-0.5 rounded-md border border-stone-800">
              {agentOffers.length}
            </span>
          </span>
          <ChevronDown
            className={`w-4 h-4 text-stone-500 transition-transform ${
              offersOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {offersOpen &&
          (agentOffers.length === 0 ? (
            <div className="mt-2 rounded-2xl border border-stone-800/80 bg-stone-900/30 text-center py-8">
              <p className="text-stone-500 text-sm">
                No offers listed at this location yet.
              </p>
            </div>
          ) : (
            <div className="mt-2 rounded-2xl border border-stone-800/80 bg-stone-900/30 overflow-hidden">
              <div className="grid grid-cols-[1fr_104px_72px_20px] items-center gap-3 px-4 py-2 border-b border-stone-900 bg-stone-950/40">
                <span className="text-[10px] uppercase tracking-[0.1em] text-stone-500 font-medium">
                  Offer
                </span>
                <OfferSortHeader
                  label="Amount"
                  active={offerSort.key === "amount"}
                  dir={offerSort.dir}
                  onClick={() => toggleOfferSort("amount")}
                />
                <OfferSortHeader
                  label="Fee"
                  active={offerSort.key === "fee"}
                  dir={offerSort.dir}
                  onClick={() => toggleOfferSort("fee")}
                />
                <span />
              </div>
              {sortedOffers.map((offer) => (
                <OfferRow
                  key={offer.id}
                  offer={offer}
                  symbol={nativeCurrency.symbol}
                />
              ))}
            </div>
          ))}
      </section>

      {/* Manage Agent — only visible to agent owner */}
      {owner && (
        <div className="rounded-2xl border border-stone-800 bg-stone-900/40 p-5 md:p-6 mt-8">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-stone-400 uppercase tracking-wider font-medium">
              Manage your agency
            </p>
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${
                agentActive
                  ? "bg-green-900/50 text-green-400"
                  : "bg-stone-700 text-stone-400"
              }`}
            >
              {agentActive ? "Active" : "Inactive"}
            </span>
          </div>

          {actionError && (
            <div className="rounded-lg bg-red-950/50 border border-red-800 text-red-200 px-4 py-3 text-sm mb-4">
              {actionError}
            </div>
          )}

          {/* Insurance stake */}
          <div className="rounded-xl border border-stone-800 bg-stone-950/40 p-4 mb-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-stone-400">Insurance stake</span>
              <span className="mono text-stone-100 font-medium">
                {formatStake(agent.stakedAmount)} {nativeCurrency.symbol}
              </span>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="number"
                  value={stakeInput}
                  onChange={(e) => setStakeInput(e.target.value)}
                  placeholder={`Amount (${nativeCurrency.symbol})`}
                  className="input flex-1 text-sm"
                  min="0"
                  step="any"
                />
                <button
                  onClick={async () => {
                    if (!stakeInput || parseFloat(stakeInput) <= 0) return;
                    setActionLoading(true);
                    setActionError(null);
                    try {
                      await stakeInsurance(stakeInput);
                      setStakeInput("");
                      await loadAgent();
                    } catch (err) {
                      setActionError(
                        err instanceof Error ? err.message : "Failed to stake",
                      );
                    } finally {
                      setActionLoading(false);
                    }
                  }}
                  disabled={
                    actionLoading || !stakeInput || parseFloat(stakeInput) <= 0
                  }
                  className="px-4 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm font-medium hover:bg-green-500/20 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  Add stake
                </button>
              </div>
              <div className="flex items-center gap-2 flex-1">
                <input
                  type="number"
                  value={unstakeInput}
                  onChange={(e) => setUnstakeInput(e.target.value)}
                  placeholder={`Amount (${nativeCurrency.symbol})`}
                  className="input flex-1 text-sm"
                  min="0"
                  step="any"
                />
                <button
                  onClick={async () => {
                    if (!unstakeInput || parseFloat(unstakeInput) <= 0) return;
                    setActionLoading(true);
                    setActionError(null);
                    try {
                      await unstakeInsurance(unstakeInput);
                      setUnstakeInput("");
                      await loadAgent();
                    } catch (err) {
                      setActionError(
                        err instanceof Error
                          ? err.message
                          : "Failed to withdraw",
                      );
                    } finally {
                      setActionLoading(false);
                    }
                  }}
                  disabled={
                    actionLoading ||
                    !unstakeInput ||
                    parseFloat(unstakeInput) <= 0
                  }
                  className="px-4 py-2 rounded-lg bg-stone-800 text-stone-300 text-sm font-medium hover:bg-stone-700 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  Withdraw
                </button>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            <Link
              to={`/register-agent?edit=${address}`}
              className="px-4 py-2 rounded-lg border border-stone-700 text-stone-300 text-sm hover:bg-stone-800 transition-colors"
            >
              Edit info
            </Link>
            {agentActive ? (
              <button
                onClick={async () => {
                  setActionLoading(true);
                  setActionError(null);
                  try {
                    await deactivateAgent();
                    setAgentActive(false);
                  } catch (err) {
                    setActionError(
                      err instanceof Error
                        ? err.message
                        : "Failed to deactivate",
                    );
                  } finally {
                    setActionLoading(false);
                  }
                }}
                disabled={actionLoading}
                className="px-4 py-2 rounded-lg border border-amber-800 text-amber-400 text-sm hover:bg-amber-950/50 transition-colors disabled:opacity-50"
              >
                {actionLoading ? "Processing..." : "Deactivate"}
              </button>
            ) : (
              <button
                onClick={async () => {
                  setActionLoading(true);
                  setActionError(null);
                  try {
                    await reactivateAgent();
                    setAgentActive(true);
                  } catch (err) {
                    setActionError(
                      err instanceof Error
                        ? err.message
                        : "Failed to reactivate",
                    );
                  } finally {
                    setActionLoading(false);
                  }
                }}
                disabled={actionLoading}
                className="px-4 py-2 rounded-lg border border-green-800 text-green-400 text-sm hover:bg-green-950/50 transition-colors disabled:opacity-50"
              >
                {actionLoading ? "Processing..." : "Reactivate"}
              </button>
            )}
            <button
              onClick={async () => {
                const stakeInfo =
                  agent.stakedAmount > 0n
                    ? ` Your staked insurance (${formatStake(agent.stakedAmount)} ${nativeCurrency.symbol}) will be refunded.`
                    : "";
                if (
                  !confirm(
                    `Permanently remove this agent? This cleans all offer links and cannot be undone.${stakeInfo}`,
                  )
                )
                  return;
                setActionLoading(true);
                setActionError(null);
                try {
                  await removeAgent();
                  navigate("/explore/agents");
                } catch (err) {
                  setActionError(
                    err instanceof Error ? err.message : "Failed to remove",
                  );
                } finally {
                  setActionLoading(false);
                }
              }}
              disabled={actionLoading}
              className="ml-auto px-4 py-2 rounded-lg border border-red-800 text-red-400 text-sm hover:bg-red-950/50 transition-colors disabled:opacity-50"
            >
              {actionLoading ? "Processing..." : "Remove permanently"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Offers: sortable header + compact row ──────────────────────────────────

function OfferSortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-end gap-1 text-[10px] font-medium uppercase tracking-[0.1em] ${
        active ? "text-stone-300" : "text-stone-500 hover:text-stone-300"
      }`}
    >
      {label}
      {active && (
        <ChevronDown
          className={`h-3 w-3 transition-transform ${dir === "asc" ? "rotate-180" : ""}`}
        />
      )}
    </button>
  );
}

function OfferRow({
  offer,
  symbol,
}: {
  offer: Offer;
  symbol: string;
}): JSX.Element {
  const selling = offer.role === "seller";
  return (
    <Link
      to={`/offer/${offer.id}`}
      className="grid grid-cols-[1fr_104px_72px_20px] items-center gap-3 px-4 py-3 text-sm border-t border-stone-900 hover:bg-stone-900/60 transition-colors group"
    >
      <div className="min-w-0 flex items-center gap-2">
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 ${
            selling
              ? "bg-green-500/15 text-green-400"
              : "bg-amber-500/15 text-amber-400"
          }`}
        >
          {selling ? "Sell" : "Buy"}
        </span>
        <span className="text-stone-200 truncate">{offer.alias}</span>
        {offer.city && (
          <span className="text-stone-600 text-xs truncate hidden sm:inline">
            · {offer.city}
          </span>
        )}
      </div>
      <span className="mono text-xs text-stone-300 text-right tabular-nums">
        {offer.minAmount}–{offer.maxAmount}
        <span className="text-stone-600"> {symbol}</span>
      </span>
      <span className="mono text-xs text-stone-300 text-right">
        {offer.fee ?? "—"}
      </span>
      <ChevronRight className="w-4 h-4 text-stone-600 group-hover:text-stone-400" />
    </Link>
  );
}
