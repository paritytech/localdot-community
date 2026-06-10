/**
 * ProviderPickupFlow — provider's screen for picking up cash from the agent.
 *
 * One screen, not a wizard: the provider shows their signed QR (so the agent
 * can scan it and see how much cash to hand over) and, once they have the
 * cash, swipes to confirm pickup on the same screen. "Cancel" always dismisses
 * the whole flow — there is no hidden step that the close button jumps into.
 *
 * If the agent's hold window has expired, an inline "late fee accruing" notice
 * appears — there's no on-chain claim, just go collect.
 */

import { useCallback, useState } from "react";

import type { ContractTrade } from "../../hooks/useEscrow";
import { useEscrow } from "../../hooks/useEscrow";
import { SwipeConfirm } from "./SwipeConfirm";
import { TradeQRCode } from "./TradeQRCode";

interface ProviderPickupFlowProps {
  trade: ContractTrade;
  symbol: string;
  amount: string;
  onClose: () => void;
  onTradeUpdated?: () => void;
}

export function ProviderPickupFlow({
  trade,
  symbol,
  amount,
  onClose,
  onTradeUpdated,
}: ProviderPickupFlowProps): JSX.Element {
  const { confirmPickup } = useEscrow();

  const [step, setStep] = useState<"show" | "processing" | "done" | "error">(
    "show",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const pickupDeadline = Number(trade.pickupDeadline) * 1000;
  const isDeadlinePassed = pickupDeadline > 0 && Date.now() > pickupDeadline;

  const handleConfirmPickup = useCallback(async () => {
    setStep("processing");
    try {
      await confirmPickup(trade.id);
      onTradeUpdated?.();
      setStep("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Transaction failed");
      setStep("error");
    }
  }, [trade.id, confirmPickup, onTradeUpdated]);

  if (step === "show") {
    return (
      <div className="fixed inset-0 z-[2000] bg-stone-950 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800">
          <h2 className="text-sm font-medium text-stone-300">
            Pickup Cash from Agent
          </h2>
          <button
            onClick={onClose}
            className="text-stone-500 hover:text-stone-300 transition-colors text-sm"
          >
            Cancel
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col items-center">
          <div className="w-full max-w-sm flex flex-col items-center">
            <p className="text-stone-400 text-sm text-center mb-5">
              Show this code to the agent so they know how much to hand you.
              Once you have your cash, swipe to confirm.
            </p>

            <TradeQRCode
              embedded
              tradeId={trade.id.toString()}
              role="provider"
              amount={amount}
              symbol={symbol}
              onClose={onClose}
            />

            <div className="w-full border-t border-stone-800 my-6" />

            <p className="text-stone-400 text-xs text-center mb-3">
              I&apos;ve collected my cash from the agent
            </p>
            <div className="w-full">
              <SwipeConfirm
                label={`Confirm pickup — ${amount} ${symbol}`}
                onConfirm={() => void handleConfirmPickup()}
                variant="success"
              />
            </div>

            {isDeadlinePassed && (
              <div className="mt-6 w-full">
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 text-center">
                  <p className="text-amber-300 text-sm font-medium mb-1">
                    Hold window has passed
                  </p>
                  <p className="text-amber-300/70 text-xs">
                    An extra-hour fee is accruing in cash. Confirm pickup as
                    soon as you reach the agent.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (step === "processing") {
    return (
      <div className="fixed inset-0 z-[2000] bg-stone-950 flex flex-col items-center justify-center">
        <div className="h-8 w-8 border-2 border-white/30 border-t-white rounded-full animate-spin mb-4" />
        <p className="text-stone-300 text-lg mb-2">Processing...</p>
        <p className="text-stone-500 text-sm">
          Confirm the transaction in your wallet
        </p>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="fixed inset-0 z-[2000] bg-stone-950 flex flex-col items-center justify-center">
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-green-400"
          >
            <path d="M9 12l2 2 4-4" />
            <circle cx="12" cy="12" r="10" />
          </svg>
        </div>
        <p className="text-stone-200 text-lg mb-2">Trade Complete</p>
        <p className="text-stone-500 text-sm mb-6">
          Collect your cash from the agent
        </p>
        <button
          onClick={onClose}
          className="px-6 py-2.5 rounded-xl bg-stone-100 text-stone-900 text-sm font-medium hover:bg-white transition-colors"
        >
          Done
        </button>
      </div>
    );
  }

  // Error
  return (
    <div className="fixed inset-0 z-[2000] bg-stone-950 flex flex-col items-center justify-center">
      <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-red-400"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      </div>
      <p className="text-stone-200 text-lg mb-2">Error</p>
      <p className="text-stone-400 text-sm mb-6">{errorMsg}</p>
      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="px-6 py-2.5 rounded-xl bg-stone-800 text-stone-200 text-sm font-medium hover:bg-stone-700 transition-colors"
        >
          Close
        </button>
        <button
          onClick={() => {
            setErrorMsg(null);
            setStep("show");
          }}
          className="px-6 py-2.5 rounded-xl bg-stone-100 text-stone-900 text-sm font-medium hover:bg-white transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
