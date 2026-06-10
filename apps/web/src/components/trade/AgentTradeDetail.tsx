/**
 * AgentTradeDetail — Variant C (rail layout) for an agent-mediated trade.
 *
 * Layout follows the Claude-design comp:
 *   1. Intro: split header — amount left, meta-rail right (Trade · When · Escrow)
 *   2. Minimal status banner — role/state-toned, single-line + inline CTA
 *   3. Flow diagram card — Buyer → Agent → Provider with stage-aware edges
 *   4. Agent location (map) on the left, How-this-works + Pickup timer on right
 *
 * State machine the contract enforces:
 *   LOCKED   → buyer brings cash to agent; agent scans buyer QR; tokens release
 *   RELEASED → provider picks up cash from agent; provider confirms
 *   COMPLETED → done
 */

import { formatUnits } from "ethers";
import { QrCode, ScanLine, ShieldCheck, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useWalletContext } from "../../context/WalletContext";
import type { ContractTrade } from "../../hooks/useEscrow";
import { useEscrow } from "../../hooks/useEscrow";
import { ss58ToEvmAddress } from "../../lib/address";
import { fmtTime, shortenAddress } from "../../lib/format";
import type { ContractOffer } from "../../lib/host";
import { getAgentViaSubstrate, getAllOffersViaSubstrate } from "../../lib/host";
import { fetchJSONFromIPFS } from "../../lib/ipfs";
import { myTradeRoles } from "../../lib/trade-roles";
import { tradeStateLabel } from "../../lib/trade-state";
import {
  type AgentLocation,
  AgentLocationCard,
} from "./agent-detail/AgentLocationCard";
import { FlowDiagram } from "./agent-detail/FlowDiagram";
import { AgentHandoffFlow } from "./AgentHandoffFlow";
import { EvidenceAttachedBanner } from "./EvidenceAttachedBanner";
import { ProviderPickupFlow } from "./ProviderPickupFlow";
import { TradeQRCode } from "./TradeQRCode";
import { terminalStatusFor, TradeSettledHero } from "./TradeSettledHero";

interface AgentMetadata {
  location?: {
    city?: string;
    country?: string;
    address?: string;
    lat?: number;
    lng?: number;
  };
}

type Role = "buyer" | "provider" | "agent";

interface AgentTradeDetailProps {
  trade: ContractTrade;
  role: Role;
  decimals: number;
  symbol: string;
}

export function AgentTradeDetail({
  trade,
  role,
  decimals,
  symbol,
}: AgentTradeDetailProps): JSX.Element {
  const navigate = useNavigate();
  const { refundTrade } = useEscrow();
  const { address: ss58Address } = useWalletContext();

  // Direction-neutral economic role: are my hands on the cash, the tokens,
  // or am I the agent? Drives banner copy + the show-QR/scan CTA below.
  const myEconomicRole: AgentEconomicRole = (() => {
    if (role === "agent") return "agent";
    if (!ss58Address) return role === "buyer" ? "cashHolder" : "tokenHolder";
    let me: string | null = null;
    try {
      me = ss58ToEvmAddress(ss58Address).toLowerCase();
    } catch {
      me = null;
    }
    const r = myTradeRoles(trade, me);
    if (r.iAmCashHolder) return "cashHolder";
    if (r.iAmTokenHolder) return "tokenHolder";
    return role === "buyer" ? "cashHolder" : "tokenHolder";
  })();

  const [showQR, setShowQR] = useState(false);
  const [showAgentFlow, setShowAgentFlow] = useState(false);
  const [showPickup, setShowPickup] = useState(false);

  const [refundPending, setRefundPending] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);

  const tradeAmount = parseFloat(
    formatUnits(trade.amount, decimals),
  ).toString();

  // Agent's published location — fetched from their on-chain metadataCID
  // (city / country / lat / lng). Renders empty state until it resolves.
  const [agentLocation, setAgentLocation] = useState<AgentLocation | null>(
    null,
  );
  // Agent's hold-time + per-extra-hour fee, offer currency, and offer
  // direction. Direction drives which on-chain address is the trade-flow
  // buyer vs provider in the FlowDiagram + Intro.
  const [agentExtras, setAgentExtras] = useState<{
    holdHours: number;
    extraHourFee: bigint;
    currency: string | null;
    /** 0 = SELL (locker = provider), 1 = BUY (locker = buyer). */
    offerType: number;
  } | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const a = await getAgentViaSubstrate(trade.agent);
        if (!a || cancelled) return;

        let currency: string | null = null;
        let offerType = 0;
        try {
          const offers = await getAllOffersViaSubstrate();
          const o = offers.find((x: ContractOffer) => x.id === trade.offerId);
          if (o) {
            currency = o.fiatCurrency;
            offerType = o.offerType;
          }
        } catch {
          // currency fallback handled in the banner
        }

        if (!cancelled) {
          setAgentExtras({
            holdHours: a.holdHours,
            extraHourFee: a.extraHourFee,
            currency,
            offerType,
          });
        }

        const meta = await fetchJSONFromIPFS<AgentMetadata>(a.metadataCID);
        if (cancelled) return;
        const loc = meta?.location;
        if (
          !loc ||
          typeof loc.lat !== "number" ||
          typeof loc.lng !== "number"
        ) {
          return;
        }
        const cityCountry = [loc.city, loc.country].filter(Boolean).join(", ");
        setAgentLocation({
          label: loc.address || loc.city || a.name || "Agent location",
          address:
            cityCountry || `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`,
          lat: loc.lat,
          lon: loc.lng,
        });
      } catch {
        // metadata fetch failure → leave empty state
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [trade.agent, trade.offerId]);

  // Direction-aware trade-flow address mapping. Default to SELL (locker =
  // provider) until the offer loads — that matches the historic behaviour.
  const isBuyOffer = agentExtras?.offerType === 1;
  const tradeBuyerAddr = isBuyOffer ? trade.locker : trade.counterparty;
  const tradeProviderAddr = isBuyOffer ? trade.counterparty : trade.locker;

  const lockedAtMs = Number(trade.lockedAt) * 1000;
  const lockedExpired =
    trade.state === 0 && lockedAtMs + 24 * 60 * 60 * 1000 < Date.now();
  const pickupDeadlineMs = Number(trade.pickupDeadline) * 1000;
  const pickupExpired =
    trade.state === 1 && pickupDeadlineMs > 0 && pickupDeadlineMs < Date.now();

  const handleRefund = async () => {
    setRefundPending(true);
    setRefundError(null);
    try {
      await refundTrade(trade.id);
      navigate("/profile");
    } catch (err) {
      setRefundError(err instanceof Error ? err.message : "Refund failed");
      setRefundPending(false);
    }
  };

  // A terminal trade (COMPLETED / REFUNDED / CANCELLED) is done — there's no
  // cash to bring, QR to scan, or pickup to make. Swap the live coordination
  // surface for a focused, status-forward summary that reads clearly as "done".
  if (trade.state >= 2) {
    const otherAddr = role === "provider" ? tradeBuyerAddr : tradeProviderAddr;
    const subtitle =
      trade.state === 2 ? (
        role === "buyer" ? (
          <>
            received from{" "}
            <span className="mono text-stone-200">
              {shortenAddress(otherAddr)}
            </span>
          </>
        ) : role === "provider" ? (
          <>
            released to{" "}
            <span className="mono text-stone-200">
              {shortenAddress(otherAddr)}
            </span>
          </>
        ) : (
          <>handled between buyer &amp; provider</>
        )
      ) : (
        <>
          with{" "}
          <span className="mono text-stone-200">
            {shortenAddress(otherAddr)}
          </span>
        </>
      );
    return (
      <div className="min-h-screen bg-stone-950 pb-12">
        <div className="max-w-3xl mx-auto px-4 lg:px-8 py-8 lg:py-12 space-y-6">
          <TradeSettledHero
            state={trade.state}
            amount={tradeAmount}
            symbol={symbol}
            subtitle={subtitle}
            meta={[
              { label: "Trade", value: `#${trade.id.toString()}` },
              {
                label: "Locked",
                value: fmtTime(lockedAtMs),
                sub: lockedAgo(lockedAtMs),
              },
              {
                label: "Status",
                value: terminalStatusFor(trade.state).label,
                sub: "Via agent",
              },
            ]}
          />
          {trade.evidenceCID && (
            <EvidenceAttachedBanner cid={trade.evidenceCID} />
          )}
        </div>
      </div>
    );
  }

  const view = pickView(myEconomicRole, trade.state);

  const onPrimary = () => {
    if (!view.action) return;
    if (view.action.kind === "show-qr") setShowQR(true);
    if (view.action.kind === "scan-qr") setShowAgentFlow(true);
    if (view.action.kind === "pickup") setShowPickup(true);
  };

  return (
    <div className="min-h-screen bg-stone-950 pb-28 lg:pb-12">
      <div className="max-w-[1280px] mx-auto px-4 lg:px-8 py-6 lg:py-10 space-y-5">
        <Intro
          role={role}
          tradeAmount={tradeAmount}
          symbol={symbol}
          counterpartyAddr={
            role === "buyer"
              ? tradeProviderAddr
              : role === "provider"
                ? tradeBuyerAddr
                : null
          }
          buyerAddr={role === "agent" ? tradeBuyerAddr : null}
          tradeId={trade.id.toString()}
          lockedAt={Number(trade.lockedAt) * 1000}
          escrowState={tradeStateLabel(trade.state, "agent")}
        />

        {trade.evidenceCID && (
          <EvidenceAttachedBanner cid={trade.evidenceCID} />
        )}

        {lockedExpired && role === "provider" && (
          <ExpiredRefundBanner
            title="Trade expired"
            body="The buyer didn't deliver the cash to the agent within 24 hours. Claim your locked tokens back to your wallet."
            actionLabel={
              <>
                Claim{" "}
                <span className="mono">
                  {tradeAmount} {symbol}
                </span>
              </>
            }
            onClaim={() => void handleRefund()}
            pending={refundPending}
            error={refundError}
          />
        )}

        {pickupExpired && role === "provider" && (
          <PickupOverdueBanner
            pickupDeadline={pickupDeadlineMs}
            extraHourFee={agentExtras?.extraHourFee}
            currency={agentExtras?.currency ?? null}
          />
        )}

        {!lockedExpired && !pickupExpired && (
          <StatusBanner view={view} onPrimary={onPrimary} />
        )}

        <FlowDiagram
          role={role}
          state={trade.state}
          buyerAddr={role === "buyer" ? null : tradeBuyerAddr}
          providerAddr={role === "provider" ? null : tradeProviderAddr}
          agentAddr={role === "agent" ? null : trade.agent}
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-8 space-y-5">
            <AgentLocationCard location={agentLocation} />
          </div>
          <aside className="lg:col-span-4 space-y-5">
            <HowThisWorks role={role} state={trade.state} />
            {role === "provider" && trade.state === 1 && !pickupExpired && (
              <PickupTimer
                remainingMs={Math.max(
                  0,
                  Number(trade.pickupDeadline) * 1000 - Date.now(),
                )}
              />
            )}
          </aside>
        </div>
      </div>

      {/* Mobile sticky CTA */}
      {view.action && !lockedExpired && !pickupExpired && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-gradient-to-t from-stone-950 via-stone-950/95 to-transparent pt-6 pb-4 px-4">
          <button
            onClick={onPrimary}
            className="w-full rounded-xl bg-stone-100 text-stone-900 px-4 py-3.5 text-sm font-medium hover:bg-white transition-colors flex items-center justify-center gap-2"
          >
            {view.action.icon}
            {view.action.label}
          </button>
        </div>
      )}

      {showQR && (
        <TradeQRCode
          tradeId={trade.id.toString()}
          role={role === "buyer" ? "buyer" : "provider"}
          amount={tradeAmount}
          symbol={symbol}
          onClose={() => setShowQR(false)}
        />
      )}
      {showAgentFlow && (
        <AgentHandoffFlow
          expectedTradeId={trade.id}
          onClose={() => setShowAgentFlow(false)}
        />
      )}
      {showPickup && (
        <ProviderPickupFlow
          trade={trade}
          symbol={symbol}
          amount={tradeAmount}
          onClose={() => setShowPickup(false)}
        />
      )}
    </div>
  );
}

// ─── View resolver ──────────────────────────────────────────────────────────

interface View {
  banner: {
    title: string;
    body: string;
    tone: Tone;
  };
  action: {
    kind: "show-qr" | "scan-qr" | "pickup";
    label: string;
    icon: JSX.Element;
  } | null;
}

type AgentEconomicRole = "tokenHolder" | "cashHolder" | "agent";

function pickView(econ: AgentEconomicRole, state: number): View {
  if (state === 0) {
    if (econ === "cashHolder") {
      return {
        banner: {
          tone: "amber",
          title: "Bring cash to the agent",
          body: "The other side's tokens are locked in escrow. Once you deliver the cash and the agent confirms, the tokens release to you.",
        },
        action: {
          kind: "show-qr",
          label: "Show pickup code",
          icon: <QrCode className="w-4 h-4" />,
        },
      };
    }
    if (econ === "tokenHolder") {
      return {
        banner: {
          tone: "blue",
          title: "Waiting for the cash drop-off",
          body: "Your tokens are locked. The other side will deliver cash to the agent. You'll be notified once the agent confirms.",
        },
        action: null,
      };
    }
    return {
      banner: {
        tone: "amber",
        title: "Buyer is on the way with cash",
        body: "When they arrive, confirm the cash and scan their code to release the tokens.",
      },
      action: {
        kind: "scan-qr",
        label: "Scan buyer's code",
        icon: <ScanLine className="w-4 h-4" />,
      },
    };
  }

  if (state === 1) {
    if (econ === "cashHolder") {
      return {
        banner: {
          tone: "green",
          title: "You got your tokens",
          body: "Escrow released your tokens. The agent is holding the cash for the other side — you're done.",
        },
        action: null,
      };
    }
    if (econ === "tokenHolder") {
      return {
        banner: {
          tone: "amber",
          title: "Your cash is ready",
          body: "The agent is holding the cash for you. Visit the agent before the deadline to collect.",
        },
        action: {
          kind: "pickup",
          label: "I picked up the cash",
          icon: <Wallet className="w-4 h-4" />,
        },
      };
    }
    return {
      banner: {
        tone: "blue",
        title: "Hold the cash for the provider",
        body: "The provider will arrive to pick up. Check their wallet address before handing over.",
      },
      action: null,
    };
  }

  return {
    banner: {
      tone: "neutral",
      title: "Trade settled",
      body: "This trade is complete and visible in your history.",
    },
    action: null,
  };
}

// ─── Intro: amount + meta-rail ──────────────────────────────────────────────

function Intro({
  role,
  tradeAmount,
  symbol,
  counterpartyAddr,
  buyerAddr,
  tradeId,
  lockedAt,
  escrowState,
}: {
  role: Role;
  tradeAmount: string;
  symbol: string;
  counterpartyAddr: string | null;
  buyerAddr: string | null;
  tradeId: string;
  lockedAt: number;
  escrowState: string;
}): JSX.Element {
  const eyebrow =
    role === "buyer"
      ? "You receive"
      : role === "provider"
        ? "You release"
        : "Mediating";
  const verb =
    role === "buyer" ? "from" : role === "provider" ? "to" : "between";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 lg:items-end">
      <div className="lg:col-span-7">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] uppercase tracking-[0.18em] text-stone-500 font-medium">
            {eyebrow}
          </span>
          {role === "agent" ? (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md border border-purple-500/40 bg-purple-500/5 text-purple-300">
              <ShieldCheck className="w-3 h-3" />
              I'm agent
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md border border-amber-500/30 bg-amber-500/5 text-amber-300">
              <ShieldCheck className="w-3 h-3" />
              Via agent
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-3">
          <span className="mono text-5xl lg:text-7xl text-stone-50 font-light leading-none tracking-tight tabular-nums">
            {tradeAmount}
          </span>
          <span className="mono text-stone-500 text-sm uppercase tracking-wider">
            {symbol}
          </span>
        </div>
        <p className="text-sm text-stone-400 mt-3">
          {counterpartyAddr ? (
            <>
              {verb}{" "}
              <span className="mono text-stone-200">
                {shortenAddress(counterpartyAddr)}
              </span>
            </>
          ) : buyerAddr ? (
            <span className="mono text-stone-200">
              {shortenAddress(buyerAddr)}
            </span>
          ) : null}
        </p>
      </div>

      <div className="lg:col-span-5 grid grid-cols-3 rounded-2xl border border-stone-800 divide-x divide-stone-800 overflow-hidden bg-stone-950/40">
        <MetaCol label="Trade" value={`#${tradeId}`} />
        <MetaCol
          label="Locked"
          value={fmtTime(lockedAt)}
          sub={lockedAgo(lockedAt)}
        />
        <MetaCol label="Escrow" value={escrowState} sub="Via agent" />
      </div>
    </div>
  );
}

function lockedAgo(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function MetaCol({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}): JSX.Element {
  return (
    <div className="px-4 py-3 min-w-0">
      <p className="text-[10px] uppercase tracking-[0.16em] text-stone-500 font-medium">
        {label}
      </p>
      <p className="mono text-stone-100 text-sm mt-1.5 truncate">{value}</p>
      {sub && (
        <p className="mono text-stone-600 text-[11px] mt-0.5 truncate">{sub}</p>
      )}
    </div>
  );
}

// ─── Pickup overdue banner ──────────────────────────────────────────────────
// Shown to the provider after agent.holdHours has passed since cash was
// confirmed. Late fees accrue per hour in cash (paid to agent on pickup) —
// no on-chain action; provider must still come and collect.

function PickupOverdueBanner({
  pickupDeadline,
  extraHourFee,
  currency,
}: {
  pickupDeadline: number;
  extraHourFee: bigint | undefined;
  currency: string | null;
}): JSX.Element {
  const hoursOver = Math.max(
    0,
    Math.ceil((Date.now() - pickupDeadline) / 3_600_000),
  );
  const cur = currency ?? "USD";
  const feeNum =
    extraHourFee !== undefined && extraHourFee >= 0n ? Number(extraHourFee) : 0;
  const total = feeNum * hoursOver;
  const haveFee = feeNum > 0;
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] px-5 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        <span
          className="mt-1.5 w-2 h-2 rounded-full bg-amber-400 shrink-0"
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-stone-100">
            Pickup window passed — late fee accruing
          </p>
          <p className="mt-0.5 text-xs text-stone-400 leading-relaxed max-w-2xl">
            {haveFee
              ? `${hoursOver}h over the agent's hold window. You owe an extra ${total} ${cur} in cash to the agent at pickup (${feeNum} ${cur}/h).`
              : `${hoursOver}h over the agent's hold window. The agent may charge an extra-hour fee in cash at pickup. Come collect the cash as soon as you can.`}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Expired refund banner ──────────────────────────────────────────────────

function ExpiredRefundBanner({
  title,
  body,
  actionLabel,
  onClaim,
  pending,
  error,
}: {
  title: string;
  body: string;
  actionLabel: React.ReactNode;
  onClaim: () => void;
  pending: boolean;
  error: string | null;
}): JSX.Element {
  return (
    <div className="rounded-2xl border border-rose-500/30 bg-rose-500/[0.06] px-5 py-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        <span
          className="mt-1.5 w-2 h-2 rounded-full bg-rose-400 shrink-0"
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-stone-100">{title}</p>
          <p className="mt-0.5 text-xs text-stone-400 leading-relaxed max-w-2xl">
            {body}
          </p>
          {error && <p className="mt-1.5 text-xs text-rose-300">{error}</p>}
        </div>
      </div>
      <button
        onClick={onClaim}
        disabled={pending}
        className="shrink-0 rounded-xl bg-rose-400 text-stone-950 px-5 py-3 text-sm font-medium hover:bg-rose-300 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {pending ? "Claiming…" : actionLabel}
      </button>
    </div>
  );
}

// ─── Status banner — minimal, role-toned, inline CTA ────────────────────────

type Tone = "amber" | "blue" | "green" | "neutral";

const TONE_TO_BORDER: Record<Tone, string> = {
  amber: "border-amber-500/25",
  blue: "border-sky-500/25",
  green: "border-emerald-500/25",
  neutral: "border-stone-700",
};
const TONE_TO_BG: Record<Tone, string> = {
  amber: "bg-amber-500/[0.06]",
  blue: "bg-sky-500/[0.06]",
  green: "bg-emerald-500/[0.06]",
  neutral: "bg-stone-900/40",
};
const TONE_TO_DOT: Record<Tone, string> = {
  amber: "bg-amber-400",
  blue: "bg-sky-400",
  green: "bg-emerald-400",
  neutral: "bg-stone-400",
};

function StatusBanner({
  view,
  onPrimary,
}: {
  view: View;
  onPrimary: () => void;
}): JSX.Element {
  const tone = view.banner.tone;
  return (
    <div
      className={`flex items-center justify-between gap-6 rounded-2xl border ${TONE_TO_BORDER[tone]} ${TONE_TO_BG[tone]} px-5 py-4`}
    >
      <div className="flex items-start gap-3 min-w-0">
        <span
          className={`mt-1.5 w-2 h-2 rounded-full ${TONE_TO_DOT[tone]} shrink-0`}
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-stone-100">
            {view.banner.title}
          </p>
          <p className="mt-0.5 max-w-2xl text-xs text-stone-400 leading-relaxed">
            {view.banner.body}
          </p>
        </div>
      </div>
      {view.action && (
        <button
          onClick={onPrimary}
          className={`hidden lg:inline-flex shrink-0 rounded-xl px-5 py-3 text-sm font-medium transition-colors gap-2 items-center ${
            tone === "amber"
              ? "bg-amber-400 text-stone-950 hover:bg-amber-300"
              : "bg-stone-100 text-stone-950 hover:bg-white"
          }`}
        >
          {view.action.icon}
          {view.action.label}
        </button>
      )}
    </div>
  );
}

// ─── How this works ─────────────────────────────────────────────────────────

function HowThisWorks({
  role,
  state,
}: {
  role: Role;
  state: number;
}): JSX.Element {
  const tip =
    role === "buyer"
      ? "Your trade ends the moment the agent confirms your cash. After that you don't need to do anything else."
      : role === "provider" && state === 1
        ? "The buyer paid the agent and your tokens were released to them. Visit the agent before the deadline to collect your cash."
        : role === "provider"
          ? "Your tokens are locked. Wait for the agent to confirm cash. Then pick up at the agent's location."
          : "Confirm cash from the buyer in person, then scan their QR. Tokens release to the buyer; the provider picks up cash from you later.";
  return (
    <div className="rounded-2xl border border-stone-800/80 bg-stone-900/40 p-5">
      <p className="text-[10px] uppercase tracking-[0.12em] text-stone-500 font-medium mb-2">
        How this works
      </p>
      <p className="text-xs leading-relaxed text-stone-300">{tip}</p>
    </div>
  );
}

// ─── Pickup timer (provider in RELEASED) ────────────────────────────────────

function PickupTimer({ remainingMs }: { remainingMs: number }): JSX.Element {
  const [ms, setMs] = useState(remainingMs);
  useEffect(() => {
    if (ms <= 0) return;
    const id = setInterval(() => setMs((v) => Math.max(0, v - 1000)), 1000);
    return () => clearInterval(id);
  }, [ms]);
  const expired = ms <= 0;
  const hh = Math.floor(ms / 3_600_000);
  const mm = Math.floor((ms % 3_600_000) / 60_000);
  const ss = Math.floor((ms % 60_000) / 1000);
  const tone = expired ? "rose" : "amber";
  const border = expired ? "border-rose-500/25" : "border-amber-500/25";
  const bg = expired ? "bg-rose-500/[0.05]" : "bg-amber-500/[0.05]";
  const dot = expired ? "bg-rose-400" : "bg-amber-400";
  const text = expired ? "text-rose-300" : "text-amber-200";
  void tone;
  return (
    <div className={`rounded-2xl border ${border} ${bg} p-4`}>
      <div className="flex items-center gap-2">
        <span className="relative inline-flex items-center justify-center">
          <span className={`block h-1.5 w-1.5 rounded-full ${dot}`} />
          <span
            className={`absolute inline-block h-2.5 w-2.5 rounded-full ${dot} opacity-40 animate-ping`}
          />
        </span>
        <p className="text-[10px] uppercase tracking-[0.12em] text-stone-400 font-medium">
          Pickup deadline
        </p>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className={`mono text-2xl tabular-nums ${text}`}>
          {String(hh).padStart(2, "0")}:{String(mm).padStart(2, "0")}:
          {String(ss).padStart(2, "0")}
        </span>
        <span className="text-xs text-stone-500">
          {expired ? "expired" : "remaining"}
        </span>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-stone-400">
        {expired
          ? "You can claim the agent's insurance now from your settings."
          : "After this deadline you can claim the agent's insurance."}
      </p>
    </div>
  );
}
