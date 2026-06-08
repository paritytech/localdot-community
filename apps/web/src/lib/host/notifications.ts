/**
 * Host push notifications for inbound trade activity.
 *
 * Our app's notifications are the only ones that can deep-link to a specific
 * screen. The Polkadot host raises its own generic notifications from
 * statement-store traffic, but it can't know our in-app routes
 * (`#/trades/:id`), so tapping one just focuses the app. When a genuinely new
 * inbound statement lands in the message-store, we push our own host
 * notification carrying a `deeplink`; tapping it sends the host straight to
 * the relevant trade (or the requests inbox).
 *
 * Everything here is best-effort and host-gated: on plain localhost (not
 * embedded in a host) nothing is pushed. The `Notifications` device permission
 * is requested lazily on the first push, or prefetched up front by the
 * onboarding gate (see `lib/host/onboarding.ts`) once the wallet connects.
 * `ensureNotificationPermission` is memoized, so whichever path runs first wins
 * and a burst of pushes never re-prompts.
 */

import {
  type DevicePermissionKind,
  notificationManager,
  requestDevicePermission,
} from "@novasamatech/host-api-wrapper";

import type { TradePayload } from "../statement-store";
import { isHosted } from "./detect";

/** User-facing copy plus the in-app (HashRouter) route a tap should open. */
interface NotificationTarget {
  text: string;
  /** HashRouter path, e.g. `/trades/42` or `/profile`. */
  route: string;
}

/**
 * Map an inbound payload to notification copy + a deep-link target. Returns
 * null for payloads we don't surface to the user (delivery acks, idle status).
 */
function describe(payload: TradePayload): NotificationTarget | null {
  switch (payload.k) {
    case "req":
      return { text: "New trade request", route: "/profile" };
    case "res":
      return {
        text:
          payload.status === "accept"
            ? "Your trade request was accepted"
            : "Your trade request was declined",
        route: "/profile",
      };
    case "prop": {
      const what =
        payload.kind === "time"
          ? "meeting time"
          : payload.kind === "location"
            ? "meeting place"
            : "recognition note";
      return {
        text: `New ${what} proposed`,
        route: `/trades/${payload.tradeId}`,
      };
    }
    case "prop-res":
      return {
        text:
          payload.status === "accept"
            ? "Your proposal was accepted"
            : "Your proposal was declined",
        route: `/trades/${payload.tradeId}`,
      };
    case "status": {
      const route = `/trades/${payload.tradeId}`;
      switch (payload.status) {
        case "on-the-way":
          return { text: "Your counterparty is on the way", route };
        case "here":
          return { text: "Your counterparty has arrived", route };
        case "late":
          return {
            text: `Your counterparty is running late${
              payload.lateMinutes ? ` (${payload.lateMinutes} min)` : ""
            }`,
            route,
          };
        case "idle":
        default:
          return null;
      }
    }
    case "ack":
    default:
      return null;
  }
}

/**
 * True when the user is already looking at `route`, so we skip notifying
 * about the very screen in front of them. HashRouter keeps the active path
 * in `location.hash` (e.g. `#/trades/42`).
 */
function isViewing(route: string): boolean {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return false;
  }
  if (document.visibilityState !== "visible") return false;
  const current = window.location.hash.replace(/^#/, "");
  return (
    current === route ||
    current.startsWith(`${route}?`) ||
    current.startsWith(`${route}/`)
  );
}

/**
 * Build the host deeplink for an in-app route. We keep the host-served base
 * URL (origin + path) and only swap the hash, so the host can focus/reload
 * the iframe straight onto the target screen. This is the one knob to tweak
 * if the host expects a different deeplink shape (e.g. a bare hash path).
 */
function buildDeeplink(route: string): string {
  if (typeof window === "undefined") return `#${route}`;
  const { origin, pathname, search } = window.location;
  return `${origin}${pathname}${search}#${route}`;
}

const NOTIFICATIONS: DevicePermissionKind = "Notifications";

// One permission request per session, cached so a burst of pushes doesn't
// re-prompt. Resolves false when the user denies it.
let permissionPromise: Promise<boolean> | null = null;

export function ensureNotificationPermission(): Promise<boolean> {
  if (!permissionPromise) {
    permissionPromise = requestDevicePermission(NOTIFICATIONS).match(
      (granted) => granted === true,
      (err) => {
        console.warn("[notifications] permission request failed:", err);
        return false;
      },
    );
  }
  return permissionPromise;
}

/**
 * Push a host notification for a fresh inbound statement. Fire-and-forget:
 * never throws into the caller (the message-store writer). No-op when not
 * embedded in a host, when the payload isn't user-facing, when the user is
 * already on the target screen, or when the Notifications permission is denied.
 */
export function notifyIncomingStatement(payload: TradePayload): void {
  if (!isHosted()) return;
  const target = describe(payload);
  if (!target) return;
  if (isViewing(target.route)) return;

  void (async () => {
    try {
      const granted = await ensureNotificationPermission();
      if (!granted) return;
      await notificationManager.push({
        text: target.text,
        deeplink: buildDeeplink(target.route),
      });
    } catch (err) {
      console.warn(
        "[notifications] push failed:",
        err instanceof Error ? err.message : String(err),
      );
    }
  })();
}
