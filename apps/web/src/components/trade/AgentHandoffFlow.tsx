/**
 * AgentHandoffFlow — full-screen modal for the agent.
 *
 * Agent scans the buyer's or provider's signed QR. The QR's signature is
 * verified against the on-chain trade participant address before any details
 * are shown. Only the agent assigned to the trade can act on this screen.
 *
 * Buyer QR (state=LOCKED) → confirm cash received → release tokens
 * Provider QR (state=RELEASED) → instruct agent to give cash, wait for provider
 */

import { formatUnits } from "ethers";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { useCallback, useState } from "react";

import { useWalletContext } from "../../context/WalletContext";
import type { ContractTrade } from "../../hooks/useEscrow";
import { useEscrow } from "../../hooks/useEscrow";
import { ss58ToEvmAddress } from "../../lib/address";
import { fiatSymbol } from "../../lib/format";
import {
  type ContractAgent,
  type ContractOffer,
  getAgentViaSubstrate,
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

interface AgentHandoffFlowProps {
  onClose: () => void;
  /** Called after successful on-chain action to refresh trade data */
  onTradeUpdated?: () => void;
  /**
   * Optional: when opened from a specific trade card, the scanned QR must
   * match this trade's id. Without it, the modal accepts any of the agent's
   * trades.
   */
  expectedTradeId?: bigint;
}

type Step =
  | "scan"
  | "verifying"
  | "confirm-cash-1"
  | "confirm-cash-2"
  | "confirm-cash-3"
  | "processing"
  | "give-cash"
  | "done"
  | "error";

interface FeeInfo {
  agentFee: bigint;
  providerFee: bigint;
  fiatCurrency: string; // "USD"
  /** 0 = SELL (cash-holder is buyer, brings amount + provider_fee).
   *  1 = BUY  (cash-holder is provider, brings amount − provider_fee). */
  offerType: number;
}

export function AgentHandoffFlow({
  onClose,
  onTradeUpdated,
  expectedTradeId,
}: AgentHandoffFlowProps): JSX.Element {
  const {
    address: myAddress,
    evmDecimals,
    nativeCurrency,
  } = useWalletContext();
  const { confirmCashReceived } = useEscrow();

  const [trade, setTrade] = useState<ContractTrade | null>(null);
  const [fees, setFees] = useState<FeeInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("scan");

  // Fetch fee info (agent flatFee + provider offer flatFee + currency)
  const loadFees = useCallback(async (t: ContractTrade) => {
    const [agent, offers] = await Promise.all([
      getAgentViaSubstrate(t.agent).catch(() => null as ContractAgent | null),
      getAllOffersViaSubstrate().catch(() => [] as ContractOffer[]),
    ]);
    const offer = offers.find((o) => o.id === t.offerId);
    setFees({
      agentFee: agent?.flatFee ?? 0n,
      providerFee: offer?.flatFee ?? 0n,
      fiatCurrency: offer?.fiatCurrency ?? "USD",
      offerType: offer?.offerType ?? 0,
    });
  }, []);

  const handleScan = useCallback(
    async (data: string) => {
      setStep("verifying");
      setErrorMsg(null);

      try {
        // 1. Cryptographic verification of the QR signature
        const verifyResult = verifyTradeQR(data);
        if (!verifyResult.valid || !verifyResult.payload) {
          setErrorMsg(verifyResult.error ?? "Invalid QR code");
          setStep("error");
          return;
        }
        const payload: TradeQRPayload = verifyResult.payload;

        // If opened from a specific trade card, ensure the QR is for that trade
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

        // 2. Fetch on-chain trade
        let onChainTrade: ContractTrade;
        try {
          onChainTrade = await getTradeViaSubstrate(payload.tradeId);
        } catch (err) {
          console.error("[AgentHandoff] getTrade failed:", err);
          setErrorMsg(
            err instanceof Error ? err.message : "Could not load trade",
          );
          setStep("error");
          return;
        }

        // 3. Agent gate — only the trade's agent can see the rest.
        // Wallet address is SS58; on-chain trade.agent is an EVM h160
        // (keccak256(pubkey).last20). Compare against the EVM derivation,
        // not the raw SS58.
        const myEvmAddress = myAddress ? ss58ToEvmAddress(myAddress) : null;
        if (
          !myEvmAddress ||
          onChainTrade.agent.toLowerCase() !== myEvmAddress.toLowerCase()
        ) {
          setErrorMsg(
            "This trade isn't assigned to your wallet. Only the trade's agent can scan it.",
          );
          setStep("error");
          return;
        }

        // 4. Match the signer against both on-chain sides to figure out
        //    who's presenting the QR. Direction-neutral — payload.role
        //    string is ignored; what matters is locker vs counterparty.
        const candidates = deriveCandidateEvms(payload.publicKey).map((a) =>
          a.toLowerCase(),
        );
        const isCashHolderSide = candidates.includes(
          onChainTrade.counterparty.toLowerCase(),
        );
        const isTokenHolderSide = candidates.includes(
          onChainTrade.locker.toLowerCase(),
        );
        if (!isCashHolderSide && !isTokenHolderSide) {
          setErrorMsg("QR was not signed by either party of this trade.");
          setStep("error");
          return;
        }

        // 5. Drop-off vs pickup is gated purely by trade state.
        //    LOCKED   (0) → cash-holder dropping off cash.
        //    RELEASED (1) → token-holder picking up cash.
        if (isCashHolderSide && onChainTrade.state !== 0) {
          setErrorMsg(
            "Cash drop-off is only valid while tokens are locked. This trade has moved on.",
          );
          setStep("error");
          return;
        }
        if (
          isTokenHolderSide &&
          !isCashHolderSide &&
          onChainTrade.state !== 1
        ) {
          setErrorMsg(
            "Pickup is only valid after the cash-holder has dropped off cash.",
          );
          setStep("error");
          return;
        }

        setTrade(onChainTrade);
        // Fee fetch is best-effort — UI shows "…" if it fails so the swipe
        // flow is never blocked by a chain read hiccup.
        loadFees(onChainTrade).catch((err) => {
          console.warn("[AgentHandoff] loadFees failed:", err);
        });
        // If the same wallet locked AND will receive (degenerate test
        // case), state decides which step we land on.
        const isCashDropoff = isCashHolderSide && onChainTrade.state === 0;
        setStep(isCashDropoff ? "confirm-cash-1" : "give-cash");
      } catch (err) {
        console.error("[AgentHandoff] handleScan crashed:", err);
        setErrorMsg(
          err instanceof Error
            ? `Unexpected error: ${err.message}`
            : "Unexpected error while processing QR",
        );
        setStep("error");
      }
    },
    [myAddress, expectedTradeId, loadFees],
  );

  const handleConfirmCash = useCallback(async () => {
    if (!trade) return;
    setStep("processing");
    try {
      await confirmCashReceived(trade.id);
      onTradeUpdated?.();
      setStep("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Transaction failed");
      setStep("error");
    }
  }, [trade, confirmCashReceived, onTradeUpdated]);

  const tokenAmount = trade
    ? parseFloat(formatUnits(trade.amount, evmDecimals)).toLocaleString(
        undefined,
        { maximumFractionDigits: 4 },
      )
    : "—";
  const symbol = nativeCurrency.symbol;
  const currencySym = fees ? fiatSymbol(fees.fiatCurrency) : "$";

  return (
    <div className="fixed inset-0 z-[2000] bg-stone-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-stone-300">Agent Handoff</h2>
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
              Scan a buyer or provider QR
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
              Checking it was signed by the trade participant
            </p>
          </div>
        )}

        {(step === "confirm-cash-1" ||
          step === "confirm-cash-2" ||
          step === "confirm-cash-3") &&
          trade && (
            <div className="w-full max-w-sm">
              <BuyerCashCard
                step={
                  step === "confirm-cash-1"
                    ? 1
                    : step === "confirm-cash-2"
                      ? 2
                      : 3
                }
                tokenAmount={tokenAmount}
                tokenSymbol={symbol}
                currencySym={currencySym}
                fees={fees}
              />
              {step === "confirm-cash-1" && (
                <SwipeConfirm
                  label="I received the cash"
                  onConfirm={() => setStep("confirm-cash-2")}
                  variant="default"
                />
              )}
              {step === "confirm-cash-2" && (
                <SwipeConfirm
                  label="Amount is correct"
                  onConfirm={() => setStep("confirm-cash-3")}
                  variant="default"
                />
              )}
              {step === "confirm-cash-3" && (
                <SwipeConfirm
                  label="Release tokens to buyer"
                  onConfirm={() => void handleConfirmCash()}
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

        {step === "give-cash" && trade && (
          <div className="w-full max-w-sm">
            <ProviderCashCard
              tokenAmount={tokenAmount}
              tokenSymbol={symbol}
              currencySym={currencySym}
              fees={fees}
            />
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 text-center">
              <p className="text-amber-400 text-sm font-medium">
                Hand over the cash
              </p>
              <p className="text-amber-400/70 text-xs mt-1">
                Your fee was already paid by the buyer. They&apos;ll confirm
                pickup on their phone — you&apos;ll see it update on chain.
              </p>
            </div>
            <p className="text-stone-500 text-xs text-center mt-4">
              Waiting for provider to confirm…
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
              Buyer has received their tokens
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

function BuyerCashCard({
  step,
  tokenAmount,
  tokenSymbol,
  currencySym,
  fees,
}: {
  step: 1 | 2 | 3;
  tokenAmount: string;
  tokenSymbol: string;
  currencySym: string;
  fees: FeeInfo | null;
}): JSX.Element {
  // Pegged-stablecoin assumption (Hollar V1 scope): 1 token ≈ 1 unit fiat
  // so a single $-total reads cleanly. Direction matters here: in a SELL
  // trade the buyer brings cash and provider fee adds to the total; in a
  // BUY trade the provider brings cash and provider fee is deducted from it.
  const tokenAmountNum = parseFloat(tokenAmount.replace(/,/g, "")) || 0;
  const agentFeeNum = fees ? Number(fees.agentFee) : null;
  const providerFeeNum = fees ? Number(fees.providerFee) : null;
  const isBuyDirection = fees?.offerType === 1;
  const cashHolderLabel = isBuyDirection ? "provider" : "buyer";
  const cashRecipientLabel = isBuyDirection ? "buyer" : "provider";
  // Net cash that ends up with the token-holder side.
  const recipientShareNum =
    fees && providerFeeNum !== null
      ? isBuyDirection
        ? tokenAmountNum - providerFeeNum
        : tokenAmountNum + providerFeeNum
      : null;
  const totalNum =
    fees && agentFeeNum !== null && recipientShareNum !== null
      ? recipientShareNum + agentFeeNum
      : null;
  const stepCopy =
    step === 1
      ? `Count the ${cashHolderLabel}'s cash`
      : step === 2
        ? "Confirm the amount is right"
        : `Release tokens to ${cashRecipientLabel}`;
  return (
    <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-5 mb-6">
      <p className="text-[11px] text-stone-500 uppercase tracking-wider font-medium mb-3">
        Step {step} of 3 · {stepCopy}
      </p>

      {/* Hero — single total to count */}
      <div className="text-center py-4 border-b border-stone-800/80">
        <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500 font-medium">
          Total cash from {cashHolderLabel}
        </p>
        <p className="mt-2 mono text-stone-50 leading-none">
          <span className="text-4xl font-medium tabular-nums">
            {currencySym}
            {totalNum !== null
              ? totalNum.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })
              : "—"}
          </span>
        </p>
        <p className="mt-2 text-[11px] text-stone-500">
          {isBuyDirection
            ? `${tokenAmount} ${tokenSymbol} − provider fee + agent fee`
            : `Cash for ${tokenAmount} ${tokenSymbol} + fees`}
        </p>
      </div>

      {/* Split — what the cash breaks into */}
      <div className="grid grid-cols-2 gap-2 mt-4">
        <SplitTile
          label="You keep"
          tone="amber"
          amount={agentFeeNum}
          sym={currencySym}
          sub="agent fee"
        />
        <SplitTile
          label={`For the ${cashRecipientLabel}`}
          amount={recipientShareNum}
          sym={currencySym}
          sub={
            isBuyDirection
              ? `${tokenAmount} ${tokenSymbol} − provider fee`
              : `covers ${tokenAmount} ${tokenSymbol} + provider fee`
          }
        />
      </div>
    </div>
  );
}

function SplitTile({
  label,
  amount,
  sym,
  sub,
  tone = "neutral",
}: {
  label: string;
  amount: number | null;
  sym: string;
  sub: string;
  tone?: "amber" | "neutral";
}): JSX.Element {
  const accent =
    tone === "amber"
      ? "border-amber-500/30 bg-amber-500/[0.06]"
      : "border-stone-800 bg-stone-950/40";
  const text = tone === "amber" ? "text-amber-200" : "text-stone-100";
  return (
    <div className={`rounded-xl border ${accent} p-3`}>
      <p className="text-[10px] uppercase tracking-[0.14em] text-stone-500 font-medium">
        {label}
      </p>
      <p className={`mt-1 mono text-lg font-medium tabular-nums ${text}`}>
        {sym}
        {amount !== null
          ? amount.toLocaleString(undefined, { maximumFractionDigits: 2 })
          : "…"}
      </p>
      <p className="mt-1 text-[11px] text-stone-500 leading-snug">{sub}</p>
    </div>
  );
}

function ProviderCashCard({
  tokenAmount,
  tokenSymbol,
  currencySym,
  fees,
}: {
  tokenAmount: string;
  tokenSymbol: string;
  currencySym: string;
  fees: FeeInfo | null;
}): JSX.Element {
  // The agent only hands over what's due to the token-holder: the exchanged
  // value ± the provider fee. The agent's own fee was already paid by the
  // buyer at drop-off, so it never appears here. Direction-aware, matching
  // BuyerCashCard: SELL adds the provider fee, BUY subtracts it.
  const tokenAmountNum = parseFloat(tokenAmount.replace(/,/g, "")) || 0;
  const providerFeeNum = fees ? Number(fees.providerFee) : null;
  const isBuyDirection = fees?.offerType === 1;
  const recipientLabel = isBuyDirection ? "buyer" : "provider";
  const recipientShareNum =
    fees && providerFeeNum !== null
      ? isBuyDirection
        ? tokenAmountNum - providerFeeNum
        : tokenAmountNum + providerFeeNum
      : null;
  const feeNote =
    providerFeeNum && providerFeeNum > 0
      ? ` ${isBuyDirection ? "−" : "+"} ${currencySym}${providerFeeNum} provider fee`
      : "";

  return (
    <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-5 mb-4">
      <p className="text-[11px] text-stone-500 uppercase tracking-wider font-medium mb-3">
        Hand over cash
      </p>
      <div className="text-center py-2">
        <p className="text-[10px] uppercase tracking-[0.18em] text-stone-500 font-medium">
          Give to the {recipientLabel}
        </p>
        <p className="mt-2 mono text-stone-50 leading-none">
          <span className="text-4xl font-medium tabular-nums">
            {currencySym}
            {recipientShareNum !== null
              ? recipientShareNum.toLocaleString(undefined, {
                  maximumFractionDigits: 2,
                })
              : "—"}
          </span>
        </p>
        <p className="mt-2 text-[11px] text-stone-500">
          cash for {tokenAmount} {tokenSymbol}
          {feeNote}
        </p>
      </div>
    </div>
  );
}
