import { formatUnits } from "ethers";
import { Clock, DollarSign, Shield, Timer } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import type { ContractAgent } from "../../../hooks/useP2PMarket";
import { AgentAvatar, StatTile, StatusPill } from "../../agents/AgentVisuals";

export function AgencyTab({
  agent,
  decimals,
  symbol,
  onStake,
  onUnstake,
  onDeactivate,
  onReactivate,
  onRemove,
}: {
  agent: ContractAgent;
  decimals: number;
  symbol: string;
  onStake: (amount: string) => Promise<void>;
  onUnstake: (amount: string) => Promise<void>;
  onDeactivate: () => Promise<void>;
  onReactivate: () => Promise<void>;
  onRemove: () => Promise<void>;
}): JSX.Element {
  const [stakeInput, setStakeInput] = useState("");
  const [unstakeInput, setUnstakeInput] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const stakeDisplay = parseFloat(
    formatUnits(agent.stakedAmount, decimals),
  ).toLocaleString(undefined, { maximumFractionDigits: 2 });
  const hasStake = agent.stakedAmount > 0n;

  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="rounded-2xl border border-stone-800 bg-stone-900/40 p-5 md:p-6">
        <div className="flex items-start gap-4">
          <AgentAvatar name={agent.name} wallet={agent.wallet} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-serif text-2xl text-stone-100 leading-tight truncate">
                {agent.name}
              </h3>
              <StatusPill
                isOpen={agent.active}
                label={agent.active ? "Active" : "Inactive"}
              />
            </div>
            <p className="text-stone-500 text-xs mt-1.5">
              Your exchange agency
            </p>
            <Link
              to={`/agent/${agent.wallet}`}
              className="inline-flex items-center gap-1 text-xs text-stone-400 hover:text-stone-200 transition-colors mt-2"
            >
              View public page →
            </Link>
          </div>
        </div>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          icon={DollarSign}
          label="Fee per trade"
          value={`$${agent.flatFee.toString()}`}
          sub="paid in cash"
        />
        <StatTile
          icon={Shield}
          label="Insurance"
          value={`${stakeDisplay} ${symbol}`}
          sub={hasStake ? "staked coverage" : "none staked"}
          tone={hasStake ? "green" : "stone"}
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

      {actionError && (
        <div className="rounded-lg bg-red-950/50 border border-red-800 text-red-200 px-4 py-3 text-sm">
          {actionError}
        </div>
      )}

      {/* Insurance management */}
      <div className="rounded-2xl border border-stone-800 bg-stone-900/40 p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-stone-400">Insurance stake</span>
          <span className="mono text-stone-100 font-medium">
            {stakeDisplay} {symbol}
          </span>
        </div>
        {!hasStake && (
          <p className="text-xs text-amber-400/80 mb-3">
            No insurance staked. Providers may prefer agents with coverage.
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2 flex-1">
            <input
              type="number"
              value={stakeInput}
              onChange={(e) => setStakeInput(e.target.value)}
              placeholder={`Amount (${symbol})`}
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
                  await onStake(stakeInput);
                  setStakeInput("");
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
              placeholder={`Amount (${symbol})`}
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
                  await onUnstake(unstakeInput);
                  setUnstakeInput("");
                } catch (err) {
                  setActionError(
                    err instanceof Error ? err.message : "Failed to withdraw",
                  );
                } finally {
                  setActionLoading(false);
                }
              }}
              disabled={
                actionLoading || !unstakeInput || parseFloat(unstakeInput) <= 0
              }
              className="px-4 py-2 rounded-lg bg-stone-800 text-stone-300 text-sm font-medium hover:bg-stone-700 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              Withdraw
            </button>
          </div>
        </div>
      </div>

      {/* Status + danger zone */}
      <div className="rounded-2xl border border-stone-800 bg-stone-900/40 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-stone-400 uppercase tracking-wider font-medium mb-1">
              Agency status
            </p>
            <p className="text-xs text-stone-500 max-w-md">
              {agent.active
                ? "Active and visible to providers. Deactivate to stop receiving new offers — existing trades continue."
                : "Inactive — you won't receive new offers. Reactivate to become visible again."}
            </p>
          </div>
          {agent.active ? (
            <button
              onClick={async () => {
                setActionLoading(true);
                setActionError(null);
                try {
                  await onDeactivate();
                } catch (err) {
                  setActionError(
                    err instanceof Error ? err.message : "Failed to deactivate",
                  );
                } finally {
                  setActionLoading(false);
                }
              }}
              disabled={actionLoading}
              className="shrink-0 px-4 py-2 rounded-lg border border-amber-800 text-amber-400 text-sm hover:bg-amber-950/50 transition-colors disabled:opacity-50"
            >
              {actionLoading ? "Processing..." : "Deactivate"}
            </button>
          ) : (
            <button
              onClick={async () => {
                setActionLoading(true);
                setActionError(null);
                try {
                  await onReactivate();
                } catch (err) {
                  setActionError(
                    err instanceof Error ? err.message : "Failed to reactivate",
                  );
                } finally {
                  setActionLoading(false);
                }
              }}
              disabled={actionLoading}
              className="shrink-0 px-4 py-2 rounded-lg border border-green-800 text-green-400 text-sm hover:bg-green-950/50 transition-colors disabled:opacity-50"
            >
              {actionLoading ? "Processing..." : "Reactivate"}
            </button>
          )}
        </div>

        <div className="pt-4 border-t border-stone-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-xs text-stone-500 max-w-md">
            Permanently remove your agency registration.
            {hasStake &&
              ` Your staked insurance (${stakeDisplay} ${symbol}) will be refunded.`}
          </p>
          <button
            onClick={async () => {
              if (
                !confirm(
                  "Permanently remove your agency? This cleans all offer links and cannot be undone.",
                )
              )
                return;
              setActionLoading(true);
              setActionError(null);
              try {
                await onRemove();
              } catch (err) {
                setActionError(
                  err instanceof Error ? err.message : "Failed to remove",
                );
                setActionLoading(false);
              }
            }}
            disabled={actionLoading}
            className="shrink-0 px-4 py-2 rounded-lg border border-red-800 text-red-400 text-sm hover:bg-red-950/50 transition-colors disabled:opacity-50"
          >
            {actionLoading ? "Processing..." : "Remove agency"}
          </button>
        </div>
      </div>
    </div>
  );
}
