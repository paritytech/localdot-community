type TradeState =
  | "LOCKED"
  | "RELEASED"
  | "COMPLETED"
  | "REFUNDED"
  | "CANCELLED";

interface EscrowStampBarProps {
  state: TradeState;
  fundedAt?: number;
  compact?: boolean;
  hasAgent?: boolean;
}

const STEPS_DIRECT = [
  { key: "LOCKED", label: "Locked", sublabel: "Tokens in escrow" },
  { key: "COMPLETED", label: "Completed", sublabel: "Trade done" },
] as const;

const STEPS_AGENT = [
  { key: "LOCKED", label: "Locked", sublabel: "Tokens in escrow" },
  { key: "RELEASED", label: "Released", sublabel: "Tokens to buyer" },
  { key: "COMPLETED", label: "Completed", sublabel: "Trade done" },
] as const;

const STATE_ORDER: Record<string, number> = {
  LOCKED: 0,
  RELEASED: 1,
  COMPLETED: 2,
  REFUNDED: 2,
  CANCELLED: 2,
};

function stepColor(
  stepKey: string,
  currentState: TradeState,
): "complete" | "active" | "pending" | "refunded" {
  const currentIdx = STATE_ORDER[currentState] ?? 0;
  const stepIdx = STATE_ORDER[stepKey] ?? 0;

  if (
    (currentState === "REFUNDED" || currentState === "CANCELLED") &&
    stepKey === "COMPLETED"
  ) {
    return "refunded";
  }
  if (stepIdx < currentIdx) return "complete";
  if (stepIdx === currentIdx) return "active";
  return "pending";
}

export function EscrowStampBar({
  state,
  fundedAt,
  compact,
  hasAgent,
}: EscrowStampBarProps): JSX.Element {
  const steps = hasAgent ? STEPS_AGENT : STEPS_DIRECT;
  const isTerminal = state === "REFUNDED" || state === "CANCELLED";

  return (
    <div className={compact ? "" : "py-2"}>
      <div className="flex items-center gap-0">
        {steps.map((step, i) => {
          const status = stepColor(step.key, state);
          const isLast = i === steps.length - 1;
          const showAlt = isLast && isTerminal;

          return (
            <div key={step.key} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-shrink-0">
                <div
                  className={`
                    flex items-center justify-center rounded-full transition-all duration-300
                    ${compact ? "w-8 h-8" : "w-10 h-10"}
                    ${
                      status === "complete"
                        ? "bg-stone-100"
                        : status === "active"
                          ? showAlt
                            ? "bg-stone-600"
                            : step.key === "LOCKED"
                              ? "bg-amber-500"
                              : step.key === "RELEASED"
                                ? "bg-blue-500"
                                : "bg-green-500"
                          : "bg-stone-800 border-2 border-stone-700"
                    }
                  `}
                >
                  {status === "complete" ? (
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path
                        d="M3 7l3 3 5-5"
                        stroke="#1c1917"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : status === "active" ? (
                    <div
                      className={`rounded-full bg-white ${compact ? "w-2 h-2" : "w-2.5 h-2.5"}`}
                    />
                  ) : (
                    <div
                      className={`rounded-full bg-stone-600 ${compact ? "w-1.5 h-1.5" : "w-2 h-2"}`}
                    />
                  )}
                </div>
                {!compact && (
                  <div className="mt-2 text-center">
                    <p
                      className={`text-xs font-medium ${
                        status === "active"
                          ? showAlt
                            ? "text-stone-400"
                            : "text-stone-100"
                          : status === "complete"
                            ? "text-stone-100"
                            : "text-stone-500"
                      }`}
                    >
                      {showAlt
                        ? state === "REFUNDED"
                          ? "Refunded"
                          : "Cancelled"
                        : step.label}
                    </p>
                    <p className="text-[11px] text-stone-500 mt-0.5">
                      {showAlt ? "Funds returned" : step.sublabel}
                    </p>
                  </div>
                )}
              </div>
              {!isLast && (
                <div className="flex-1 mx-2">
                  <div
                    className={`h-[2px] rounded-full transition-colors duration-300 ${
                      (STATE_ORDER[state] ?? 0) > i
                        ? "bg-stone-100"
                        : "bg-stone-700"
                    }`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {state === "LOCKED" && fundedAt && !compact && (
        <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-900/20 border border-amber-800/30">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          <span className="text-xs text-amber-400">
            Awaiting confirmation. Timeout in{" "}
            <span className="mono font-medium">
              {formatTimeRemaining(fundedAt)}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

function formatTimeRemaining(fundedAt: number): string {
  const TIMEOUT_MS = 24 * 60 * 60 * 1000;
  const elapsed = Date.now() - fundedAt;
  const remaining = Math.max(0, TIMEOUT_MS - elapsed);
  const hours = Math.floor(remaining / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours}h ${minutes}m`;
}
