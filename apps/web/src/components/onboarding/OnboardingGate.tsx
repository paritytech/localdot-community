/**
 * OnboardingGate — first-entry setup wizard.
 *
 * Wraps the app (inside WalletProvider). On the first entry for a given account,
 * once the wallet reports "connected", it shows a full-screen panel listing what
 * the app needs — on-chain allowances, then Location / Camera / Notifications.
 * Each item has its own button: the host's native prompt opens only when the
 * user taps it, so the modal never stacks over the explanation. Returning users
 * — and anyone outside the host (plain localhost dev) — pass straight through.
 *
 * Allowances are the one gating step: the primary "Enter app" button appears
 * once they're granted. A quiet "Skip for now" escape is always offered (the
 * lazy first-publish bootstrap still covers anyone who skips), and the device
 * steps are best-effort — a denial just leaves a Retry affordance.
 */

import {
  Bell,
  Camera,
  Check,
  type LucideIcon,
  MapPin,
  ShieldCheck,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { useWalletContext } from "../../context/WalletContext";
import { isHosted } from "../../lib/host/detect";
import {
  isOnboarded,
  markOnboarded,
  type OnboardingPhase,
  type PhaseStatus,
  runOnboardingPhase,
} from "../../lib/host/onboarding";
import { Spinner } from "../common/Spinner";

const STEPS: {
  phase: OnboardingPhase;
  label: string;
  description: string;
  cta: string;
  Icon: LucideIcon;
}[] = [
  {
    phase: "allowances",
    label: "Account & trading allowances",
    description:
      "Authorise on-chain allowances so you can post and take offers.",
    cta: "Grant",
    Icon: ShieldCheck,
  },
  {
    phase: "location",
    label: "Location access",
    description: "Show nearby offers and set meeting points on the map.",
    cta: "Allow",
    Icon: MapPin,
  },
  {
    phase: "camera",
    label: "Camera access",
    description: "Scan a counterparty's QR code to confirm a trade.",
    cta: "Allow",
    Icon: Camera,
  },
  {
    phase: "notifications",
    label: "Notifications",
    description: "Get alerted when an offer is taken or a message arrives.",
    cta: "Enable",
    Icon: Bell,
  },
];

type Statuses = Record<OnboardingPhase, PhaseStatus>;

const INITIAL_STATUSES: Statuses = {
  allowances: "pending",
  location: "pending",
  camera: "pending",
  notifications: "pending",
};

export function OnboardingGate({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const { isConnected, isDetecting, address } = useWalletContext();
  const hosted = isHosted();

  const [statuses, setStatuses] = useState<Statuses>(INITIAL_STATUSES);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  const alreadyOnboarded = !!address && isOnboarded(address);

  // Holds the latest connected account. Doubles as a reset trigger (a new
  // account wipes the previous one's progress) and a staleness fence (a phase
  // result that resolves after the account changed is dropped).
  const addressRef = useRef<string | null>(address ?? null);
  useEffect(() => {
    if (addressRef.current !== (address ?? null)) {
      addressRef.current = address ?? null;
      setStatuses(INITIAL_STATUSES);
      setErrorMsg(null);
      setRevealed(false);
    }
  }, [address]);

  // Run one phase on demand. Each step button calls this; the host's native
  // modal opens here and nowhere else, so it can't stack over the explanation.
  const runPhase = (phase: OnboardingPhase): void => {
    const forAddress = addressRef.current;
    if (phase === "allowances") setErrorMsg(null);
    setStatuses((prev) => {
      return { ...prev, [phase]: "running" };
    });
    void runOnboardingPhase(phase).then((res) => {
      // Ignore a result that lands after the account switched out from under us.
      if (addressRef.current !== forAddress) return;
      setStatuses((prev) => {
        return { ...prev, [phase]: res.status };
      });
      if (phase === "allowances" && res.status === "error") {
        setErrorMsg(res.error ?? "Setup could not be completed.");
      }
    });
  };

  // "Enter app" and "Skip for now" both close the screen; the only difference is
  // whether allowances landed first. Record the per-account flag either way so
  // the screen doesn't re-show next session.
  const finish = (): void => {
    if (address) markOnboarded(address);
    setRevealed(true);
  };

  // ── Render decision ──────────────────────────────────────────────────────
  // Outside the host (dev / standalone) the native browser flows handle
  // everything — never gate.
  if (!hosted) return <>{children}</>;
  // Dismissed, or a returning user → reveal the app.
  if (revealed || alreadyOnboarded) return <>{children}</>;
  // Host present but no account resolved (handshake failed / timed out): don't
  // trap the user — the lazy first-publish bootstrap still runs later.
  if (!isDetecting && !isConnected) return <>{children}</>;

  return (
    <OnboardingScreen
      statuses={statuses}
      connecting={isDetecting}
      errorMsg={errorMsg}
      onRunPhase={runPhase}
      onFinish={finish}
    />
  );
}

function OnboardingScreen({
  statuses,
  connecting,
  errorMsg,
  onRunPhase,
  onFinish,
}: {
  statuses: Statuses;
  connecting: boolean;
  errorMsg: string | null;
  onRunPhase: (phase: OnboardingPhase) => void;
  onFinish: () => void;
}): JSX.Element {
  const allowancesDone = statuses.allowances === "done";

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-stone-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-stone-800 bg-stone-900 p-6 shadow-xl">
        <h1 className="text-lg font-semibold text-stone-100">
          {connecting ? "Connecting…" : "Set things up"}
        </h1>
        <p className="mt-1 text-sm text-stone-400">
          {connecting
            ? "Linking your Polkadot wallet."
            : "Grant each item when you're ready — a wallet prompt opens only when you tap its button."}
        </p>

        <ul className="mt-5 divide-y divide-stone-800/70">
          {STEPS.map(({ phase, label, description, cta, Icon }) => (
            <StepRow
              key={phase}
              label={label}
              description={description}
              cta={cta}
              Icon={Icon}
              status={statuses[phase]}
              disabled={connecting}
              onRun={() => onRunPhase(phase)}
            />
          ))}
        </ul>

        {errorMsg !== null && (
          <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
            <p className="text-sm text-red-300">{errorMsg}</p>
          </div>
        )}

        {!connecting && (
          <div className="mt-6">
            {allowancesDone ? (
              <button
                type="button"
                onClick={onFinish}
                className="w-full rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-stone-950 transition-colors hover:bg-amber-300"
              >
                Enter app
              </button>
            ) : (
              <div className="text-center">
                <p className="text-xs text-stone-500">
                  Grant trading allowances to continue — or skip and set them up
                  later.
                </p>
                <button
                  type="button"
                  onClick={onFinish}
                  className="mt-2 text-xs text-stone-600 transition-colors hover:text-stone-400"
                >
                  Skip for now
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StepRow({
  label,
  description,
  cta,
  Icon,
  status,
  disabled,
  onRun,
}: {
  label: string;
  description: string;
  cta: string;
  Icon: LucideIcon;
  status: PhaseStatus;
  disabled: boolean;
  onRun: () => void;
}): JSX.Element {
  return (
    <li className="flex items-start gap-3 py-3">
      <span className="mt-0.5 flex-shrink-0 text-stone-500">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-stone-200">{label}</p>
        <p className="mt-0.5 text-xs text-stone-500">{description}</p>
      </div>
      <div className="flex-shrink-0 self-center">
        <StepControl
          cta={cta}
          status={status}
          disabled={disabled}
          onRun={onRun}
        />
      </div>
    </li>
  );
}

function StepControl({
  cta,
  status,
  disabled,
  onRun,
}: {
  cta: string;
  status: PhaseStatus;
  disabled: boolean;
  onRun: () => void;
}): JSX.Element {
  switch (status) {
    case "running":
      return (
        <span className="flex h-7 w-16 items-center justify-center">
          <Spinner size="sm" inline />
        </span>
      );
    case "done":
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-green-400">
          <Check className="h-4 w-4" />
          Done
        </span>
      );
    case "denied":
      return (
        <button
          type="button"
          onClick={onRun}
          disabled={disabled}
          className="rounded-lg px-2.5 py-1 text-xs font-medium text-stone-400 transition-colors hover:text-stone-200 disabled:opacity-50"
        >
          Retry
        </button>
      );
    case "error":
      return (
        <button
          type="button"
          onClick={onRun}
          disabled={disabled}
          className="rounded-lg bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/25 disabled:opacity-50"
        >
          Try again
        </button>
      );
    case "pending":
    default:
      return (
        <button
          type="button"
          onClick={onRun}
          disabled={disabled}
          className="rounded-lg bg-amber-400/90 px-3 py-1 text-xs font-semibold text-stone-950 transition-colors hover:bg-amber-300 disabled:opacity-50"
        >
          {cta}
        </button>
      );
  }
}
