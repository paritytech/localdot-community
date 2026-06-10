import { ScanLine } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { EmptyState } from "../components/common/EmptyState";
import { Modal, ModalBody, ModalHeader } from "../components/common/Modal";
import { Spinner } from "../components/common/Spinner";
import { PhotoThumbnail } from "../components/profile/PhotoThumbnail";
import { PhotoUpload } from "../components/profile/PhotoUpload";
import { TabButton } from "../components/profile/TabButton";
import { AgencyTab } from "../components/profile/tabs/AgencyTab";
import { CompletedTradesTab } from "../components/profile/tabs/CompletedTradesTab";
import { OffersTab } from "../components/profile/tabs/OffersTab";
import { RequestsTab } from "../components/profile/tabs/RequestsTab";
import { SentRequestsTab } from "../components/profile/tabs/SentRequestsTab";
import {
  type TradeAction,
  TradesTab,
} from "../components/profile/tabs/TradesTab";
import { VerifiedBadge, ZKPassportVerify } from "../components/zkpassport";
import { useOffersContext } from "../context/OffersContext";
import { useWalletContext } from "../context/WalletContext";
import { useAsyncEffect } from "../hooks/useAsyncEffect";
import { useAutoRefresh } from "../hooks/useAutoRefresh";
import type { ContractTrade } from "../hooks/useEscrow";
import { useEscrow } from "../hooks/useEscrow";
import { type ContractAgent, useP2PMarket } from "../hooks/useP2PMarket";
import {
  type IncomingRequest,
  useTradeRequests,
} from "../hooks/useTradeRequests";
import { useZKPassport } from "../hooks/useZKPassport";
import { ss58ToEvmAddress } from "../lib/address";
import { getAgentViaSubstrate } from "../lib/host";
import { getPhotoCid, removePhotoCid } from "../lib/photo";
import type { Offer } from "../types/offers";

const LockFundsModal = lazy(() => import("../components/trade/LockFundsModal"));
const AgentHandoffFlow = lazy(() =>
  import("../components/trade/AgentHandoffFlow").then((m) => {
    return {
      default: m.AgentHandoffFlow,
    };
  }),
);

export default function Profile(): JSX.Element {
  const { address: urlAddress } = useParams();
  const {
    address: walletAddress,
    accountName,
    connect,
    nativeCurrency,
    evmDecimals,
  } = useWalletContext();
  const { offers } = useOffersContext();
  const { confirmTrade, requestCancel, refundTrade } = useEscrow();

  const profileAddress = urlAddress ?? walletAddress;
  const isOwn = profileAddress === walletAddress;

  // zkpassport verification state
  const {
    isVerified: zkVerified,
    attestation,
    isLoading: zkLoading,
  } = useZKPassport({ autoRefresh: true });
  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [showZkHowItWorks, setShowZkHowItWorks] = useState(false);

  // Photo state
  const [photoCid, setPhotoCid] = useState<string | null>(null);

  useEffect(() => {
    if (profileAddress) {
      setPhotoCid(getPhotoCid(profileAddress));
    }
  }, [profileAddress]);

  const handlePhotoUploaded = useCallback((cid: string) => {
    setPhotoCid(cid);
  }, []);

  const handlePhotoRemoved = useCallback(() => {
    if (profileAddress) {
      removePhotoCid(profileAddress);
      setPhotoCid(null);
    }
  }, [profileAddress]);

  // Trade state
  const { getTrade, getUserTrades } = useEscrow();
  const [trades, setTrades] = useState<ContractTrade[]>([]);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<{
    tradeId: bigint;
    action: TradeAction;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lockRequest, setLockRequest] = useState<{
    req: IncomingRequest;
    offer: Offer | undefined;
    /** Which side of the trade is opening the modal — drives counterparty + copy. */
    side: "provider" | "buyer";
  } | null>(null);

  // Statement Store — incoming trade requests + sent requests
  const {
    requests,
    sentRequests,
    acceptedAwaitingLock,
    declineRequest,
    acceptRequest,
    clearAwaitingLock,
    clearRequest,
    clearDoneRequests,
    error: requestsError,
  } = useTradeRequests();

  const pendingRequests = requests.filter(
    (r) => !r.status || r.status === "pending",
  );
  const hasSentRequests = sentRequests.length > 0;
  const hasRequests = pendingRequests.length > 0;

  // Agent state — check if this wallet is a registered agent
  const {
    stakeInsurance,
    unstakeInsurance,
    deactivateAgent,
    reactivateAgent,
    removeAgent,
  } = useP2PMarket();
  const [myAgent, setMyAgent] = useState<ContractAgent | null>(null);
  const [showScan, setShowScan] = useState(false);

  type TabId =
    | "requests"
    | "sent"
    | "trades"
    | "completed"
    | "offers"
    | "agency";
  const TAB_IDS: readonly TabId[] = [
    "requests",
    "sent",
    "trades",
    "completed",
    "offers",
    "agency",
  ];
  // `?tab=` deep-link target — used by notification clicks (e.g. a trade
  // request routes to /profile?tab=requests). Null when absent or unrecognised.
  const [searchParams] = useSearchParams();
  const paramTab = TAB_IDS.find((t) => t === searchParams.get("tab")) ?? null;
  const [activeTab, setActiveTab] = useState<TabId>(
    paramTab ??
      (hasRequests ? "requests" : hasSentRequests ? "sent" : "trades"),
  );

  // Follow the deep-link when it changes — the useState initializer only runs
  // once, so a notification click while Profile is already mounted needs this
  // to actually switch tabs.
  useEffect(() => {
    if (paramTab !== null) setActiveTab(paramTab);
  }, [paramTab]);

  // Profile URL may contain either an SS58 or an EVM address (request.from is EVM)
  const evmAddress = profileAddress
    ? profileAddress.startsWith("0x") && profileAddress.length === 42
      ? profileAddress.toLowerCase()
      : ss58ToEvmAddress(profileAddress)
    : null;

  const myOffers = evmAddress
    ? offers.filter((o) => evmAddress.toLowerCase() === o.owner.toLowerCase())
    : [];

  const reloadAgent = useCallback(async () => {
    if (!evmAddress) return;
    const found = await getAgentViaSubstrate(evmAddress);
    setMyAgent(found);
  }, [evmAddress]);

  useAsyncEffect(
    async (isCancelled) => {
      if (!evmAddress || !isOwn) return;
      const found = await getAgentViaSubstrate(evmAddress);
      if (!isCancelled()) setMyAgent(found);
    },
    [evmAddress, isOwn],
  );

  useAsyncEffect(
    async (isCancelled) => {
      if (!evmAddress) return;
      setTradesLoading(true);
      try {
        const ids = await getUserTrades(evmAddress);
        if (isCancelled()) return;
        if (ids.length === 0) {
          setTrades([]);
          return;
        }
        const fetched = await Promise.all(ids.map((id) => getTrade(id)));
        if (!isCancelled()) setTrades(fetched);
      } catch (err) {
        if (!isCancelled()) {
          setError(
            err instanceof Error ? err.message : "Failed to load trades",
          );
        }
      } finally {
        if (!isCancelled()) setTradesLoading(false);
      }
    },
    [evmAddress, getTrade, getUserTrades],
  );

  // Silent background reload — used by auto-refresh so the trades list stays
  // current (state changes, awaiting-lock clearing) without a manual reload
  // and without flashing the loading spinner.
  const reloadTrades = useCallback(async () => {
    if (!evmAddress) return;
    try {
      const ids = await getUserTrades(evmAddress);
      if (ids.length === 0) {
        setTrades([]);
        return;
      }
      const fetched = await Promise.all(ids.map((id) => getTrade(id)));
      setTrades(fetched);
    } catch {
      // background refresh — keep last good data, next tick retries
    }
  }, [evmAddress, getTrade, getUserTrades]);

  // Poll trades while the tab is visible and refetch when the user returns,
  // so on-chain state changes (and the awaiting-lock card clearing once the
  // buyer's lockTrade lands) surface on their own.
  useAutoRefresh(reloadTrades, {
    intervalMs: 20_000,
    enabled: !!evmAddress,
  });

  // Match awaiting-lock entries against the latest trades — drop the local
  // entry once the buyer's lockTrade has landed on chain.
  useEffect(() => {
    if (!acceptedAwaitingLock.length || trades.length === 0) return;
    for (const entry of acceptedAwaitingLock) {
      const matched = trades.find(
        (t) =>
          t.offerId.toString() === entry.req.offerId &&
          t.locker.toLowerCase() === entry.req.from.toLowerCase() &&
          t.state === 0,
      );
      if (matched) clearAwaitingLock(entry.req.id);
    }
  }, [trades, acceptedAwaitingLock, clearAwaitingLock]);

  const handleTradeAction = async (tradeId: bigint, action: TradeAction) => {
    setPendingAction({ tradeId, action });
    setError(null);
    try {
      if (action === "confirm") await confirmTrade(tradeId);
      else if (action === "cancel") await requestCancel(tradeId);
      else if (action === "refund") await refundTrade(tradeId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transaction failed");
    } finally {
      setPendingAction(null);
    }
  };

  if (!profileAddress) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-16">
        <EmptyState
          title="Connect your wallet"
          description="View your trades and offers."
          action={{ label: "Connect Wallet", onClick: connect }}
        />
      </div>
    );
  }

  // ss58ToEvmAddress can yield "" for a malformed address; only classify
  // trades when we actually know who the viewer is.
  const meLower = evmAddress ? evmAddress.toLowerCase() : "";
  const activeTrades = trades.filter((t) => {
    if (t.state !== 0 && t.state !== 1) return false;
    if (!meLower) return true;
    // Agents are purely scan-driven — never list a trade where the viewer is
    // only the mediating agent. Surfacing it would expose the buyer/provider
    // to the agent, who should only ever scan a customer's QR.
    const isAgentOnly =
      t.agent.toLowerCase() === meLower &&
      t.locker.toLowerCase() !== meLower &&
      t.counterparty.toLowerCase() !== meLower;
    return !isAgentOnly;
  });
  const activeTradeCount = activeTrades.length;
  const completedTrades = trades.filter((t) => t.state >= 2);
  const completedTradeCount = completedTrades.length;

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-12">
      {/* Profile header */}
      <div className="flex items-center gap-4 mb-8">
        {isOwn ? (
          <PhotoUpload
            userId={profileAddress}
            currentPhotoCid={photoCid}
            onPhotoUploaded={handlePhotoUploaded}
            onPhotoRemoved={handlePhotoRemoved}
          />
        ) : (
          <PhotoThumbnail
            cid={photoCid}
            address={profileAddress}
            size="lg"
            className="border-2 border-stone-700"
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg text-stone-100 font-medium truncate">
              {isOwn ? accountName?.trim() || "Your Profile" : "Profile"}
            </h2>
            {isOwn && (
              <span className="text-[10px] uppercase tracking-wider text-stone-500 bg-stone-800 px-2 py-0.5 rounded-full">
                You
              </span>
            )}
            {zkVerified && (
              <VerifiedBadge
                countryCode={attestation?.countryCode}
                size="sm"
                showText={true}
              />
            )}
          </div>
          <p className="mono text-xs text-stone-500 truncate select-all">
            {profileAddress}
          </p>
        </div>
        {isOwn && myAgent && (
          <button
            onClick={() => setShowScan(true)}
            className="shrink-0 inline-flex items-center gap-2 rounded-xl bg-stone-100 text-stone-900 px-4 py-2.5 text-sm font-medium hover:bg-white transition-colors"
          >
            <ScanLine className="w-4 h-4" />
            <span className="hidden sm:inline">Scan QR Code</span>
            <span className="sm:hidden">Scan</span>
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg border border-red-800/50 bg-red-900/10">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {requestsError && (
        <div className="mb-4 px-4 py-3 rounded-lg border border-red-800/50 bg-red-900/10">
          <p className="text-sm text-red-400">
            Statement Store: {requestsError}
          </p>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex border-b border-stone-800 mb-6">
        {hasRequests && isOwn && (
          <TabButton
            active={activeTab === "requests"}
            count={pendingRequests.length}
            countColor="bg-amber-900/50 text-amber-400"
            onClick={() => setActiveTab("requests")}
          >
            Received
          </TabButton>
        )}
        {hasSentRequests && isOwn && (
          <TabButton
            active={activeTab === "sent"}
            count={sentRequests.length}
            countColor="bg-stone-700 text-stone-300"
            onClick={() => setActiveTab("sent")}
          >
            Sent
          </TabButton>
        )}
        <TabButton
          active={activeTab === "trades"}
          count={activeTradeCount}
          countColor="bg-green-900/50 text-green-400"
          onClick={() => setActiveTab("trades")}
        >
          Active Trades
        </TabButton>
        {completedTradeCount > 0 && (
          <TabButton
            active={activeTab === "completed"}
            count={completedTradeCount}
            countColor="bg-stone-700 text-stone-300"
            onClick={() => setActiveTab("completed")}
          >
            Completed
          </TabButton>
        )}
        {isOwn && (
          <TabButton
            active={activeTab === "offers"}
            count={myOffers.length}
            countColor="bg-stone-700 text-stone-300"
            onClick={() => setActiveTab("offers")}
          >
            My Offers
          </TabButton>
        )}
        {isOwn && myAgent && (
          <TabButton
            active={activeTab === "agency"}
            count={0}
            countColor=""
            onClick={() => setActiveTab("agency")}
          >
            My Agency
          </TabButton>
        )}
      </div>

      {/* Tab content */}
      {activeTab === "requests" && isOwn && (
        <RequestsTab
          requests={pendingRequests}
          offers={offers}
          acceptedAwaitingLock={acceptedAwaitingLock}
          onClearAwaitingLock={clearAwaitingLock}
          onLockFunds={(req, offer) =>
            setLockRequest({ req, offer, side: "provider" })
          }
          onAccept={async (req, offer) => {
            try {
              await acceptRequest(req, {
                awaitingBuyerLock: offer?.role === "buyer",
              });
            } catch (err) {
              setError(err instanceof Error ? err.message : "Accept failed");
            }
          }}
          onDecline={async (req) => {
            try {
              await declineRequest(req);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Decline failed");
            }
          }}
        />
      )}
      {activeTab === "sent" && isOwn && (
        <SentRequestsTab
          sentRequests={sentRequests}
          offers={offers}
          onLockFunds={(req, offer) =>
            setLockRequest({ req, offer, side: "buyer" })
          }
          clearRequest={clearRequest}
          clearDoneRequests={clearDoneRequests}
        />
      )}
      {activeTab === "trades" && (
        <TradesTab
          trades={activeTrades}
          loading={tradesLoading}
          evmAddress={evmAddress!}
          decimals={evmDecimals}
          symbol={nativeCurrency.symbol}
          isOwn={isOwn}
          onAction={handleTradeAction}
          pendingAction={pendingAction}
        />
      )}
      {activeTab === "completed" && (
        <CompletedTradesTab
          trades={completedTrades}
          loading={tradesLoading}
          evmAddress={evmAddress!}
          decimals={evmDecimals}
          symbol={nativeCurrency.symbol}
        />
      )}
      {activeTab === "offers" && isOwn && <OffersTab offers={myOffers} />}
      {activeTab === "agency" && isOwn && myAgent && (
        <AgencyTab
          agent={myAgent}
          decimals={evmDecimals}
          symbol={nativeCurrency.symbol}
          onStake={async (amount: string) => {
            await stakeInsurance(amount);
            await reloadAgent();
          }}
          onUnstake={async (amount: string) => {
            await unstakeInsurance(amount);
            await reloadAgent();
          }}
          onDeactivate={async () => {
            await deactivateAgent();
            await reloadAgent();
          }}
          onReactivate={async () => {
            await reactivateAgent();
            await reloadAgent();
          }}
          onRemove={async () => {
            await removeAgent();
            setMyAgent(null);
            setActiveTab("trades");
          }}
        />
      )}

      {/* Lock Funds modal — opened from either side of the trade.
          - provider side (SELL): counterparty is the requester (req.from);
            after lock we publish SS accept so the buyer sees state=LOCKED.
          - buyer side (BUY): counterparty is the offer owner (provider);
            provider already SS-accepted, so locking just commits on chain. */}
      {lockRequest && (
        <Suspense fallback={null}>
          <LockFundsModal
            open={!!lockRequest}
            onClose={() => setLockRequest(null)}
            counterpartyAddress={
              lockRequest.side === "provider"
                ? lockRequest.req.from
                : (lockRequest.offer?.owner ?? "")
            }
            agentAddress={lockRequest.req.agent}
            offerId={lockRequest.offer ? BigInt(lockRequest.offer.id) : 0n}
            amount={lockRequest.req.amount}
            currency={lockRequest.req.cur}
            nativeSymbol={nativeCurrency.symbol}
            title={
              lockRequest.side === "provider"
                ? "Accept & Lock Funds"
                : "Lock Funds"
            }
            subtitle={
              lockRequest.side === "provider"
                ? "Accept this trade request"
                : "Provider accepted — lock tokens to start the trade"
            }
            onLocked={() => {
              if (lockRequest && lockRequest.side === "provider") {
                void acceptRequest(lockRequest.req);
              }
              setLockRequest(null);
            }}
          />
        </Suspense>
      )}

      {/* Agent QR scanner — the agent's only operational entry point. Opens
          the verify → confirm flow with no fixed trade id, so it accepts any
          trade assigned to this agent and branches on its on-chain state. */}
      {showScan && (
        <Suspense fallback={null}>
          <AgentHandoffFlow
            onClose={() => setShowScan(false)}
            onTradeUpdated={() => void reloadTrades()}
          />
        </Suspense>
      )}

      {/* Identity verification section */}
      {isOwn && (
        <div className="mt-10 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-stone-400">
              Identity Verification
            </h3>
            <button
              onClick={() => setShowZkHowItWorks(!showZkHowItWorks)}
              className="flex items-center gap-1.5 text-xs text-stone-500 hover:text-stone-400 transition-colors"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="opacity-70"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <path d="M12 17h.01" />
              </svg>
              How it works
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={`transition-transform ${showZkHowItWorks ? "rotate-180" : ""}`}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>

          {showZkHowItWorks && (
            <div className="p-4 rounded-xl bg-stone-900/50 border border-stone-800 text-xs text-stone-400 space-y-2">
              <p>
                <strong className="text-stone-300">What is zkpassport?</strong>
                <br />
                zkpassport uses zero-knowledge proofs to verify your identity
                without revealing personal information.
              </p>
              <p>
                <strong className="text-stone-300">What gets verified?</strong>
                <br />
                Only that you&apos;re 18+ and optionally your country. No name,
                photo, or ID number is shared.
              </p>
              <p>
                <strong className="text-stone-300">How does it work?</strong>
                <br />
                1. Scan the QR code with the zkpassport app
                <br />
                2. The app reads your passport&apos;s NFC chip
                <br />
                3. A cryptographic proof is generated locally
                <br />
                4. Only the proof (not your data) is submitted on-chain
              </p>
              <p>
                <strong className="text-stone-300">Why verify?</strong>
                <br />
                Verified users get a badge that builds trust with traders. It
                proves you&apos;re a real person without KYC.
              </p>
            </div>
          )}

          {zkLoading ? (
            <div className="py-4 px-5 rounded-xl border border-stone-700 bg-stone-800/30 flex items-center gap-3">
              <Spinner size="sm" inline />
              <span className="text-sm text-stone-400">
                Checking verification status...
              </span>
            </div>
          ) : zkVerified ? (
            <div className="py-4 px-5 rounded-xl border border-green-500/20 bg-green-500/5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-green-400"
                >
                  <path d="M9 12l2 2 4-4" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-stone-200">
                  Identity Verified
                </p>
                <p className="text-xs text-stone-400">
                  Your identity has been verified with zkpassport. This helps
                  build trust with other traders.
                </p>
              </div>
              <VerifiedBadge countryCode={attestation?.countryCode} size="md" />
            </div>
          ) : (
            <div className="py-4 px-5 rounded-xl border border-stone-700 bg-stone-800/30">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-stone-700/50 flex items-center justify-center flex-shrink-0">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="text-stone-300"
                  >
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                    <circle cx="9" cy="12" r="2" />
                    <path d="M15 10h3M15 14h3" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-stone-200">
                    Verify Your Identity
                  </p>
                  <p className="text-xs text-stone-400">
                    Use zkpassport to prove you&apos;re 18+ without sharing
                    personal data. Builds trust with other traders.
                  </p>
                </div>
                <button
                  onClick={() => setVerifyModalOpen(true)}
                  className="px-4 py-2 rounded-lg bg-stone-100 text-stone-900 text-sm font-medium hover:bg-white transition-colors flex-shrink-0"
                >
                  Verify
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <Modal
        isOpen={verifyModalOpen}
        onClose={() => setVerifyModalOpen(false)}
        size="sm"
      >
        <ModalHeader onClose={() => setVerifyModalOpen(false)}>
          <h2 className="text-lg font-semibold text-stone-200">
            Identity Verification
          </h2>
        </ModalHeader>
        <ModalBody>
          <ZKPassportVerify
            onComplete={() => setVerifyModalOpen(false)}
            onCancel={() => setVerifyModalOpen(false)}
            discloseCountry={true}
          />
        </ModalBody>
      </Modal>
    </div>
  );
}
