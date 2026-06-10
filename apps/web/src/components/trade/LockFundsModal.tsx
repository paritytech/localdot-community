import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";

import { useWalletContext } from "../../context/WalletContext";
import { useEscrow } from "../../hooks/useEscrow";
import { Spinner } from "../common/Spinner";

export interface LockFundsModalProps {
  open: boolean;
  onClose: () => void;
  /** Called after successful lock with the on-chain tradeId result */
  onLocked?: (txHash: string) => void;
  /** Counterparty SS58 address: they'll receive funds on confirm */
  counterpartyAddress: string;
  /** Optional agent address (zero address for direct trade) */
  agentAddress?: string;
  /** Offer ID this lock is associated with (0 for ad-hoc) */
  offerId: bigint;
  /** Amount to lock (human-readable, e.g. "10.5") */
  amount: string;
  /** Currency label for display (e.g. "USD") */
  currency: string;
  /** Native token symbol used by the active chain (from wallet context). */
  nativeSymbol: string;
  /** Header — defaults to "Accept & Lock Funds". */
  title?: string;
  /** Sub-header — defaults to "Accept this trade request". */
  subtitle?: string;
}

export default function LockFundsModal({
  open,
  onClose,
  onLocked,
  counterpartyAddress,
  agentAddress,
  offerId,
  amount,
  currency,
  nativeSymbol,
  title = "Accept & Lock Funds",
  subtitle = "Accept this trade request",
}: LockFundsModalProps): JSX.Element | null {
  const { isConnected } = useWalletContext();
  const { lockTrade } = useEscrow();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleLock = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const result = await lockTrade({
        counterparty: counterpartyAddress,
        offerId,
        agent: agentAddress ?? "",
        amount,
      });
      onLocked?.(result.txHash);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lock failed");
    } finally {
      setSubmitting(false);
    }
  };

  const counterpartyShort =
    counterpartyAddress.slice(0, 6) + "\u2026" + counterpartyAddress.slice(-4);

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center"
      onClick={submitting ? undefined : onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-stone-900 border border-stone-700/80 rounded-t-2xl sm:rounded-2xl w-full max-w-md overflow-hidden shadow-2xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-5 pb-2 flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-4.5 h-4.5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-base font-medium text-stone-100">{title}</h3>
              <p className="text-xs text-stone-500">{subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="text-stone-500 hover:text-stone-300 transition-colors p-1 -mr-1 disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Info */}
        <div className="mx-6 my-4 px-4 py-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
          <p className="text-xs text-amber-300/90 leading-relaxed">
            By locking, you accept this trade request. Your tokens will be held
            in escrow until the agent confirms the buyer&apos;s cash, then
            released to the buyer.{" "}
            <span className="text-amber-200">
              You collect cash from the agent after.
            </span>
          </p>
        </div>

        {/* Summary */}
        <div className="mx-6 mb-4 rounded-xl bg-stone-800/60 border border-stone-700/50 divide-y divide-stone-800">
          <Row label="Amount to lock">
            <span className="mono text-base text-stone-100">
              {amount} {nativeSymbol}
            </span>
          </Row>
          <Row label="Counterparty">
            <span className="mono text-xs text-stone-300">
              {counterpartyShort}
            </span>
          </Row>
          {agentAddress && (
            <Row label="Agent">
              <span className="mono text-xs text-stone-300">
                {agentAddress.slice(0, 6) + "\u2026" + agentAddress.slice(-4)}
              </span>
            </Row>
          )}
          <Row label="Currency">
            <span className="text-xs text-stone-300">{currency}</span>
          </Row>
        </div>

        {error && (
          <div className="mx-6 mb-3 px-3 py-2 rounded-lg bg-red-900/20 border border-red-800/40 text-xs text-red-300">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="px-6 pb-6 pt-1 flex gap-2">
          <button
            className="flex-1 py-3 rounded-xl text-sm border border-stone-700 bg-stone-800/40 text-stone-300 hover:bg-stone-800 transition-colors disabled:opacity-40"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            className="flex-1 py-3 rounded-xl text-sm font-semibold bg-amber-500 text-stone-900 hover:bg-amber-400 transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
            disabled={!isConnected || submitting}
            onClick={handleLock}
          >
            {submitting ? (
              <>
                <Spinner size="sm" inline /> Locking...
              </>
            ) : (
              "Accept & Lock"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-xs text-stone-500">{label}</span>
      {children}
    </div>
  );
}
