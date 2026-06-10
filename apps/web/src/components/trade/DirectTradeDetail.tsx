/**
 * DirectTradeDetail — full meet-up page for in-person buyer/provider trade.
 *
 * Layout follows the Claude-design comp: split header (amount on the left,
 * meta-rail on the right), then a 3-column body — timeline + counterparty
 * on the left, meeting place + time in the middle, status panel + history
 * + Show-code action on the right.
 *
 * Mock data only — Statement Store wiring lands in a follow-up.
 */

import {
  Image as ImageIcon,
  MapPin,
  Pencil,
  QrCode,
  Users as UsersIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useOffersContext } from "../../context/OffersContext";
import { useWalletContext } from "../../context/WalletContext";
import type { SendProposalChange } from "../../hooks/useDirectTradeChannel";
import { useDirectTradeChannel } from "../../hooks/useDirectTradeChannel";
import type { ContractTrade } from "../../hooks/useEscrow";
import { useEscrow } from "../../hooks/useEscrow";
import { ss58ToEvmAddress } from "../../lib/address";
import {
  fmtDateTime,
  fmtDay,
  fmtTime,
  formatAmount,
  shortenAddress,
} from "../../lib/format";
import type { LiveStatus, ProposalKind } from "../../lib/statement-store";
import { myTradeRoles } from "../../lib/trade-roles";
import { tradeStateLabel } from "../../lib/trade-state";
import { MeetingPlaceCard } from "./direct-detail/MeetingPlaceCard";
import { MeetingTimeCard } from "./direct-detail/MeetingTimeCard";
import { ProposalHistoryCard } from "./direct-detail/ProposalHistoryCard";
import { TimelineCard } from "./direct-detail/TimelineCard";
import type { MeetingLocation, Proposal, Role } from "./direct-detail/types";
import { DirectHandoffFlow } from "./DirectHandoffFlow";
import { EvidenceAttachedBanner } from "./EvidenceAttachedBanner";
import { TradeQRCode } from "./TradeQRCode";
import { terminalStatusFor, TradeSettledHero } from "./TradeSettledHero";

// ─── Types ───────────────────────────────────────────────────────────────────

interface MeetingDetails {
  scheduledAt: number | null;
  location: MeetingLocation | null;
  recognition: string;
  photoUrl?: string;
}

interface CounterpartyState {
  address: string;
  status: LiveStatus;
  lateBy?: number;
  updatedAt: number;
}

interface DirectTradeDetailProps {
  trade: ContractTrade;
  role: Role;
  decimals: number;
  symbol: string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DirectTradeDetail({
  trade,
  role,
  decimals,
  symbol,
}: DirectTradeDetailProps): JSX.Element {
  const navigate = useNavigate();
  const { refundTrade } = useEscrow();
  const { offers } = useOffersContext();
  const { address: ss58Address } = useWalletContext();
  const myEvmAddress = useMemo(() => {
    if (!ss58Address) return null;
    try {
      return ss58ToEvmAddress(ss58Address).toLowerCase();
    } catch {
      return null;
    }
  }, [ss58Address]);
  // Direction-neutral: I auto-confirm via QR display whenever I'm the
  // contract counterparty (cash-holder). Token-holder side scans + swipes.
  const { iAmCashHolder } = myTradeRoles(trade, myEvmAddress);
  const [refundPending, setRefundPending] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);

  const lockedAtMs = Number(trade.lockedAt) * 1000;
  const expired =
    trade.state === 0 && lockedAtMs + 24 * 60 * 60 * 1000 < Date.now();

  // The trade was opened against an offer; pull its lat/lon as the default
  // meeting place. Statement Store will override with proposed places later.
  const offer = useMemo(
    () => offers.find((o) => o.id === trade.offerId.toString()),
    [offers, trade.offerId],
  );
  const offerLocation = useMemo<MeetingLocation | null>(() => {
    if (
      !offer ||
      typeof offer.lat !== "number" ||
      typeof offer.lon !== "number"
    ) {
      return null;
    }
    const cityCountry = [offer.city, offer.country].filter(Boolean).join(", ");
    return {
      label: offer.city || "Meeting area",
      address:
        cityCountry || `${offer.lat.toFixed(4)}, ${offer.lon.toFixed(4)}`,
      lat: offer.lat,
      lon: offer.lon,
    };
  }, [offer]);

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

  // Direction-neutral: the OTHER side's on-chain address. If I'm cash-holder
  // I'm trade.counterparty, so the other side is trade.locker, and vice versa.
  const counterpartyAddrFull = iAmCashHolder
    ? trade.locker
    : trade.counterparty;

  // Statement Store channel — proposals + counterparty live status.
  const channel = useDirectTradeChannel({
    tradeId: trade.id.toString(),
    counterpartyEvmAddress: counterpartyAddrFull,
  });

  // Map each on-wire proposal (`from` = EVM address) to a UI proposal
  // (`from` = Role) so the leaf cards can compare against `myRole`.
  const proposals = useMemo<Proposal[]>(() => {
    const counterpartyLower = counterpartyAddrFull.toLowerCase();
    return channel.proposals.map((p) => {
      return {
        id: p.id,
        kind: p.kind,
        from: p.from === counterpartyLower ? otherRole(role) : role,
        status: p.status,
        createdAt: p.createdAt,
        ...(p.scheduledAt !== undefined ? { scheduledAt: p.scheduledAt } : {}),
        ...(p.location ? { location: p.location } : {}),
        ...(p.recognition !== undefined ? { recognition: p.recognition } : {}),
      };
    });
  }, [channel.proposals, counterpartyAddrFull, role]);

  // Derive the agreed meet-up from accepted proposals (newest per-kind wins),
  // falling back to the offer's published location for the place.
  const meeting = useMemo<MeetingDetails>(() => {
    const accepted = [...proposals]
      .filter((p) => p.status === "accepted")
      .sort((a, b) => a.createdAt - b.createdAt);
    let scheduledAt: number | null = null;
    let location: MeetingLocation | null = offerLocation;
    let recognition = "";
    for (const p of accepted) {
      if (p.kind === "time" && p.scheduledAt) scheduledAt = p.scheduledAt;
      else if (p.kind === "location" && p.location) location = p.location;
      else if (p.kind === "recognition" && p.recognition !== undefined)
        recognition = p.recognition;
    }
    return { scheduledAt, location, recognition };
  }, [proposals, offerLocation]);

  // Per-kind pending proposals. `proposals` is sorted by createdAt DESC,
  // so the FIRST pending row per kind is the latest one we should surface.
  // Each Meeting card then sees only the pending proposal for its own kind
  // — previously the UI picked one pending across all kinds and silently
  // hid the others (audit Bug 5).
  const pendingByKind = useMemo(() => {
    const out: Partial<Record<ProposalKind, Proposal>> = {};
    for (const p of proposals) {
      if (p.status !== "pending") continue;
      if (!out[p.kind]) out[p.kind] = p;
    }
    return out;
  }, [proposals]);

  // Banner shows the most-recent pending proposal that came FROM the
  // counterparty (so I can accept/decline it). Pending proposals I sent
  // myself surface as "Awaiting reply" pills inside the matching card.
  const incomingPending = useMemo(
    () => proposals.find((p) => p.status === "pending" && p.from !== role),
    [proposals, role],
  );

  // My live heartbeat — kept as local UI state for snappy optimistic feedback
  // (sendStatus awaits a host publish before the DB write), but every change is
  // also pushed to the counterparty over Statement Store.
  const [myStatus, setMyStatusLocal] = useState<LiveStatus>("idle");
  // Default to 5 min so the first "Late" click broadcasts something
  // meaningful instead of "0 min late" (audit Bug 6).
  const [lateMinutes, setLateMinutesLocal] = useState(5);

  // Once the picker is "owned" — hydrated from the DB or changed by the user —
  // local state leads. Guards a late DB read from clobbering a fresh click.
  const statusOwnedRef = useRef(false);

  // Restore my last broadcast status on load. Each `sendStatus` already
  // persisted it to the message-store (as an outgoing row), so a refresh
  // shouldn't reset the picker to "idle"; `channel.myLive` reads that row back.
  // Hydrate once, and never over a status the user has already touched.
  useEffect(() => {
    if (statusOwnedRef.current) return;
    const live = channel.myLive;
    if (!live) return;
    statusOwnedRef.current = true;
    setMyStatusLocal(live.status);
    if (live.lateMinutes !== undefined) setLateMinutesLocal(live.lateMinutes);
  }, [channel.myLive]);

  const setMyStatus = useCallback(
    (s: LiveStatus) => {
      statusOwnedRef.current = true;
      setMyStatusLocal(s);
      const minutes = s === "late" ? lateMinutes : undefined;
      void channel.sendStatus(s, minutes).catch((err) => {
        console.warn("[DirectTradeDetail] sendStatus failed:", err);
      });
    },
    [channel, lateMinutes],
  );

  const setLateMinutes = useCallback(
    (m: number) => {
      setLateMinutesLocal(m);
      if (myStatus === "late") {
        void channel.sendStatus("late", m).catch((err) => {
          console.warn("[DirectTradeDetail] sendStatus failed:", err);
        });
      }
    },
    [channel, myStatus],
  );

  const counterparty: CounterpartyState = useMemo(() => {
    return {
      address: counterpartyAddrFull,
      status: channel.counterpartyLive?.status ?? "idle",
      ...(channel.counterpartyLive?.lateMinutes !== undefined
        ? { lateBy: channel.counterpartyLive.lateMinutes }
        : {}),
      updatedAt: channel.counterpartyLive?.updatedAt ?? 0,
    };
  }, [counterpartyAddrFull, channel.counterpartyLive]);

  const [editing, setEditing] = useState<
    null | "time" | "location" | "recognition"
  >(null);
  const [showQR, setShowQR] = useState(false);
  const [showScan, setShowScan] = useState(false);

  // Cash-holder shows their QR for the token-holder to scan. Token-holder
  // scans + swipes to verify cash and release tokens. Direction-neutral.
  const isTokenHolder = !iAmCashHolder;
  const onPrimary = () => {
    if (isTokenHolder) setShowScan(true);
    else setShowQR(true);
  };

  const tradeAmount = formatAmount(trade.amount, decimals);

  const acceptPending = () => {
    if (!incomingPending) return;
    const wire = channel.proposals.find((p) => p.id === incomingPending.id);
    if (!wire) return;
    void channel.respondToProposal(wire, "accept").catch((err) => {
      console.warn("[DirectTradeDetail] accept failed:", err);
    });
  };
  const declinePending = () => {
    if (!incomingPending) return;
    const wire = channel.proposals.find((p) => p.id === incomingPending.id);
    if (!wire) return;
    void channel.respondToProposal(wire, "decline").catch((err) => {
      console.warn("[DirectTradeDetail] decline failed:", err);
    });
  };

  const sendProposal = (
    kind: ProposalKind,
    change: Partial<MeetingDetails>,
  ) => {
    // `!== undefined` (vs truthy) so an empty `recognition` string flows
    // through as a "clear" proposal. The store layer already accepts it
    // (audit Bug 9). Note `change.scheduledAt` keeps the truthy check
    // because 0 isn't a valid meet-time anyway, and `change.location` is
    // an object so truthy is fine there too.
    const payload: SendProposalChange = {
      ...(change.scheduledAt ? { scheduledAt: change.scheduledAt } : {}),
      ...(change.location ? { location: change.location } : {}),
      ...(change.recognition !== undefined
        ? { recognition: change.recognition }
        : {}),
    };
    void channel.sendProposal(kind, payload).catch((err) => {
      console.warn("[DirectTradeDetail] sendProposal failed:", err);
    });
    setEditing(null);
  };

  // A terminal trade (COMPLETED / REFUNDED / CANCELLED on-chain) is done —
  // nothing left to negotiate, scan, or signal. Swap the full coordination
  // surface for a focused, status-forward summary.
  if (trade.state >= 2) {
    return (
      <TerminalTradeView
        iAmCashHolder={iAmCashHolder}
        tradeAmount={tradeAmount}
        symbol={symbol}
        counterpartyAddr={counterparty.address}
        tradeId={trade.id.toString()}
        meeting={meeting}
        proposals={proposals}
        role={role}
        tradeState={trade.state}
        lockedAtMs={lockedAtMs}
        evidenceCID={trade.evidenceCID}
      />
    );
  }

  return (
    <div className="min-h-screen bg-stone-950 pb-28 lg:pb-12">
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 lg:py-10 space-y-6">
        <Header
          iAmCashHolder={iAmCashHolder}
          tradeAmount={tradeAmount}
          symbol={symbol}
          counterpartyAddr={counterparty.address}
          tradeId={trade.id.toString()}
          scheduledAt={meeting.scheduledAt}
          escrowState={tradeStateLabel(trade.state)}
        />

        {trade.evidenceCID && (
          <EvidenceAttachedBanner cid={trade.evidenceCID} />
        )}

        {expired && role === "provider" && (
          <ExpiredRefundBanner
            amount={tradeAmount}
            symbol={symbol}
            body="The buyer didn't deliver the cash within 24 hours. Claim your locked tokens back to your wallet."
            onClaim={() => void handleRefund()}
            pending={refundPending}
            error={refundError}
          />
        )}

        {incomingPending && !expired && (
          <PendingProposalBanner
            proposal={incomingPending}
            counterpartyAddr={counterparty.address}
            onAccept={acceptPending}
            onDecline={declinePending}
          />
        )}

        {/* Body — 3-column on lg, single column on smaller */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left rail — Timeline + counterparty stats */}
          <div className="lg:col-span-3 space-y-5">
            <TimelineCard
              meetingAt={meeting.scheduledAt}
              meetingPlace={meeting.location?.label ?? null}
              tradeState={trade.state}
              lockedAt={Number(trade.lockedAt) * 1000}
            />
            <CounterpartyCard counterparty={counterparty} />
          </div>

          {/* Middle — Meeting place (map) + meeting time */}
          <div className="lg:col-span-6 space-y-5">
            <MeetingPlaceCard
              location={meeting.location}
              isEditing={editing === "location"}
              myRole={role}
              pendingProposal={pendingByKind.location ?? null}
              onEdit={() => setEditing("location")}
              onCancel={() => setEditing(null)}
              onSend={(location) => sendProposal("location", { location })}
            />
            <MeetingTimeCard
              scheduledAt={meeting.scheduledAt}
              isEditing={editing === "time"}
              myRole={role}
              pendingProposal={pendingByKind.time ?? null}
              onEdit={() => setEditing("time")}
              onCancel={() => setEditing(null)}
              onSend={(scheduledAt) => sendProposal("time", { scheduledAt })}
            />
            <RecognitionCard
              recognition={meeting.recognition}
              photoUrl={meeting.photoUrl}
              role={role}
              isEditing={editing === "recognition"}
              myRole={role}
              pendingProposal={pendingByKind.recognition ?? null}
              onEdit={() => setEditing("recognition")}
              onCancel={() => setEditing(null)}
              onSend={(recognition) =>
                sendProposal("recognition", { recognition })
              }
            />
          </div>

          {/* Right rail — status, history, sticky CTA group */}
          <div className="lg:col-span-3">
            <div className="lg:sticky lg:top-20 space-y-5">
              <YourStatusCard
                myStatus={myStatus}
                lateMinutes={lateMinutes}
                onSetMyStatus={setMyStatus}
                onSetLateMinutes={setLateMinutes}
              />
              <ProposalHistoryCard
                proposals={proposals}
                myRole={role}
                counterpartyAddr={counterparty.address}
              />
              <StickyCtaGroup
                isTokenHolder={isTokenHolder}
                onPrimary={onPrimary}
                lockedAt={Number(trade.lockedAt) * 1000}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Mobile sticky CTA */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-gradient-to-t from-stone-950 via-stone-950/95 to-transparent pt-6 pb-4 px-4">
        <button
          onClick={onPrimary}
          className="w-full rounded-xl bg-stone-100 text-stone-900 px-4 py-3.5 text-sm font-medium hover:bg-white transition-colors flex items-center justify-center gap-2"
        >
          <QrCode className="w-4 h-4" />
          {isTokenHolder ? "Scan their code" : "Show payment code"}
        </button>
      </div>

      {showQR && (
        <TradeQRCode
          tradeId={trade.id.toString()}
          role={role}
          amount={tradeAmount}
          symbol={symbol}
          variant="direct"
          autoConfirm={iAmCashHolder}
          onClose={() => setShowQR(false)}
        />
      )}

      {showScan && (
        <DirectHandoffFlow
          expectedTradeId={trade.id}
          onClose={() => setShowScan(false)}
          onTradeUpdated={() => {
            // Trade has settled — bounce back to profile so the table
            // refreshes off the new state. Detail page can refetch later.
            navigate("/profile");
          }}
        />
      )}
    </div>
  );
}

// ─── Settled trade (done) view ───────────────────────────────────────────────

/**
 * Focused summary shown once a direct trade reaches a terminal state
 * (COMPLETED / REFUNDED / CANCELLED). Strips every coordination affordance —
 * live status, QR scan/show, proposal editing, cancel/refund — and keeps only
 * what's worth looking back at: the outcome, the amount, who it was with, the
 * timeline, and the proposal history. Styled to read clearly as "done".
 */
function TerminalTradeView({
  iAmCashHolder,
  tradeAmount,
  symbol,
  counterpartyAddr,
  tradeId,
  meeting,
  proposals,
  role,
  tradeState,
  lockedAtMs,
  evidenceCID,
}: {
  iAmCashHolder: boolean;
  tradeAmount: string;
  symbol: string;
  counterpartyAddr: string;
  tradeId: string;
  meeting: MeetingDetails;
  proposals: Proposal[];
  role: Role;
  tradeState: number;
  lockedAtMs: number;
  evidenceCID: string;
}): JSX.Element {
  const hasHistory = proposals.some((p) => p.status !== "pending");
  return (
    <div className="min-h-screen bg-stone-950 pb-12">
      <div className="max-w-3xl mx-auto px-4 lg:px-8 py-8 lg:py-12 space-y-6">
        <TradeSettledHero
          state={tradeState}
          amount={tradeAmount}
          symbol={symbol}
          subtitle={
            tradeState === 2 ? (
              <>
                {iAmCashHolder ? "Received from" : "Released to"}{" "}
                <span className="mono text-stone-200">
                  {shortenAddress(counterpartyAddr)}
                </span>
              </>
            ) : (
              <>
                with{" "}
                <span className="mono text-stone-200">
                  {shortenAddress(counterpartyAddr)}
                </span>
              </>
            )
          }
          meta={[
            { label: "Trade", value: `#${tradeId}` },
            {
              label: "Met",
              value: meeting.scheduledAt ? fmtTime(meeting.scheduledAt) : "—",
              ...(meeting.scheduledAt
                ? { sub: fmtDay(meeting.scheduledAt) }
                : {}),
            },
            {
              label: "Status",
              value: terminalStatusFor(tradeState).label,
              sub: "Direct",
            },
          ]}
        />

        {evidenceCID && <EvidenceAttachedBanner cid={evidenceCID} />}

        {/* Necessary info only — lifecycle timeline + proposal history */}
        <div
          className={`grid grid-cols-1 gap-5 ${hasHistory ? "lg:grid-cols-2" : ""}`}
        >
          <TimelineCard
            meetingAt={meeting.scheduledAt}
            meetingPlace={meeting.location?.label ?? null}
            tradeState={tradeState}
            lockedAt={lockedAtMs}
          />
          {hasHistory && (
            <ProposalHistoryCard
              proposals={proposals}
              myRole={role}
              counterpartyAddr={counterpartyAddr}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Header (split: amount + meta-rail) ──────────────────────────────────────

function Header({
  iAmCashHolder,
  tradeAmount,
  symbol,
  counterpartyAddr,
  tradeId,
  scheduledAt,
  escrowState,
}: {
  iAmCashHolder: boolean;
  tradeAmount: string;
  symbol: string;
  counterpartyAddr: string;
  tradeId: string;
  scheduledAt: number | null;
  escrowState: string;
}): JSX.Element {
  const whenValue = scheduledAt ? fmtTime(scheduledAt) : "—";
  const whenSub = scheduledAt ? whenSubFromNow(scheduledAt) : "Not set";
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-8 lg:items-end">
      {/* Amount block */}
      <div className="lg:col-span-7">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[10px] uppercase tracking-[0.18em] text-stone-500 font-medium">
            {iAmCashHolder ? "You receive" : "You release"}
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded-md border border-emerald-500/30 bg-emerald-500/5 text-emerald-300">
            <UsersIcon className="w-3 h-3" />
            Direct
          </span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="mono text-5xl lg:text-7xl text-stone-50 font-medium leading-none tracking-tight">
            {tradeAmount}
          </span>
          <span className="text-stone-500 text-2xl lg:text-3xl">{symbol}</span>
        </div>
        <p className="text-sm text-stone-400 mt-3">
          {iAmCashHolder ? "from" : "to"}{" "}
          <span className="mono text-stone-200">
            {shortenAddress(counterpartyAddr)}
          </span>
        </p>
      </div>

      {/* Meta-rail */}
      <div className="lg:col-span-5 grid grid-cols-3 rounded-2xl border border-stone-800 divide-x divide-stone-800 overflow-hidden">
        <MetaCol label="Trade" value={`#${tradeId}`} />
        <MetaCol label="When" value={whenValue} sub={whenSub} />
        <MetaCol label="Escrow" value={escrowState} sub="Direct" />
      </div>
    </div>
  );
}

function whenSubFromNow(ms: number): string {
  const minutes = Math.round((ms - Date.now()) / 60_000);
  if (minutes >= 60) {
    return `${fmtDay(ms)} · in ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }
  if (minutes >= 0) return `${fmtDay(ms)} · in ${minutes} min`;
  return `${fmtDay(ms)} · ${Math.abs(minutes)}m ago`;
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
    <div className="px-4 py-3.5 min-w-0">
      <p className="text-[10px] uppercase tracking-[0.16em] text-stone-500 font-medium">
        {label}
      </p>
      <p className="mono text-stone-100 text-sm mt-1.5 truncate">{value}</p>
      {sub && (
        <p className="text-stone-500 text-[11px] mt-0.5 truncate">{sub}</p>
      )}
    </div>
  );
}

// ─── Expired refund banner ──────────────────────────────────────────────────

function ExpiredRefundBanner({
  amount,
  symbol,
  body,
  onClaim,
  pending,
  error,
}: {
  amount: string;
  symbol: string;
  body: string;
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
          <p className="text-sm font-medium text-stone-100">Trade expired</p>
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
        {pending ? (
          "Claiming…"
        ) : (
          <>
            Claim{" "}
            <span className="mono">
              {amount} {symbol}
            </span>
          </>
        )}
      </button>
    </div>
  );
}

// ─── Pending proposal banner ────────────────────────────────────────────────

function PendingProposalBanner({
  proposal,
  counterpartyAddr,
  onAccept,
  onDecline,
}: {
  proposal: Proposal;
  counterpartyAddr: string;
  onAccept: () => void;
  onDecline: () => void;
}): JSX.Element {
  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/[0.06] px-4 py-3.5 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        <span
          className="mt-1.5 w-2 h-2 rounded-full bg-amber-400 shrink-0"
          aria-hidden
        />
        <div className="min-w-0">
          <p className="text-sm text-amber-100">
            <span className="mono">{shortenAddress(counterpartyAddr)}</span>{" "}
            proposed a new{" "}
            {proposal.kind === "time"
              ? "time"
              : proposal.kind === "location"
                ? "place"
                : "recognition note"}
          </p>
          <p
            className={`text-xs text-amber-200/80 mt-1 ${proposal.kind === "recognition" ? "" : "mono"}`}
          >
            {proposal.scheduledAt
              ? fmtDateTime(proposal.scheduledAt)
              : proposal.location
                ? `${proposal.location.label} · ${proposal.location.address}`
                : (proposal.recognition ?? "")}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onDecline}
          className="px-3.5 py-2 rounded-lg text-xs text-stone-300 hover:text-stone-100 hover:bg-stone-800 transition-colors border border-stone-700"
        >
          Decline
        </button>
        <button
          onClick={onAccept}
          className="px-4 py-2 rounded-lg text-xs font-medium bg-amber-300 text-stone-900 hover:bg-amber-200 transition-colors"
        >
          Accept
        </button>
      </div>
    </div>
  );
}

// ─── Counterparty card (left rail bottom) ────────────────────────────────────

function CounterpartyCard({
  counterparty,
}: {
  counterparty: CounterpartyState;
}): JSX.Element {
  const dotColor =
    counterparty.status === "late"
      ? "bg-amber-400"
      : counterparty.status === "here"
        ? "bg-emerald-400"
        : counterparty.status === "on-the-way"
          ? "bg-sky-400"
          : "bg-stone-600";
  const statusText =
    counterparty.status === "late"
      ? `Running late · ${counterparty.lateBy ?? "?"} min`
      : counterparty.status === "here"
        ? "is here"
        : counterparty.status === "on-the-way"
          ? "On the way"
          : "No update yet";
  return (
    <div className="rounded-2xl border border-stone-800 bg-stone-900/40 p-5">
      <p className="text-[10px] uppercase tracking-[0.16em] text-stone-500 font-medium mb-3">
        Counterparty
      </p>
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
        <span className="mono text-sm text-stone-100">
          {shortenAddress(counterparty.address)}
        </span>
      </div>
      <p className="text-xs text-stone-500 mt-1.5">{statusText}</p>
    </div>
  );
}

// ─── Recognition card ────────────────────────────────────────────────────────

function RecognitionCard({
  recognition,
  photoUrl,
  role,
  isEditing,
  myRole,
  pendingProposal,
  onEdit,
  onCancel,
  onSend,
}: {
  recognition: string;
  photoUrl?: string;
  role: Role;
  isEditing: boolean;
  myRole: Role;
  pendingProposal: Proposal | null;
  onEdit: () => void;
  onCancel: () => void;
  onSend: (recognition: string) => void;
}): JSX.Element {
  const [draft, setDraft] = useState(recognition);
  const empty = !recognition || recognition.trim().length === 0;
  const them = role === "buyer" ? "provider" : "buyer";
  return (
    <div className="rounded-2xl border border-stone-800 bg-stone-900/40 p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-stone-500 font-medium">
            How to find the {them}
          </p>
          <p className="text-[11px] text-stone-600 mt-0.5">
            {role === "buyer"
              ? "What the provider looks like and where they'll be."
              : "Help the buyer recognize you at the meeting."}
          </p>
        </div>
        {!isEditing && (
          <button
            onClick={onEdit}
            className="text-xs text-stone-300 hover:text-stone-100 px-3 py-1.5 rounded-lg border border-stone-800 hover:border-stone-700 hover:bg-stone-800/50 transition-colors flex items-center gap-1.5 shrink-0"
          >
            <Pencil className="w-3 h-3" />
            {empty ? "Add note" : "Propose new"}
          </button>
        )}
      </div>

      {empty && !isEditing ? (
        <p className="text-stone-500 text-sm italic">
          {role === "buyer"
            ? "The provider hasn't added a recognition note yet."
            : "Add a note so the buyer can find you at the meeting place."}
        </p>
      ) : (
        <p className="text-stone-200 text-sm leading-relaxed whitespace-pre-wrap">
          {recognition}
        </p>
      )}

      {photoUrl ? (
        <img
          src={photoUrl}
          alt="Recognition photo"
          className="mt-4 w-full h-44 object-cover rounded-xl border border-stone-800"
        />
      ) : (
        !empty && (
          <div className="mt-4 flex items-center gap-2 text-stone-600 text-xs">
            <ImageIcon className="w-4 h-4" />
            <span>No photo provided</span>
          </div>
        )
      )}

      {pendingProposal && pendingProposal.from === myRole && !isEditing && (
        <div className="mt-3 rounded-xl bg-stone-800/50 border border-stone-700/60 px-3 py-2 flex items-center justify-between gap-2">
          <span className="text-xs text-stone-400 truncate">
            You proposed a new note
          </span>
          <span className="text-[10px] text-stone-500 uppercase tracking-wider whitespace-nowrap">
            Awaiting reply
          </span>
        </div>
      )}

      {isEditing && (
        <div className="mt-4 space-y-3 border-t border-stone-800 pt-4">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Wearing a navy jacket and black backpack — at the table by the window…"
            rows={3}
            className="w-full bg-stone-900 border border-stone-800 rounded-xl px-4 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-stone-600 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={onCancel}
              className="flex-1 rounded-xl border border-stone-800 px-3 py-2 text-sm text-stone-300 hover:bg-stone-900 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onSend(draft.trim())}
              className="flex-1 rounded-xl bg-stone-100 text-stone-900 px-3 py-2 text-sm font-medium hover:bg-white transition-colors"
            >
              {draft.trim() ? "Send proposal" : "Clear note"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Right rail: status, other party, history, code button ─────────────────

function YourStatusCard({
  myStatus,
  lateMinutes,
  onSetMyStatus,
  onSetLateMinutes,
}: {
  myStatus: LiveStatus;
  lateMinutes: number;
  onSetMyStatus: (s: LiveStatus) => void;
  onSetLateMinutes: (m: number) => void;
}): JSX.Element {
  const [sharingLocation, setSharingLocation] = useState(false);
  return (
    <div className="rounded-2xl border border-stone-800 bg-stone-900/40 p-5 space-y-3">
      <p className="text-[10px] uppercase tracking-[0.16em] text-stone-500 font-medium">
        Your status
      </p>
      <div className="grid grid-cols-3 gap-2">
        <StatusBlock
          active={myStatus === "on-the-way"}
          onClick={() => onSetMyStatus("on-the-way")}
          dot="bg-blue-400"
        >
          On <br />
          my way
        </StatusBlock>
        <StatusBlock
          active={myStatus === "here"}
          onClick={() => onSetMyStatus("here")}
          dot="bg-emerald-400"
        >
          I'm <br />
          here
        </StatusBlock>
        <StatusBlock
          active={myStatus === "late"}
          onClick={() => onSetMyStatus("late")}
          dot="bg-amber-400"
        >
          Running <br />
          late
        </StatusBlock>
      </div>
      {myStatus === "late" && (
        <div className="flex items-center gap-2 pt-1">
          <span className="text-stone-500 text-xs shrink-0">Min late:</span>
          <div className="flex gap-1 flex-wrap">
            {[5, 10, 15, 30].map((m) => (
              <button
                key={m}
                onClick={() => onSetLateMinutes(m)}
                className={`px-2 py-0.5 rounded-md text-[11px] ${
                  lateMinutes === m
                    ? "bg-stone-100 text-stone-900"
                    : "bg-stone-800 text-stone-400 hover:bg-stone-700"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      )}
      <button
        onClick={() => setSharingLocation((s) => !s)}
        className={`mt-1 w-full rounded-xl border px-3 py-2.5 text-xs flex items-center justify-center gap-2 transition-colors ${
          sharingLocation
            ? "border-emerald-500/30 bg-emerald-500/[0.06] text-emerald-200"
            : "border-stone-800 text-stone-300 hover:border-stone-700 hover:bg-stone-800/40"
        }`}
      >
        {sharingLocation ? (
          <>
            <span className="relative inline-flex items-center justify-center">
              <span className="block h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span className="absolute inline-block h-2.5 w-2.5 rounded-full bg-emerald-400 opacity-40 animate-ping" />
            </span>
            Sharing live location
          </>
        ) : (
          <>
            <MapPin className="w-3.5 h-3.5" />
            Share my location
          </>
        )}
      </button>
    </div>
  );
}

function StatusBlock({
  active,
  onClick,
  dot,
  children,
}: {
  active: boolean;
  onClick: () => void;
  dot: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      className={`relative px-2 py-3 rounded-xl text-[11px] leading-tight font-medium border transition-colors text-center ${
        active
          ? "border-stone-100/30 bg-stone-100/5 text-stone-100"
          : "border-stone-800 text-stone-400 hover:border-stone-700 hover:bg-stone-800/40"
      }`}
    >
      {active && (
        <span
          className={`absolute top-2 left-2 w-1.5 h-1.5 rounded-full ${dot}`}
        />
      )}
      {children}
    </button>
  );
}

function StickyCtaGroup({
  isTokenHolder,
  onPrimary,
  lockedAt,
}: {
  isTokenHolder: boolean;
  onPrimary: () => void;
  lockedAt: number;
}): JSX.Element {
  // Escrow auto-refund window matches the contract: 24h from lockedAt
  const refundAtMs = lockedAt + 24 * 3_600_000;
  const remainingMs = Math.max(0, refundAtMs - Date.now());
  const hh = Math.floor(remainingMs / 3_600_000);
  const mm = Math.floor((remainingMs % 3_600_000) / 60_000);
  return (
    <div className="hidden lg:block space-y-2">
      <button
        onClick={onPrimary}
        className="w-full rounded-xl bg-stone-100 text-stone-900 px-5 py-3 text-sm font-medium hover:bg-white transition-colors flex items-center justify-center gap-2"
      >
        <QrCode className="w-4 h-4" />
        {isTokenHolder ? "Scan their code" : "Show payment code"}
      </button>
      <button className="w-full rounded-lg border border-stone-800 bg-stone-950/40 px-3 py-2 text-xs text-stone-400 hover:border-rose-500/40 hover:text-rose-300 transition-colors">
        Cancel trade
      </button>
      <p className="text-center text-[10px] text-stone-600">
        {remainingMs > 0 ? (
          <>
            Auto-refund available{" "}
            <span className="mono text-stone-500">
              in {hh}h {mm}m
            </span>
          </>
        ) : (
          <span className="text-stone-500">Auto-refund available now</span>
        )}
      </p>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function otherRole(r: Role): Role {
  return r === "buyer" ? "provider" : "buyer";
}
