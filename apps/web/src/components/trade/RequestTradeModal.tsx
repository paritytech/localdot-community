import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";

import { useWalletContext } from "../../context/WalletContext";
import {
  type PublishStep,
  useTradeRequests,
} from "../../hooks/useTradeRequests";
import { getGeolocation } from "../../lib/host";
import type { OfferAgentInfo } from "../../lib/offer-agents";
import { Spinner } from "../common/Spinner";

/** Friendly label per publish step — shown next to the spinner. */
const STEP_LABEL: Record<PublishStep, string> = {
  "requesting-allowance": "Requesting allowance…",
  "allowance-ok": "Allowance granted",
  "requesting-permission": "Asking permission…",
  "permission-ok": "Permission granted",
  "creating-proof": "Signing request…",
  "proof-ok": "Signed",
  submitting: "Sending…",
  submitted: "Sent",
  error: "Failed",
};

export interface RequestTradeProps {
  open: boolean;
  onClose: () => void;
  offerAgents?: OfferAgentInfo[];
  agentsLoading?: boolean;
  prefill?: {
    providerAddress?: string;
    offerId?: string;
    agentAddress?: string;
    agentName?: string;
    amount?: string;
    fiatCurrency?: string;
    providerFee?: string;
    offerLat?: number;
    offerLon?: number;
    /** Offer's role — drives the "you'll need to lock tokens" hint. */
    offerRole?: "seller" | "buyer";
  };
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function RequestTradeModal({
  open,
  onClose,
  offerAgents,
  agentsLoading,
  prefill,
}: RequestTradeProps) {
  const { isConnected } = useWalletContext();
  const { sendRequest, ready: ssReady, error: ssError } = useTradeRequests();

  const [selectedAgent, setSelectedAgent] = useState(
    prefill?.agentAddress ?? "",
  );
  const [amount, setAmount] = useState(prefill?.amount ?? "");
  const [notes, setNotes] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [step, setStep] = useState<PublishStep | null>(null);
  const [pickerExpanded, setPickerExpanded] = useState(false);
  const [myLocation, setMyLocation] = useState<{
    lat: number;
    lon: number;
  } | null>(null);

  const agents = offerAgents ?? [];
  const hasPreselected = !!(
    prefill?.agentAddress &&
    (agents.find(
      (a) => a.wallet.toLowerCase() === prefill.agentAddress!.toLowerCase(),
    ) ||
      prefill.agentName)
  );

  useEffect(() => {
    if (open && !myLocation) {
      void getGeolocation({ timeout: 5000 })
        .then((pos: GeolocationPosition) =>
          setMyLocation({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
          }),
        )
        .catch(() => {});
    }
  }, [open, myLocation]);

  useEffect(() => {
    if (open) {
      setSent(false);
      setPickerExpanded(!hasPreselected);
    }
  }, [open, hasPreselected]);

  useEffect(() => {
    if (prefill?.agentAddress) setSelectedAgent(prefill.agentAddress);
    if (prefill?.amount) setAmount(prefill.amount);
  }, [prefill]);

  if (!open) return null;

  const currency = prefill?.fiatCurrency ?? "USD";
  const providerShort = prefill?.providerAddress
    ? `${prefill.providerAddress.slice(0, 6)}\u2026${prefill.providerAddress.slice(-4)}`
    : "";
  const currentAgent = agents.find(
    (a) => a.wallet.toLowerCase() === selectedAgent.toLowerCase(),
  );
  const displayName = currentAgent?.name ?? prefill?.agentName;

  function distLabel(agent: OfferAgentInfo): string | null {
    if (!myLocation || agent.lat == null || agent.lon == null) return null;
    const d = haversineKm(myLocation.lat, myLocation.lon, agent.lat, agent.lon);
    return d < 1 ? `${Math.round(d * 1000)}m` : `${d.toFixed(1)}km`;
  }

  const currencySymbol = "$";

  const handleSend = async () => {
    if (!prefill?.providerAddress || !prefill?.offerId) {
      setSendError("Missing provider or offer info");
      return;
    }
    setSendError(null);
    setStep(null);
    setSending(true);
    try {
      await sendRequest(
        {
          to: prefill.providerAddress,
          offerId: prefill.offerId,
          amount,
          currency,
          agent: selectedAgent || undefined,
          note: notes || undefined,
        },
        {
          onProgress: (s) => setStep(s),
        },
      );
      setSent(true);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
      setStep(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-stone-900 border border-stone-700/80 rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto shadow-2xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        {sent ? (
          <div className="px-8 py-14 text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/10 border-2 border-green-500/30 flex items-center justify-center mx-auto mb-5">
              <Check className="w-8 h-8 text-green-400" strokeWidth={2} />
            </div>
            <p className="text-lg text-stone-100 font-medium mb-1">
              Request sent
            </p>
            <p className="text-sm text-stone-400 mb-8">
              The provider (<span className="mono">{providerShort}</span>) will
              be notified.
            </p>
            <button
              onClick={onClose}
              className="btn-primary text-sm px-10 py-2.5"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-6 pt-6 pb-1 flex items-start justify-between">
              <div>
                <h3 className="text-lg font-medium text-stone-100">
                  Request Trade
                </h3>
                <p className="text-sm text-stone-500 mt-0.5">
                  Offer #{prefill?.offerId} · to{" "}
                  <span className="mono text-stone-400">{providerShort}</span>
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-stone-500 hover:text-stone-300 transition-colors p-1.5 -mr-1.5 rounded-lg hover:bg-stone-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Amount */}
            <div className="px-6 py-5">
              <div className="rounded-2xl bg-stone-800/60 border border-stone-700/50 px-5 py-5">
                <p className="text-xs text-stone-500 uppercase tracking-wider mb-3">
                  You want to trade
                </p>
                <div className="flex items-baseline gap-3">
                  <input
                    type="text"
                    inputMode="numeric"
                    className="bg-transparent border-none outline-none mono text-4xl text-stone-100 w-full placeholder:text-stone-700 caret-amber-400"
                    placeholder="0"
                    value={amount}
                    onChange={(e) =>
                      setAmount(e.target.value.replace(/[^0-9.,]/g, ""))
                    }
                    autoFocus
                  />
                  <span className="text-xl text-stone-500 flex-shrink-0 font-medium">
                    {currency}
                  </span>
                </div>
              </div>
            </div>

            {/* Agent section */}
            <div className="px-6 pb-5">
              <p className="text-xs text-stone-500 uppercase tracking-wider mb-3">
                Meet at agent
              </p>

              {agentsLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Spinner size="sm" inline />
                  <span className="text-xs text-stone-500 ml-2">
                    Loading agents...
                  </span>
                </div>
              ) : !pickerExpanded && selectedAgent && displayName ? (
                /* Compact pre-selected agent */
                <div className="rounded-2xl bg-stone-800/60 border border-stone-700/50 p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-stone-700 border border-stone-600 flex items-center justify-center flex-shrink-0">
                      <span className="mono text-sm text-stone-300">
                        {displayName.slice(0, 2)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-stone-100">
                          {displayName}
                        </span>
                        {currentAgent?.city && (
                          <span className="text-xs text-stone-500">
                            {currentAgent.city}
                          </span>
                        )}
                        {currentAgent &&
                          (() => {
                            const d = distLabel(currentAgent);
                            return d ? (
                              <span className="text-xs text-amber-400/80">
                                {d} away
                              </span>
                            ) : null;
                          })()}
                      </div>
                      {currentAgent && (
                        <div className="flex items-center gap-2 mt-1 text-[12px]">
                          <span className="mono text-stone-400">
                            {currencySymbol}
                            {currentAgent.flatFee} fee
                          </span>
                          {currentAgent.closeTime && (
                            <span className="text-green-400/80 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                              Open until {currentAgent.closeTime}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    className="mt-3 text-xs text-stone-500 hover:text-stone-300 transition-colors underline underline-offset-2 decoration-stone-700"
                    onClick={() => setPickerExpanded(true)}
                  >
                    Choose different agent or go direct
                  </button>
                </div>
              ) : (
                /* Full agent picker */
                <div className="space-y-2">
                  <AgentRadio
                    selected={!selectedAgent}
                    onClick={() => {
                      setSelectedAgent("");
                      setPickerExpanded(false);
                    }}
                    name="Direct trade"
                    subtitle="Meet the provider directly, no middleman"
                    distance={(() => {
                      if (
                        !myLocation ||
                        prefill?.offerLat == null ||
                        prefill?.offerLon == null
                      )
                        return undefined;
                      const d = haversineKm(
                        myLocation.lat,
                        myLocation.lon,
                        prefill.offerLat,
                        prefill.offerLon,
                      );
                      return d < 1
                        ? `${Math.round(d * 1000)}m away`
                        : `${d.toFixed(1)}km away`;
                    })()}
                  />
                  {agents.map((a) => {
                    const active =
                      selectedAgent.toLowerCase() === a.wallet.toLowerCase();
                    const d = distLabel(a);
                    return (
                      <AgentRadio
                        key={a.wallet}
                        selected={active}
                        onClick={() => {
                          setSelectedAgent(a.wallet);
                          setPickerExpanded(false);
                        }}
                        name={a.name}
                        city={a.city}
                        fee={`${currencySymbol}${a.flatFee}`}
                        distance={d ? `${d} away` : undefined}
                        openUntil={a.closeTime}
                      />
                    );
                  })}
                  {agents.length === 0 && (
                    <p className="text-xs text-stone-500 px-1 py-2">
                      This offer has no linked agents. Direct trade only.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Note */}
            <div className="px-6 pb-5">
              <p className="text-xs text-stone-500 uppercase tracking-wider mb-2">
                Note{" "}
                <span className="normal-case text-stone-600">(optional)</span>
              </p>
              <textarea
                className="w-full rounded-xl bg-stone-800/60 border border-stone-700/50 px-4 py-3 text-sm text-stone-200 placeholder:text-stone-600 resize-none outline-none focus:border-stone-500 transition-colors"
                rows={2}
                placeholder="e.g. Can we meet at 6pm near the square?"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 pt-2 border-t border-stone-800/60">
              {(prefill?.providerFee || currentAgent) && (
                <div className="py-3 mb-4 border-b border-stone-800/40 space-y-2">
                  {prefill?.providerFee && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-stone-500">Provider fee</span>
                      <span className="mono text-stone-300">
                        {prefill.providerFee}
                      </span>
                    </div>
                  )}
                  {currentAgent && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-stone-500">Agent fee</span>
                      <span className="mono text-stone-300">
                        {currencySymbol}
                        {currentAgent.flatFee}
                      </span>
                    </div>
                  )}
                </div>
              )}
              {prefill?.offerRole === "buyer" && (
                <div className="mb-3 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 leading-relaxed">
                  Heads up — once the provider accepts, you'll need to lock your
                  tokens within 1h to start the trade.
                </div>
              )}
              {(sendError || ssError) && (
                <div className="mb-3 px-3 py-2 rounded-lg bg-red-900/20 border border-red-800/40 text-xs text-red-300">
                  {sendError ?? ssError}
                </div>
              )}
              <button
                className="w-full py-3.5 rounded-xl bg-stone-100 text-stone-900 text-sm font-semibold hover:bg-white transition-colors disabled:opacity-30 disabled:hover:bg-stone-100 flex items-center justify-center gap-2.5"
                disabled={!amount || !isConnected || !ssReady || sending}
                onClick={handleSend}
              >
                {!isConnected ? (
                  "Connect wallet to send"
                ) : !ssReady ? (
                  <>
                    <Spinner size="sm" inline /> Connecting...
                  </>
                ) : sending ? (
                  <>
                    <Spinner size="sm" inline />{" "}
                    {step ? STEP_LABEL[step] : "Sending…"}
                  </>
                ) : (
                  <>
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
                      />
                    </svg>
                    Send Request
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AgentRadio({
  selected,
  onClick,
  name,
  subtitle,
  city,
  fee,
  distance,
  openUntil,
}: {
  selected: boolean;
  onClick: () => void;
  name: string;
  subtitle?: string;
  city?: string;
  fee?: string;
  distance?: string;
  openUntil?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl border text-left transition-all ${
        selected
          ? "border-stone-500 bg-stone-800 shadow-sm shadow-stone-800/50"
          : "border-stone-700/50 bg-stone-800/30 hover:border-stone-600 hover:bg-stone-800/50"
      }`}
    >
      <div
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${selected ? "border-stone-100" : "border-stone-600"}`}
      >
        {selected && <div className="w-2.5 h-2.5 rounded-full bg-stone-100" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-stone-200">{name}</span>
          {city && <span className="text-xs text-stone-500">{city}</span>}
          {distance && (
            <span className="text-xs text-amber-400/80">{distance}</span>
          )}
        </div>
        {subtitle && (
          <p className="text-[12px] text-stone-500 mt-0.5">{subtitle}</p>
        )}
        {(fee || openUntil) && (
          <div className="flex items-center gap-2.5 mt-1">
            {fee && (
              <span className="mono text-[12px] text-stone-400">{fee} fee</span>
            )}
            {openUntil && (
              <span className="text-[12px] text-green-400/80 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                Open until {openUntil}
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );
}
