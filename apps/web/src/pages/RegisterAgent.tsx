import {
  BadgeCheck,
  Calendar,
  Clock,
  Coins,
  MapPin,
  Shield,
  Store,
} from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { WeeklySchedule } from "../components/common/WorkingHoursPicker";
import {
  AgentPreview,
  type CreateSection,
  CreateSplitLayout,
  Field,
  TokenInput,
} from "../components/create";
import { VerifiedBadge, ZKPassportVerify } from "../components/zkpassport";
import { useWalletContext } from "../context/WalletContext";
import { useBulletin } from "../hooks/useBulletin";
import { useP2PMarket } from "../hooks/useP2PMarket";
import { useZKPassport } from "../hooks/useZKPassport";
import { ss58ToEvmAddress } from "../lib/address";
import { getAgentViaSubstrate } from "../lib/host";
import { filterDecimalInput, filterIntegerInput } from "../lib/input-filters";

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

const MAX_FLAT_FEE = 1000;
const MIN_HOLD_HOURS = 2;
const MAX_HOLD_HOURS = 72;

export default function RegisterAgent(): JSX.Element {
  const { address, connect, nativeCurrency } = useWalletContext();
  const { registerAgent } = useP2PMarket();
  const { uploadJson } = useBulletin();
  const navigate = useNavigate();
  const {
    isVerified,
    attestation,
    isLoading: zkLoading,
  } = useZKPassport({ autoRefresh: true });

  const [name, setName] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [flatFee, setFlatFee] = useState("");
  const [holdHours, setHoldHours] = useState(String(MIN_HOLD_HOURS));
  const [extraHourFee, setExtraHourFee] = useState("0");
  const [stakeAmount, setStakeAmount] = useState("");
  const [location, setLocation] = useState<{
    city: string;
    country: string;
    lat: number;
    lon: number;
    radiusKm: number;
  } | null>(null);
  const [schedule, setSchedule] = useState<WeeklySchedule>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showPassportModal, setShowPassportModal] = useState(false);
  const [alreadyAgent, setAlreadyAgent] = useState(false);

  // One wallet can only register once — re-registering reverts with
  // AgentAlreadyRegistered. Detect it up-front so we show a friendly notice
  // instead of letting the user submit a doomed transaction.
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    void (async () => {
      try {
        const evm = ss58ToEvmAddress(address);
        const found = evm ? await getAgentViaSubstrate(evm) : null;
        if (!cancelled) setAlreadyAgent(!!found);
      } catch {
        if (!cancelled) setAlreadyAgent(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  const hasWorkingHours = Object.keys(schedule).length > 0;

  const holdHoursNum = Number(holdHours);
  const extraHourFeeNum = Number(extraHourFee);
  const isFormValid =
    name.trim() !== "" &&
    streetAddress.trim() !== "" &&
    flatFee !== "" &&
    Number(flatFee) >= 0 &&
    Number(flatFee) <= MAX_FLAT_FEE &&
    holdHours !== "" &&
    Number.isFinite(holdHoursNum) &&
    holdHoursNum >= MIN_HOLD_HOURS &&
    holdHoursNum <= MAX_HOLD_HOURS &&
    extraHourFee !== "" &&
    Number.isFinite(extraHourFeeNum) &&
    extraHourFeeNum >= 0 &&
    extraHourFeeNum <= MAX_FLAT_FEE &&
    location !== null &&
    location.city.trim() !== "" &&
    hasWorkingHours;

  const handleSubmit = async () => {
    if (!address || !location) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const metadataPayload = {
        location: {
          lat: location.lat,
          lng: location.lon,
          city: location.city,
          country: location.country,
          address: streetAddress.trim(),
        },
        workingHours: {
          schedule,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      };

      const metadataCID = await uploadJson(
        metadataPayload,
        "agent-details.json",
      );

      const flatFeeWhole = Math.round(parseFloat(flatFee || "0")).toString();

      await registerAgent({
        name: name.trim(),
        metadataCID,
        flatFee: flatFeeWhole,
        holdHours: String(holdHoursNum),
        extraHourFee: String(Math.round(extraHourFeeNum)),
        stakeAmount: stakeAmount || "0",
      });

      // Land on the freshly-created agent's own page (its wallet is the
      // connected account's EVM address). Fall back to the list if conversion
      // somehow fails.
      const evm = ss58ToEvmAddress(address);
      navigate(evm ? `/agent/${evm}` : "/explore/agents");
    } catch (err) {
      console.error("[RegisterAgent] Error:", err);
      setSubmitError(
        err instanceof Error ? err.message : "Failed to register agent",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handlePassportComplete = useCallback(() => {
    setShowPassportModal(false);
  }, []);

  const handlePassportCancel = useCallback(() => {
    setShowPassportModal(false);
  }, []);

  if (!address) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center md:px-6">
        <h2 className="mb-3">Register Exchange Agent</h2>
        <p className="mb-8 text-stone-500">
          Connect your wallet to register as an exchange agent.
        </p>
        <button onClick={connect} className="btn-primary">
          Connect Wallet
        </button>
      </div>
    );
  }

  if (alreadyAgent) {
    const evm = ss58ToEvmAddress(address);
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center md:px-6">
        <h2 className="mb-3">You&apos;re already an agent</h2>
        <p className="mb-8 text-stone-500">
          This wallet is already registered as an exchange agent — you
          can&apos;t register twice. Manage it from your agent page or Profile →
          My Agency.
        </p>
        <Link
          to={evm ? `/agent/${evm}` : "/explore/agents"}
          className="btn-primary inline-flex"
        >
          View my agent page
        </Link>
      </div>
    );
  }

  const stakeNum = parseFloat(stakeAmount || "0");
  const stakeUsd =
    stakeAmount && Number.isFinite(stakeNum) && stakeNum > 0
      ? `≈ $${stakeNum.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
      : undefined;

  const sections: CreateSection[] = [
    {
      key: "identity",
      n: "01",
      title: "Location details",
      desc: "Your shop or office.",
      icon: Store,
      node: (
        <div className="space-y-4">
          <Field label="Location name" required>
            <TokenInput
              value={name}
              onChange={setName}
              placeholder="e.g. Mikro Market"
              accent="emerald"
              maxLength={100}
            />
          </Field>
          <Field label="Street address" required>
            <TokenInput
              value={streetAddress}
              onChange={setStreetAddress}
              placeholder="e.g. Bulevar Oslobodjenja 15"
              accent="emerald"
              maxLength={200}
            />
          </Field>
        </div>
      ),
    },
    {
      key: "fee",
      n: "02",
      title: "Fee per trade",
      desc: "What buyers pay you in cash.",
      icon: Coins,
      node: (
        <Field
          hint={`Paid by the buyer in cash at your location. Max $${MAX_FLAT_FEE}.`}
        >
          <TokenInput
            value={flatFee}
            onChange={(v) => setFlatFee(filterIntegerInput(v))}
            placeholder="5"
            prefix="USD"
            inputMode="numeric"
            accent="emerald"
            mono
            ariaLabel="Fee per trade in USD"
          />
        </Field>
      ),
    },
    {
      key: "hold",
      n: "03",
      title: "Hold & late fees",
      desc: "Your cash-holding terms.",
      icon: Clock,
      node: (
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Hold hours"
            required
            hint={`How long you hold cash before late fees. ${MIN_HOLD_HOURS}–${MAX_HOLD_HOURS}h.`}
          >
            <TokenInput
              value={holdHours}
              onChange={(v) => setHoldHours(filterIntegerInput(v))}
              placeholder={String(MIN_HOLD_HOURS)}
              suffix="h"
              inputMode="numeric"
              accent="emerald"
              mono
            />
          </Field>
          <Field
            label="Late fee / hour"
            hint={`Charge per hour past your hold window. Max $${MAX_FLAT_FEE}.`}
          >
            <TokenInput
              value={extraHourFee}
              onChange={(v) => setExtraHourFee(filterIntegerInput(v))}
              placeholder="0"
              prefix="USD"
              inputMode="numeric"
              accent="emerald"
              mono
            />
          </Field>
        </div>
      ),
    },
    {
      key: "insurance",
      n: "04",
      title: "Insurance stake",
      desc: "Optional trust collateral.",
      icon: Shield,
      node: (
        <Field hint="Stake tokens as insurance for trades at your location. If you lose a dispute, up to the trade amount is slashed and sent to the other party. Optional — higher insurance builds trust with providers, and you can add more later.">
          <TokenInput
            value={stakeAmount}
            onChange={(v) => setStakeAmount(filterDecimalInput(v))}
            placeholder="0"
            prefix={nativeCurrency.symbol}
            suffix={stakeUsd}
            inputMode="decimal"
            accent="emerald"
            mono
            ariaLabel="Insurance stake amount"
          />
        </Field>
      ),
    },
    {
      key: "location",
      n: "05",
      title: "Pin on map",
      desc: "Where people find you.",
      icon: MapPin,
      node: (
        <Suspense
          fallback={
            <div className="flex h-[350px] w-full items-center justify-center rounded-lg border border-stone-700">
              <p className="text-sm text-stone-400">Loading map…</p>
            </div>
          }
        >
          <LocationMapPicker
            value={location}
            onChange={setLocation}
            showRadius={false}
          />
        </Suspense>
      ),
    },
    {
      key: "hours",
      n: "06",
      title: "Working hours",
      desc: "When you're open for trades.",
      icon: Calendar,
      node: (
        <Suspense fallback={null}>
          <WorkingHoursPicker
            value={schedule}
            onChange={setSchedule}
            accent="emerald"
          />
        </Suspense>
      ),
    },
    {
      key: "verify",
      n: "07",
      title: "Identity verification",
      desc: "Build trust, privately.",
      icon: BadgeCheck,
      node: zkLoading ? (
        <p className="text-sm text-stone-500">Checking verification status…</p>
      ) : isVerified ? (
        <div className="flex items-center gap-3">
          <VerifiedBadge countryCode={attestation?.countryCode} size="md" />
          <span className="text-sm text-stone-400">
            Your identity is verified
          </span>
        </div>
      ) : (
        <div>
          <p className="mb-3 text-xs leading-relaxed text-stone-500">
            Verify your identity with zkpassport to build trust with providers.
            No personal data is shared, only a zero-knowledge proof.
          </p>
          <button
            type="button"
            onClick={() => setShowPassportModal(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-sm font-medium text-emerald-300 transition-colors hover:bg-emerald-500/15"
          >
            <Shield className="h-4 w-4" /> Verify Passport
          </button>
        </div>
      ),
    },
  ];

  return (
    <>
      <CreateSplitLayout
        title="Become an exchange agent"
        subtitle="Register your shop as a place where people swap cash and tokens. You earn a flat fee for each trade."
        sections={sections}
        preview={
          <AgentPreview
            name={name}
            streetAddress={streetAddress}
            flatFee={flatFee}
            holdHours={holdHours}
            extraHourFee={extraHourFee}
            stakeAmount={stakeAmount}
            schedule={schedule}
            verified={isVerified}
            symbol={nativeCurrency.symbol}
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
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting || !isFormValid}
            className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400 px-6 py-3.5 text-[15px] font-semibold text-stone-950 shadow-lg shadow-amber-500/10 transition-colors hover:bg-amber-300 ${
              (!isFormValid || submitting) && "cursor-not-allowed opacity-40"
            }`}
          >
            {submitting ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-stone-900/40 border-t-stone-900" />
                Registering…
              </>
            ) : (
              "Register location"
            )}
          </button>
        }
      />

      {/* ZK Passport Modal */}
      {showPassportModal && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-stone-700 bg-stone-900">
            <ZKPassportVerify
              onComplete={handlePassportComplete}
              onCancel={handlePassportCancel}
              discloseCountry
            />
          </div>
        </div>
      )}
    </>
  );
}
