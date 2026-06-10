/**
 * DirectHandoffFlow — full-screen modal for the token-holder in a direct
 * trade (the wallet that signed lockTrade — provider in SELL, buyer in
 * BUY).
 *
 * Token-holder scans the cash-holder's signed QR, the signature is
 * verified against the on-chain trade.counterparty, and only the trade's
 * locker can act here. Two swipes: count cash → release tokens. On the
 * second swipe we call confirmTrade — the contract auto-releases once
 * both parties have confirmed.
 */

import { formatUnits } from "ethers";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { useCallback, useState } from "react";

import { useWalletContext } from "../../context/WalletContext";
import type { ContractTrade } from "../../hooks/useEscrow";
import { useEscrow } from "../../hooks/useEscrow";
import { ss58ToEvmAddress } from "../../lib/address";
import { fiatSymbol, ZERO_ADDRESS } from "../../lib/format";
import {
  type ContractOffer,
  getAllOffersViaSubstrate,
  getTradeViaSubstrate,
} from "../../lib/host";
import {
  deriveCandidateEvms,
  type TradeQRPayload,
  verifyTradeQR,
} from "../../lib/trade-qr";
import { QRScanner } from "./QRScanner";
import { SwipeConfirm } from "./SwipeConfirm";

interface DirectHandoffFlowProps {
  onClose: () => void;
  /** Called after successful on-chain action so the parent can refresh */
  onTradeUpdated?: () => void;
  /** Restrict the modal to a specific trade — usually opened from a row */
  expectedTradeId?: bigint;
}

type Step =
  | "scan"
  | "verifying"
  | "count-cash"
  | "release"
  | "processing"
  | "done"
  | "error";

export function DirectHandoffFlow({
  onClose,
  onTradeUpdated,
  expectedTradeId,
}: DirectHandoffFlowProps): JSX.Element {
  const {
    address: myAddress,
    evmDecimals,
    nativeCurrency,
  } = useWalletContext();
  const { confirmTrade } = useEscrow();

  const [trade, setTrade] = useState<ContractTrade | null>(null);
  const [offer, setOffer] = useState<ContractOffer | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("scan");

  const handleScan = useCallback(
    async (data: string) => {
      setStep("verifying");
      setErrorMsg(null);

      try {
        const verifyResult = verifyTradeQR(data);
        if (!verifyResult.valid || !verifyResult.payload) {
          setErrorMsg(verifyResult.error ?? "Invalid QR code");
          setStep("error");
          return;
        }
        const payload: TradeQRPayload = verifyResult.payload;

        if (
          expectedTradeId !== undefined &&
          payload.tradeId !== expectedTradeId
        ) {
          setErrorMsg(
            `QR is for trade #${payload.tradeId.toString()} but you opened trade #${expectedTradeId.toString()}.`,
          );
          setStep("error");
          return;
        }

        let onChainTrade: ContractTrade;
        try {
          onChainTrade = await getTradeViaSubstrate(payload.tradeId);
        } catch (err) {
          console.error("[DirectHandoff] getTrade failed:", err);
          setErrorMsg(
            err instanceof Error ? err.message : "Could not load trade",
          );
          setStep("error");
          return;
        }

        // Direct trades only — agent must be the zero address
        if (onChainTrade.agent !== ZERO_ADDRESS) {
          setErrorMsg("This trade has an agent — open the agent flow instead.");
          setStep("error");
          return;
        }

        // Token-holder gate — only the wallet that signed lockTrade
        // (provider for SELL, buyer for BUY) can act on this screen.
        const myEvmAddress = myAddress ? ss58ToEvmAddress(myAddress) : null;
        if (
          !myEvmAddress ||
          onChainTrade.locker.toLowerCase() !== myEvmAddress.toLowerCase()
        ) {
          setErrorMsg(
            "Only the trade's token-holder can scan this QR. Connect the wallet that locked the tokens to continue.",
          );
          setStep("error");
          return;
        }

        // The QR must come from the cash-holder side. Direction-neutral:
        // we ignore the payload.role string and check the signer against
        // the on-chain counterparty (= cash-holder regardless of SELL/BUY).
        const candidates = deriveCandidateEvms(payload.publicKey).map((a) =>
          a.toLowerCase(),
        );
        if (!candidates.includes(onChainTrade.counterparty.toLowerCase())) {
          setErrorMsg("QR was not signed by the cash-holder for this trade.");
          setStep("error");
          return;
        }

        // State must still be LOCKED for the confirm to release.
        if (onChainTrade.state !== 0) {
          setErrorMsg(
            "Trade is no longer LOCKED — tokens may have already been released or refunded.",
          );
          setStep("error");
          return;
        }

        // Best-effort offer fetch for fiat currency / fee display.
        getAllOffersViaSubstrate()
          .then((offers) => {
            const found =
              offers.find((o) => o.id === onChainTrade.offerId) ?? null;
            setOffer(found);
          })
          .catch((err) => {
            console.warn("[DirectHandoff] loadOffer failed:", err);
          });

        setTrade(onChainTrade);
        setStep("count-cash");
      } catch (err) {
        console.error("[DirectHandoff] handleScan crashed:", err);
        setErrorMsg(
          err instanceof Error
            ? `Unexpected error: ${err.message}`
            : "Unexpected error while processing QR",
        );
        setStep("error");
      }
    },
    [myAddress, expectedTradeId],
  );

  const handleRelease = useCallback(async () => {
    if (!trade) return;
    setStep("processing");
    try {
      await confirmTrade(trade.id);
      onTradeUpdated?.();
      setStep("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Transaction failed");
      setStep("error");
    }
  }, [trade, confirmTrade, onTradeUpdated]);

  const tokenAmount = trade
    ? parseFloat(formatUnits(trade.amount, evmDecimals)).toLocaleString(
        undefined,
        { maximumFractionDigits: 4 },
      )
    : "—";
  const symbol = nativeCurrency.symbol;
  const currencySym = offer ? fiatSymbol(offer.fiatCurrency) : "$";
  const providerFee = offer?.flatFee ?? null;

  return (
    <div className="fixed inset-0 z-[2000] bg-stone-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-stone-300">Direct trade</h2>
          {trade && (
            <span className="text-xs text-stone-500">
              · #{trade.id.toString()}
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-stone-500 hover:text-stone-300 transition-colors text-sm"
        >
          Close
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        {step === "scan" && (
          <div className="w-full max-w-sm">
            <p className="text-stone-400 text-sm text-center mb-1">
              Scan the cash-holder's QR
            </p>
            <p className="text-stone-600 text-xs text-center mb-4">
              Only signed codes for trades assigned to you will work.
            </p>
            <QRScanner onScan={(d) => void handleScan(d)} />
          </div>
        )}

        {step === "verifying" && (
          <div className="text-center">
            <div className="h-8 w-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4" />
            <p className="text-stone-300 text-sm">Verifying signature…</p>
            <p className="text-stone-500 text-xs mt-1">
              Checking it was signed by the cash-holder
            </p>
          </div>
        )}

        {(step === "count-cash" || step === "release") && trade && (
          <div className="w-full max-w-sm">
            <CountCashCard
              step={step === "count-cash" ? 1 : 2}
              tokenAmount={tokenAmount}
              tokenSymbol={symbol}
              currencySym={currencySym}
              providerFee={providerFee}
              offerType={offer?.offerType ?? 0}
            />
            {step === "count-cash" && (
              <SwipeConfirm
                label="I counted the cash"
                onConfirm={() => setStep("release")}
                variant="default"
              />
            )}
            {step === "release" && (
              <SwipeConfirm
                label="Release tokens"
                onConfirm={() => void handleRelease()}
                variant="success"
              />
            )}
          </div>
        )}

        {step === "processing" && (
          <div className="text-center">
            <div className="h-8 w-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4" />
            <p className="text-stone-300 text-lg mb-2">Releasing tokens…</p>
            <p className="text-stone-500 text-sm">
              Confirm the transaction in your wallet
            </p>
          </div>
        )}

        {step === "done" && (
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-8 h-8 text-green-400" />
            </div>
            <p className="text-stone-200 text-lg mb-2">Tokens released</p>
            <p className="text-stone-500 text-sm mb-6">
              Buyer received the tokens. The cash you collected stays with you.
            </p>
            <button
              onClick={onClose}
              className="px-6 py-2.5 rounded-xl bg-stone-100 text-stone-900 text-sm font-medium hover:bg-white transition-colors"
            >
              Done
            </button>
          </div>
        )}

        {step === "error" && (
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-4">
              <ShieldOff className="w-8 h-8 text-red-400" />
            </div>
            <p className="text-stone-200 text-lg mb-2">
              Couldn&apos;t verify QR
            </p>
            <p className="text-stone-400 text-sm mb-6">{errorMsg}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl bg-stone-800 text-stone-200 text-sm font-medium hover:bg-stone-700 transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setErrorMsg(null);
                  setTrade(null);
                  setStep("scan");
                }}
                className="px-6 py-2.5 rounded-xl bg-stone-100 text-stone-900 text-sm font-medium hover:bg-white transition-colors"
              >
                Scan again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CountCashCard({
  step,
  tokenAmount,
  tokenSymbol,
  currencySym,
  providerFee,
  offerType,
}: {
  step: 1 | 2;
  tokenAmount: string;
  tokenSymbol: string;
  currencySym: string;
  providerFee: bigint | null;
  /** 0 = SELL (I'm provider receiving cash from buyer + provider fee).
   *  1 = BUY  (I'm buyer receiving cash from provider, fee already
   *           deducted from the cash they bring). */
  offerType: number;
}): JSX.Element {
  const isBuyDirection = offerType === 1;
  const cashHolderLabel = isBuyDirection ? "provider" : "buyer";
  return (
    <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-5 mb-6">
      <p className="text-[11px] text-stone-500 uppercase tracking-wider font-medium mb-3">
        Step {step} of 2 · Receive cash from {cashHolderLabel}
      </p>
      <div className="space-y-3">
        <Row label="Tokens you'll release">
          <span className="mono text-stone-100 text-base">
            {tokenAmount} {tokenSymbol}
          </span>
        </Row>
        {providerFee !== null && providerFee > 0n && (
          <Row
            label={
              isBuyDirection
                ? "Provider's fee (kept from their cash)"
                : "Your fee (cash you keep)"
            }
          >
            <span className="mono text-stone-100 text-base">
              {currencySym}
              {providerFee.toString()}
            </span>
          </Row>
        )}
      </div>
      <div className="mt-4 pt-4 border-t border-stone-800">
        <div className="flex items-center justify-between">
          <span className="text-stone-400 text-xs uppercase tracking-wider">
            Cash to count
          </span>
          <span className="mono text-stone-100 text-lg font-medium">
            {tokenAmount} {tokenSymbol}
            <span className="text-stone-500 text-xs ml-1">
              {isBuyDirection
                ? "− provider fee in fiat"
                : "+ agreed fiat amount"}
            </span>
          </span>
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
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-stone-400">{label}</span>
      {children}
    </div>
  );
}
