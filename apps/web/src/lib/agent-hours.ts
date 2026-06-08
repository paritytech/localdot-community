/**
 * Agent working-hours helpers.
 *
 * Agent metadata stores a weekly schedule as `{ Mon: { open, close }, … }`
 * (written by RegisterAgent under `workingHours.schedule`). `getAgentStatus`
 * derives a human "open now / opens at …" label from it. Shared by the agents
 * list (ExploreAgents) and the agent detail page so the logic lives once.
 */

export type DaySchedule = { open: string; close: string };
export type AgentSchedule = Record<string, DaySchedule>;

export interface AgentStatus {
  isOpen: boolean;
  label: string;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Whether the agent is currently open, with a label, based on their schedule. */
export function getAgentStatus(schedule: AgentSchedule): AgentStatus {
  const now = new Date();
  const todayKey = DAYS[now.getDay()]!;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const todayHours = schedule[todayKey];
  if (todayHours) {
    const [oh, om] = todayHours.open.split(":").map(Number);
    const [ch, cm] = todayHours.close.split(":").map(Number);
    const openMin = (oh ?? 0) * 60 + (om ?? 0);
    const closeMin = (ch ?? 0) * 60 + (cm ?? 0);

    if (currentMinutes >= openMin && currentMinutes < closeMin) {
      return { isOpen: true, label: `Open until ${todayHours.close}` };
    }
    if (currentMinutes < openMin) {
      return { isOpen: false, label: `Closed · opens ${todayHours.open}` };
    }
  }

  // Find the next open day.
  for (let i = 1; i <= 7; i++) {
    const nextDay = DAYS[(now.getDay() + i) % 7]!;
    const nextHours = schedule[nextDay];
    if (nextHours) {
      return {
        isOpen: false,
        label: `Closed · opens ${nextDay} ${nextHours.open}`,
      };
    }
  }
  return { isOpen: false, label: "Closed" };
}

// Monday-first order for display grouping (DAYS above is Sunday-first to match
// JS getDay()). Keys come from WorkingHoursPicker: "Mon"…"Sun".
const DISPLAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export interface ScheduleGroup {
  /** "Mon" for a single day, "Mon–Fri" for a consecutive run */
  days: string;
  open: string;
  close: string;
}

/**
 * Collapse the weekly schedule into runs of consecutive days that share the
 * same open/close, so "every day 09:00–17:00" reads as a single
 * "Mon–Sun 09:00–17:00" instead of seven identical lines.
 */
export function groupSchedule(schedule: AgentSchedule): ScheduleGroup[] {
  const groups: ScheduleGroup[] = [];
  let runStart = -1;
  let runEnd = -1;
  let runHours: DaySchedule | null = null;

  const flush = () => {
    if (runHours) {
      groups.push({
        days:
          runStart === runEnd
            ? DISPLAY_ORDER[runStart]!
            : `${DISPLAY_ORDER[runStart]}–${DISPLAY_ORDER[runEnd]}`,
        open: runHours.open,
        close: runHours.close,
      });
    }
  };

  DISPLAY_ORDER.forEach((day, idx) => {
    const h = schedule[day];
    if (
      h &&
      runHours &&
      h.open === runHours.open &&
      h.close === runHours.close
    ) {
      // Extend the current run (iteration is sequential, so this is contiguous).
      runEnd = idx;
    } else {
      flush();
      if (h) {
        runStart = idx;
        runEnd = idx;
        runHours = h;
      } else {
        runHours = null;
      }
    }
  });
  flush();
  return groups;
}
