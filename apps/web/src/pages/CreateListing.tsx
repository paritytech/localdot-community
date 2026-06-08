import {
  Calendar,
  Check,
  ChevronDown,
  Coins,
  MapPin,
  Shield,
  Users,
  Zap,
} from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { useNavigate } from "react-router-dom";

import { AgentSelector } from "../components/agents/AgentSelector";
import type { WeeklySchedule } from "../components/common/WorkingHoursPicker";
import {
  type CreateSection,
  CreateSplitLayout,
  Field,
  MethodCard,
  OfferPreview,
  Segmented,
  TokenInput,
} from "../components/create";
import { useLocationContext } from "../context/LocationContext";
import { useOffersContext } from "../context/OffersContext";
import { useWalletContext } from "../context/WalletContext";
import { useBulletin } from "../hooks/useBulletin";
import { useP2PMarket } from "../hooks/useP2PMarket";
import { ss58ToEvmAddress } from "../lib/address";
import { filterIntegerInput } from "../lib/input-filters";
import type { OfferRole } from "../types/offers";

const LocationMapPicker = lazy(() =>
  import("../components/location/LocationMapPicker").then((m) => {
    return {
      default: m.LocationMapPicker,
    };
  }),
);

const WorkingHoursPicker = lazy(() =>
  import("../components/common/WorkingHoursPicker").then((m) => {
    return {
      default: m.WorkingHoursPicker,
    };
  }),
);

const FIAT_CURRENCY = "USD";
const MAX_FLAT_FEE = 1000;

/** Phases of the publish flow, surfaced as a stepper so the Bulletin
 *  preimage-submit prompt during "saving" reads as an expected step rather
 *  than a surprise interruption. */
type PublishPhase = "idle" | "saving" | "publishing";

export default function CreateListing(): JSX.Element {
  const { address, connect, accountName, nativeCurrency } = useWalletContext();
  const { location: userLocation } = useLocationContext();
  const { refreshOffers, offers: allOffers } = useOffersContext();
  const { createOffer, getAllOffers } = useP2PMarket();
  const { uploadJson } = useBulletin();
  const navigate = useNavigate();

  const [role, setRole] = useState<OfferRole>("seller");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const fiatCurrency = FIAT_CURRENCY;
  const [flatFee, setFlatFee] = useState("");
  const [schedule, setSchedule] = useState<WeeklySchedule>({});

  // Trade mode
  const [enableDirect, setEnableDirect] = useState(false);
  const [enableAgent, setEnableAgent] = useState(true);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [location, setLocation] = useState<{
    city: string;
    country: string;
    lat: number;
    lon: number;
    radiusKm: number;
  } | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [publishPhase, setPublishPhase] = useState<PublishPhase>("idle");

  const hasAvailability = Object.keys(schedule).length > 0;

  // Average fee from existing offers (V1: USD only)
  const avgFee = (() => {
    const withFee = allOffers.filter((o) => o.fee);
    if (withFee.length === 0) return null;
    const total = withFee.reduce((sum, o) => {
      const n = parseFloat(o.fee?.replace(/[^0-9.]/g, "") ?? "0");
      return sum + n;
    }, 0);
    return Math.round(total / withFee.length);
  })();

  const amountsValid =
    minAmount !== "" &&
    Number(minAmount) > 0 &&
    maxAmount !== "" &&
    Number(maxAmount) > 0 &&
    Number(maxAmount) >= Number(minAmount);
  const feeValid =
    flatFee !== "" && Number(flatFee) >= 0 && Number(flatFee) <= MAX_FLAT_FEE;
  const methodValid =
    (enableAgent && selectedAgents.length > 0) ||
    (enableDirect && location !== null && location.city.trim() !== "");
  const isValid = amountsValid && feeValid && hasAvailability && methodValid;

  const handlePublish = async () => {
    if (!address) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const metadataPayload: Record<string, unknown> = {
        availability: {
          schedule,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      };

      // Only include location if direct trade enabled
      if (enableDirect && location) {
        metadataPayload.location = {
          lat: location.lat,
          lng: location.lon,
          radius: location.radiusKm,
          city: location.city,
          country: location.country,
        };
      }

      // Bulletin write — this is where the host may surface a preimage-submit
      // prompt (the permission itself is pre-resolved at onboarding).
      setPublishPhase("saving");
      const metadataCID = await uploadJson(
        metadataPayload,
        "offer-details.json",
      );
      const flatFeeWhole = Math.round(parseFloat(flatFee || "0")).toString();

      // On-chain contract write — auto-signed via the bootstrap allowance.
      setPublishPhase("publishing");
      await createOffer({
        offerType: role === "seller" ? 0 : 1,
        amountAvailable: maxAmount,
        minAmount,
        fiatCurrency,
        flatFee: flatFeeWhole,
        metadataCID,
        agentAddresses: enableAgent ? selectedAgents : [],
      });

      await refreshOffers();
      // Land on the freshly-created offer's page. createOffer doesn't return
      // the id, so find this owner's newest offer (highest id) on chain.
      try {
        const myEvm = ss58ToEvmAddress(address).toLowerCase();
        const mine = (await getAllOffers()).filter(
          (o) => o.owner.toLowerCase() === myEvm,
        );
        const newest = mine.reduce<bigint | null>(
          (max, o) => (max === null || o.id > max ? o.id : max),
          null,
        );
        navigate(
          newest !== null ? `/offer/${newest.toString()}` : "/explore/offers",
        );
      } catch {
        navigate("/explore/offers");
      }
    } catch (err) {
      console.error("[CreateListing] Error:", err);
      setSubmitError(
        err instanceof Error ? err.message : "Failed to create offer",
      );
    } finally {
      setSubmitting(false);
      setPublishPhase("idle");
    }
  };

  if (!address) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center md:px-6">
        <h2 className="mb-3">Create a listing</h2>
        <p className="mb-8 text-stone-500">
          Connect your wallet to list as a provider.
        </p>
        <button onClick={connect} className="btn-primary">
          Connect Wallet
        </button>
      </div>
    );
  }

  const sections: CreateSection[] = [
    {
      key: "side",
      n: "01",
      title: "Your position",
      desc: "Are you selling or buying tokens?",
      icon: Zap,
      node: (
        <div>
          <div className="max-w-xs">
            <Segmented
              size="sm"
              options={[
                { value: "seller", label: "Seller" },
                { value: "buyer", label: "Buyer" },
              ]}
              value={role}
              onChange={(v) => setRole(v as OfferRole)}
            />
          </div>
          <p className="mt-3 text-xs text-stone-500">
            {role === "seller"
              ? "You have tokens and want to sell them for cash."
              : "You have cash and want to buy tokens."}
          </p>
        </div>
      ),
    },
    {
      key: "tokens",
      n: "02",
      title: "Token range",
      desc: "How much you'll trade per deal.",
      icon: Coins,
      node: (
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={role === "seller" ? "Minimum to sell" : "Minimum to buy"}
          >
            <TokenInput
              value={minAmount}
              onChange={(v) => setMinAmount(filterIntegerInput(v))}
              placeholder="100"
              prefix={nativeCurrency.symbol}
              inputMode="numeric"
              mono
            />
          </Field>
          <Field label="Maximum available">
            <TokenInput
              value={maxAmount}
              onChange={(v) => setMaxAmount(filterIntegerInput(v))}
              placeholder="2000"
              prefix={nativeCurrency.symbol}
              inputMode="numeric"
              mono
            />
          </Field>
        </div>
      ),
    },
    {
      key: "fee",
      n: "03",
      title: "Flat fee",
      desc: "Your service fee in USD.",
      icon: Coins,
      node: (
        <Field
          hint={
            avgFee !== null
              ? `Charged on top of each trade. Average provider fee: $${avgFee}.`
              : `Charged on top of each trade. Max $${MAX_FLAT_FEE}.`
          }
        >
          <TokenInput
            value={flatFee}
            onChange={(v) => setFlatFee(filterIntegerInput(v))}
            placeholder="12"
            prefix="USD"
            inputMode="numeric"
            ariaLabel="Flat fee in USD"
            mono
          />
        </Field>
      ),
    },
    {
      key: "avail",
      n: "04",
      title: "Availability",
      desc: "When you can meet buyers.",
      icon: Calendar,
      node: (
        <Suspense fallback={null}>
          <WorkingHoursPicker value={schedule} onChange={setSchedule} />
        </Suspense>
      ),
    },
    {
      key: "methods",
      n: "05",
      title: "How buyers trade",
      desc: "Pick one or both methods.",
      icon: Shield,
      node: (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MethodCard
              icon={Shield}
              title="Via Agent"
              sub="Insured exchange"
              tone="emerald"
              selected={enableAgent}
              onClick={() => setEnableAgent(!enableAgent)}
            />
            <MethodCard
              icon={Users}
              title="Direct"
              sub="Meet in person"
              tone="amber"
              selected={enableDirect}
              onClick={() => setEnableDirect(!enableDirect)}
            />
          </div>

          {!enableAgent && !enableDirect && (
            <p className="rounded-xl border border-stone-800 bg-stone-900/30 px-4 py-3 text-center text-xs text-stone-500">
              Choose at least one option above. You can enable both.
            </p>
          )}

          {enableAgent && (
            <details
              open
              className="group rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.03]"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4">
                <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-300/90">
                  <Shield className="h-4 w-4" /> Exchange agents
                  {selectedAgents.length > 0 && (
                    <span className="rounded-full bg-emerald-900/50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                      {selectedAgents.length} selected
                    </span>
                  )}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-emerald-300/60 transition-transform group-open:rotate-180" />
              </summary>
              <div className="px-4 pb-4">
                <p className="mb-4 text-xs leading-relaxed text-stone-500">
                  Buyers visit the agent, exchange cash, and the agent releases
                  tokens. The agent fee is paid by the buyer.
                </p>
                <AgentSelector
                  selected={selectedAgents}
                  onChange={setSelectedAgents}
                  providerLocation={
                    userLocation
                      ? { lat: userLocation.lat, lon: userLocation.lon }
                      : null
                  }
                  providerSchedule={schedule}
                />
              </div>
            </details>
          )}

          {enableDirect && (
            <details
              open
              className="group rounded-2xl border border-amber-500/20 bg-amber-500/[0.03]"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-4">
                <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-300/90">
                  <Users className="h-4 w-4" /> Direct trade location
                  {location?.city && (
                    <span className="rounded-full bg-amber-900/50 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                      {location.city}
                    </span>
                  )}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-amber-300/60 transition-transform group-open:rotate-180" />
              </summary>
              <div className="px-4 pb-4">
                <p className="mb-4 flex items-center gap-1.5 text-xs leading-relaxed text-stone-500">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  Set your meetup area. Buyers nearby will see your offer and
                  can request a direct trade.
                </p>
                <Suspense
                  fallback={
                    <div className="flex h-[350px] w-full items-center justify-center rounded-lg border border-stone-700">
                      <p className="text-sm text-stone-400">Loading map…</p>
                    </div>
                  }
                >
                  <LocationMapPicker value={location} onChange={setLocation} />
                </Suspense>
              </div>
            </details>
          )}
        </div>
      ),
    },
  ];

  return (
    <CreateSplitLayout
      title="Create an offer"
      subtitle="List tokens to sell or cash to buy, then choose how people trade with you."
      sections={sections}
      preview={
        <OfferPreview
          role={role}
          minAmount={minAmount}
          maxAmount={maxAmount}
          flatFee={flatFee}
          enableAgent={enableAgent}
          enableDirect={enableDirect}
          agentCount={selectedAgents.length}
          directCity={location?.city}
          schedule={schedule}
          symbol={nativeCurrency.symbol}
          address={address}
          accountName={accountName}
        />
      }
      error={
        submitError && (
          <div className="mt-6 rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-200">
            {submitError}
          </div>
        )
      }
      actions={
        publishPhase === "idle" ? (
          <button
            type="button"
            onClick={() => void handlePublish()}
            disabled={submitting || !isValid}
            className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 px-6 py-3.5 text-[15px] font-semibold text-stone-950 shadow-lg shadow-amber-500/10 transition-colors hover:bg-amber-300 ${
              (!isValid || submitting) && "cursor-not-allowed opacity-40"
            }`}
          >
            {submitting ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-stone-900/40 border-t-stone-900" />
                Publishing…
              </>
            ) : (
              "Publish offer"
            )}
          </button>
        ) : (
          <PublishProgress phase={publishPhase} />
        )
      }
      footnote="Offers expire after 14 days."
    />
  );
}

/**
 * Two-step progress for the publish flow. Renders "Saving offer details" →
 * "Publishing on-chain" with the current step spinning and prior steps checked,
 * plus a hint during the save step so the host's preimage-submit prompt is
 * expected rather than surprising.
 */
function PublishProgress({
  phase,
}: {
  phase: "saving" | "publishing";
}): JSX.Element {
  const steps = [
    { key: "saving", label: "Saving offer details" },
    { key: "publishing", label: "Publishing on-chain" },
  ] as const;
  const activeIndex = phase === "saving" ? 0 : 1;

  return (
    <div className="rounded-lg border border-stone-700 bg-stone-900/60 px-4 py-3 space-y-2.5">
      {steps.map((s, i) => {
        const state =
          i < activeIndex ? "done" : i === activeIndex ? "active" : "pending";
        return (
          <div key={s.key} className="flex items-center gap-2.5 text-sm">
            {state === "done" ? (
              <Check className="h-4 w-4 shrink-0 text-green-400" />
            ) : state === "active" ? (
              <span className="h-4 w-4 shrink-0 rounded-full border-2 border-amber-400/30 border-t-amber-400 animate-spin" />
            ) : (
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                <span className="h-1.5 w-1.5 rounded-full bg-stone-600" />
              </span>
            )}
            <span
              className={
                state === "pending" ? "text-stone-500" : "text-stone-200"
              }
            >
              {s.label}
            </span>
          </div>
        );
      })}
      {phase === "saving" && (
        <p className="pl-[26px] text-xs text-stone-500">
          A wallet prompt may appear to store your offer details.
        </p>
      )}
    </div>
  );
}
