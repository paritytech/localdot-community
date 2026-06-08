import { Check } from "lucide-react";

import { fmtShortDateTime } from "../../../lib/format";

interface TimelineStep {
  label: string;
  sub: string;
  state: "done" | "current" | "pending";
}

export function TimelineCard({
  meetingAt,
  meetingPlace,
  tradeState,
  lockedAt,
}: {
  meetingAt: number | null;
  meetingPlace: string | null;
  tradeState: number;
  lockedAt: number;
}): JSX.Element {
  const meetingLabel = meetingPlace
    ? `Meet at ${meetingPlace}`
    : "Set time and place";

  const steps: TimelineStep[] = [
    {
      label: "Trade locked",
      sub: fmtShortDateTime(lockedAt),
      state: "done",
    },
    {
      label: meetingLabel,
      sub: meetingAt ? fmtShortDateTime(meetingAt) : "Not set",
      state: tradeState >= 2 ? "done" : "current",
    },
    {
      label: "Both swipe to confirm",
      sub: "On meeting",
      state: tradeState >= 2 ? "done" : "pending",
    },
    {
      label: "Tokens released",
      sub: "Auto",
      state: tradeState >= 2 ? "done" : "pending",
    },
  ];

  return (
    <div className="rounded-2xl border border-stone-800 bg-stone-900/40 p-5">
      <p className="text-[10px] uppercase tracking-[0.16em] text-stone-500 font-medium mb-4">
        Timeline
      </p>
      <ol className="relative space-y-5">
        {/* Single continuous rail behind the dots — first to last step */}
        <span
          aria-hidden
          className="absolute left-2 top-2 bottom-2 w-px bg-stone-800"
        />
        {steps.map((s, i) => (
          <li key={i} className="relative flex items-start gap-3">
            <span className="relative z-10 shrink-0">
              <StepDot state={s.state} />
            </span>
            <div className="-mt-0.5">
              <p
                className={`text-sm ${
                  s.state === "pending"
                    ? "text-stone-500"
                    : s.state === "current"
                      ? "text-stone-100"
                      : "text-stone-200"
                }`}
              >
                {s.label}
              </p>
              <p className="mono text-[11px] text-stone-500 mt-0.5">{s.sub}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function StepDot({
  state,
}: {
  state: "done" | "current" | "pending";
}): JSX.Element {
  // Solid stone-900 background masks the rail line passing behind every dot
  // so the connector reads as continuous instead of broken at each step.
  if (state === "done") {
    return (
      <span className="w-4 h-4 rounded-full bg-stone-900 border border-emerald-400/60 flex items-center justify-center">
        <Check className="w-2.5 h-2.5 text-emerald-400" strokeWidth={3} />
      </span>
    );
  }
  if (state === "current") {
    return (
      <span className="w-4 h-4 rounded-full border-2 border-stone-100 bg-stone-900 flex items-center justify-center">
        <span className="w-1.5 h-1.5 rounded-full bg-stone-100" />
      </span>
    );
  }
  return (
    <span className="w-4 h-4 rounded-full border border-stone-700 bg-stone-900" />
  );
}
