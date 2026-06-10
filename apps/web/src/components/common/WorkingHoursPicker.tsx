import { useState } from "react";

const DAYS = [
  { key: "Mon", label: "Monday" },
  { key: "Tue", label: "Tuesday" },
  { key: "Wed", label: "Wednesday" },
  { key: "Thu", label: "Thursday" },
  { key: "Fri", label: "Friday" },
  { key: "Sat", label: "Saturday" },
  { key: "Sun", label: "Sunday" },
] as const;

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, "0");
  const m = i % 2 === 0 ? "00" : "30";
  return `${h}:${m}`;
});

export interface DaySchedule {
  open: string;
  close: string;
}

export type WeeklySchedule = Record<string, DaySchedule>;

interface WorkingHoursPickerProps {
  value: WeeklySchedule;
  onChange: (schedule: WeeklySchedule) => void;
  accent?: "amber" | "emerald";
}

export function WorkingHoursPicker({
  value,
  onChange,
  accent = "amber",
}: WorkingHoursPickerProps): JSX.Element {
  const [copySource, setCopySource] = useState<string | null>(null);

  const fill =
    accent === "emerald"
      ? "bg-emerald-400 text-stone-950"
      : "bg-amber-400 text-stone-950";
  const presetActive =
    accent === "emerald"
      ? "bg-emerald-500/15 text-emerald-300"
      : "bg-amber-500/15 text-amber-300";
  const selectFocus =
    accent === "emerald"
      ? "focus:border-emerald-400/60"
      : "focus:border-amber-400/60";

  const isDayActive = (day: string) => day in value;

  const toggleDay = (day: string) => {
    const next = { ...value };
    if (day in next) {
      delete next[day];
    } else {
      next[day] = { open: "09:00", close: "17:00" };
    }
    onChange(next);
  };

  const updateDay = (day: string, field: "open" | "close", time: string) => {
    const current = value[day] || { open: "09:00", close: "17:00" };
    onChange({ ...value, [day]: { ...current, [field]: time } });
  };

  const copyToAll = (sourceDay: string) => {
    const source = value[sourceDay];
    if (!source) return;
    const next: WeeklySchedule = {};
    for (const day of DAYS) {
      if (day.key in value) {
        next[day.key] = { ...source };
      }
    }
    onChange(next);
    setCopySource(sourceDay);
    setTimeout(() => setCopySource(null), 1500);
  };

  const activeDays = DAYS.filter((d) => isDayActive(d.key));
  const activeKeys = new Set(Object.keys(value));
  const WORKDAY_KEYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const WEEKEND_KEYS = ["Sat", "Sun"];
  const ALL_KEYS = DAYS.map((d) => d.key);

  const isPreset = (keys: string[]) =>
    activeKeys.size === keys.length && keys.every((k) => activeKeys.has(k));

  const applyPreset = (keys: string[]) => {
    const defaultHours = { open: "09:00", close: "17:00" };
    const next: WeeklySchedule = {};
    for (const key of keys) {
      next[key] = value[key] || defaultHours;
    }
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {/* Quick presets */}
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            { label: "Workdays", keys: WORKDAY_KEYS },
            { label: "Weekend", keys: WEEKEND_KEYS },
            { label: "Every day", keys: ALL_KEYS },
          ] as const
        ).map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => applyPreset([...preset.keys])}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              isPreset([...preset.keys])
                ? presetActive
                : "bg-stone-900/40 text-stone-400 hover:text-stone-200"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Individual day toggles */}
      <div className="flex gap-1.5">
        {DAYS.map((day) => (
          <button
            key={day.key}
            type="button"
            onClick={() => toggleDay(day.key)}
            className={`h-9 flex-1 rounded-lg text-xs font-medium transition-colors ${
              isDayActive(day.key)
                ? fill
                : "bg-stone-900/50 text-stone-500 hover:bg-stone-800 hover:text-stone-300"
            }`}
          >
            {day.key.slice(0, 2)}
          </button>
        ))}
      </div>

      {/* Per-day hours */}
      {activeDays.length > 0 && (
        <div className="space-y-1.5">
          {activeDays.map((day) => (
            <div
              key={day.key}
              className="flex items-center gap-2 rounded-lg bg-stone-900/40 px-3 py-1.5"
            >
              <span className="w-8 shrink-0 text-xs font-medium text-stone-400">
                {day.key}
              </span>
              <select
                value={value[day.key]?.open || ""}
                onChange={(e) => updateDay(day.key, "open", e.target.value)}
                className={`min-w-0 flex-1 rounded-md border border-stone-800 bg-stone-950/60 px-2 py-1 font-mono text-xs text-stone-200 focus:outline-none ${selectFocus}`}
              >
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <span className="text-xs text-stone-600">–</span>
              <select
                value={value[day.key]?.close || ""}
                onChange={(e) => updateDay(day.key, "close", e.target.value)}
                className={`min-w-0 flex-1 rounded-md border border-stone-800 bg-stone-950/60 px-2 py-1 font-mono text-xs text-stone-200 focus:outline-none ${selectFocus}`}
              >
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => copyToAll(day.key)}
                className="shrink-0 text-[10px] text-stone-500 transition-colors hover:text-stone-300"
                title={`Apply ${day.key} hours to all active days`}
              >
                {copySource === day.key ? "Copied" : "Copy to all"}
              </button>
            </div>
          ))}
        </div>
      )}

      {activeDays.length === 0 && (
        <p className="py-2 text-center text-xs text-stone-500">
          Select working days above
        </p>
      )}
    </div>
  );
}
