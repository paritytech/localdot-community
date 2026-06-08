/**
 * TradeQRCode — generates a signed QR code for buyer/provider to show the agent.
 *
 * Security:
 * - The QR is signed off-chain by the host wallet (no fee, no chain).
 * - Agent verifies the signature against the on-chain trade participant address,
 *   so a fake QR with a copied tradeId is rejected.
 * - QR expires after TRADE_QR_TTL_SECONDS (default 5 min).
 */

import { Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";

import { getSignerAndAddress } from "../../context/WalletContext";
import { useEscrow } from "../../hooks/useEscrow";
import { signTradeQR, TRADE_QR_TTL_SECONDS } from "../../lib/trade-qr";
import { EvidenceRecorder } from "./EvidenceRecorder";

interface TradeQRCodeProps {
  tradeId: string; // bigint as string
  role: "buyer" | "provider";
  amount: string;
  symbol: string;
  onClose: () => void;
  /**
   * Trade settlement mode — drives the body copy. Auto-confirm behaviour
   * is decoupled from this: pass `autoConfirm` explicitly when the wallet
   * holding this QR is the contract's counterparty side (cash-holder).
   */
  variant?: "agent" | "direct";
  /**
   * Fire confirmTrade in the background as soon as the QR is signed.
   * Use it on the cash-holder's side of a direct trade so that the
   * token-holder's swipe is the only remaining on-chain action.
   *
   * Direction-neutral — caller computes this from
   *   trade.counterparty.toLowerCase() === myEvmAddress.toLowerCase()
   * regardless of the buyer/provider trade-flow label.
   */
  autoConfirm?: boolean;
  /**
   * Render inline (no full-screen overlay, no own Close button) so a parent
   * screen can place the QR alongside its own controls — e.g. the provider
   * pickup screen, which shows the QR and a confirm-swipe together. Default
   * `false` keeps the standalone full-screen modal behaviour.
   */
  embedded?: boolean;
}

type State =
  | { kind: "idle" }
  | { kind: "signing" }
  | { kind: "ready"; dataUrl: string; expiresAt: number }
  | { kind: "expired" }
  | { kind: "error"; message: string };

export function TradeQRCode({
  tradeId,
  role,
  amount,
  symbol,
  onClose,
  variant = "agent",
  autoConfirm = false,
  embedded = false,
}: TradeQRCodeProps): JSX.Element {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [now, setNow] = useState(() => Date.now());

  // For a direct trade the buyer's QR generation doubles as their on-chain
  // "I'm at the meeting" confirm. The contract auto-releases tokens once
  // both buyer and provider have called confirmTrade, so firing this in
  // the background means the provider's swipe is the only remaining step.
  const { confirmTrade } = useEscrow();
  const [confirmState, setConfirmState] = useState<
    "idle" | "pending" | "done" | "error"
  >("idle");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const confirmFiredRef = useRef(false);
  const shouldAutoConfirm = autoConfirm;

  const generate = useCallback(async () => {
    setState({ kind: "signing" });
    try {
      const wallet = getSignerAndAddress();
      if (!wallet) {
        throw new Error(
          "Wallet not connected. Sign in to your Polkadot account first.",
        );
      }
      const { qrString, payload } = await signTradeQR({
        tradeId: BigInt(tradeId),
        role,
        signer: wallet.signer,
      });
      const dataUrl = await QRCode.toDataURL(qrString, {
        width: 320,
        margin: 2,
        errorCorrectionLevel: "M",
        color: { dark: "#000000", light: "#ffffff" },
      });
      setState({
        kind: "ready",
        dataUrl,
        expiresAt: Number(payload.expiresAt) * 1000,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to generate QR";
      setState({ kind: "error", message });
    }
  }, [tradeId, role]);

  useEffect(() => {
    void generate();
  }, [generate]);

  // Tick every second to drive countdown + expiry transition
  useEffect(() => {
    if (state.kind !== "ready") return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= state.expiresAt) {
        setState({ kind: "expired" });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [state]);

  // Direct trade buyer: fire confirmTrade once the QR is ready, so the
  // contract only needs the provider's confirm to auto-release tokens.
  useEffect(() => {
    if (
      !shouldAutoConfirm ||
      state.kind !== "ready" ||
      confirmFiredRef.current
    ) {
      return;
    }
    confirmFiredRef.current = true;
    setConfirmState("pending");
    void confirmTrade(BigInt(tradeId))
      .then(() => setConfirmState("done"))
      .catch((err: unknown) => {
        confirmFiredRef.current = false;
        setConfirmState("error");
        setConfirmError(
          err instanceof Error ? err.message : "Confirm transaction failed",
        );
      });
  }, [shouldAutoConfirm, state, confirmTrade, tradeId]);

  const remainingSec =
    state.kind === "ready"
      ? Math.max(0, Math.floor((state.expiresAt - now) / 1000))
      : 0;
  const remainingLabel = `${Math.floor(remainingSec / 60)}:${String(
    remainingSec % 60,
  ).padStart(2, "0")}`;

  const isDirect = variant === "direct";
  const headerCopy = isDirect
    ? role === "buyer"
      ? "Show this code to the provider"
      : "Show this code to the buyer"
    : "Show this code to your agent";
  const subCopy = isDirect
    ? role === "buyer"
      ? "They scan it, count the cash, and tokens release to you"
      : "They scan it to verify and release the trade"
    : role === "buyer"
      ? "Agent will scan it to confirm the cash you bring"
      : "Agent will scan it to release your cash";

  const card = (
    <div
      className={`bg-stone-900 border border-stone-700 rounded-2xl w-full p-6 text-center ${
        embedded ? "max-w-sm" : "max-w-sm mx-4"
      }`}
    >
      <p className="text-[11px] text-stone-500 uppercase tracking-wider font-medium mb-1">
        Trade #{tradeId}
      </p>
      <p className="text-stone-100 text-base font-medium mb-1">{headerCopy}</p>
      <p className="text-stone-400 text-xs mb-5">{subCopy}</p>

      <div className="bg-white rounded-xl p-4 mx-auto mb-4 relative w-[280px] h-[280px] flex items-center justify-center">
        {state.kind === "ready" ? (
          <img
            src={state.dataUrl}
            alt="Signed trade QR code"
            className="w-64 h-64"
          />
        ) : state.kind === "expired" ? (
          <div className="text-center text-stone-700 text-sm px-4">
            <p className="font-medium mb-1">QR expired</p>
            <p className="text-stone-500 text-xs">
              Generate a fresh code to continue
            </p>
          </div>
        ) : state.kind === "error" ? (
          <div className="text-center text-red-700 text-sm px-4">
            <p className="font-medium mb-1">Couldn&apos;t sign QR</p>
            <p className="text-red-600/80 text-xs">{state.message}</p>
          </div>
        ) : (
          <div className="text-stone-600 text-sm flex flex-col items-center gap-3">
            <Loader2 className="w-7 h-7 animate-spin" />
            <span>
              {state.kind === "signing"
                ? "Approve signature in your wallet"
                : "Preparing…"}
            </span>
          </div>
        )}
      </div>

      <div className="mb-4">
        <span className="mono text-2xl font-medium text-stone-100">
          {amount}
        </span>
        <span className="text-stone-400 ml-1.5">{symbol}</span>
      </div>

      {state.kind === "ready" && (
        <div className="flex items-center justify-center gap-2 text-xs text-stone-500 mb-4">
          <ShieldCheck className="w-3.5 h-3.5 text-green-400" />
          <span>Signed · expires in {remainingLabel}</span>
        </div>
      )}

      {shouldAutoConfirm && state.kind === "ready" && (
        <div
          className={`flex items-center justify-center gap-2 text-xs mb-4 ${
            confirmState === "done"
              ? "text-emerald-300"
              : confirmState === "error"
                ? "text-rose-300"
                : "text-stone-400"
          }`}
        >
          {confirmState === "pending" && (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Confirming on chain…</span>
            </>
          )}
          {confirmState === "done" && (
            <>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>You confirmed · waiting on provider's swipe</span>
            </>
          )}
          {confirmState === "error" && (
            <>
              <span>Confirm failed: {confirmError}</span>
              <button
                onClick={() => {
                  confirmFiredRef.current = false;
                  setConfirmState("idle");
                  setConfirmError(null);
                }}
                className="underline hover:text-rose-200"
              >
                retry
              </button>
            </>
          )}
        </div>
      )}

      {role === "buyer" && state.kind === "ready" && (
        <div className="mb-4">
          <EvidenceRecorder tradeId={tradeId} />
        </div>
      )}

      {(!embedded || state.kind === "expired" || state.kind === "error") && (
        <div className="flex gap-2 justify-center">
          {(state.kind === "expired" || state.kind === "error") && (
            <button
              onClick={() => void generate()}
              className="px-5 py-2.5 rounded-xl bg-stone-100 text-stone-900 text-sm font-medium hover:bg-white transition-colors inline-flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              {state.kind === "expired" ? "Refresh code" : "Try again"}
            </button>
          )}
          {!embedded && (
            <button
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl bg-stone-800 text-stone-200 text-sm font-medium hover:bg-stone-700 transition-colors"
            >
              Close
            </button>
          )}
        </div>
      )}

      <p className="mt-4 text-[11px] text-stone-600 leading-relaxed">
        Only the agent assigned to this trade can read the contents of this
        code. The code expires in {Math.floor(TRADE_QR_TTL_SECONDS / 60)}{" "}
        minutes.
      </p>
    </div>
  );

  if (embedded) return card;

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      {card}
    </div>
  );
}
