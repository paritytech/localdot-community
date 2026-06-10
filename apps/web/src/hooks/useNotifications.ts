/**
 * useNotifications — a read-only activity feed derived from the local Dexie
 * `message-store`. The SS subscriber (started in WalletContext on wallet
 * connect) writes every statement it sees — incoming and outgoing — into one
 * table; this hook subscribes to that table via `useLiveQuery` and turns each
 * row into a display-ready notification.
 *
 * "Regarding us" is exactly the contents of the store: the subscriber only
 * listens on our own inboxes (address inbox + owned-offer request inboxes) and
 * we record our own outbound rows, so every row is about us either way.
 *
 * Unread model: a single "last seen" timestamp persisted in localStorage. An
 * incoming, non-ack row newer than that timestamp counts as unread. Acks are
 * passive delivery receipts, so they're listed but never inflate the badge.
 * `markAllRead` advances the timestamp (called when the panel closes).
 */

import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useMemo, useState } from "react";

import { db, type StoredStatement } from "../lib/message-store";

const SEEN_TS_KEY = "localdot_notifications_seen_ts";

/** Cap the feed — bounded by trade activity, but no reason to render thousands. */
const MAX_NOTIFICATIONS = 100;

function loadSeenTs(): number {
  try {
    const raw = localStorage.getItem(SEEN_TS_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function saveSeenTs(ts: number): void {
  try {
    localStorage.setItem(SEEN_TS_KEY, String(ts));
  } catch {
    /* ignored */
  }
}

export type NotificationTone =
  | "request"
  | "accept"
  | "decline"
  | "proposal"
  | "status"
  | "ack"
  | "neutral";

export interface NotificationItem {
  /** Stable key = the row's composite PK. */
  pk: string;
  kind: StoredStatement["k"];
  direction: StoredStatement["direction"];
  title: string;
  description: string;
  tone: NotificationTone;
  /** Publish timestamp (event time), used for ordering + relative display. */
  ts: number;
  /** Highlighted + counted toward the unread badge. */
  unread: boolean;
  /** In-app route to open on click, or null when the row isn't actionable. */
  route: string | null;
}

function shortAddr(addr?: string): string {
  if (!addr) return "someone";
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

/** Map a stored statement to a human title/description/tone. Switches on the
 *  payload's own discriminant so each case is properly narrowed (no casts). */
function describe(row: StoredStatement): {
  title: string;
  description: string;
  tone: NotificationTone;
} {
  const mine = row.direction === "outgoing";
  const payload = row.payload;

  // `unsupported` rows (and any future null-payload row) have no decoded body.
  if (!payload) {
    return {
      title: "Unsupported message",
      description: "A message from a different app version",
      tone: "neutral",
    };
  }

  switch (payload.k) {
    case "req": {
      const amt = `${payload.amount} ${payload.cur}`;
      if (mine) {
        return {
          title: "Trade request sent",
          description: `${amt} · offer #${payload.offerId}`,
          tone: "request",
        };
      }
      return {
        title: "New trade request",
        description: `${amt} · from ${shortAddr(payload.from)}${
          payload.note ? ` · “${payload.note}”` : ""
        }`,
        tone: "request",
      };
    }
    case "res": {
      const accepted = payload.status === "accept";
      if (mine) {
        return {
          title: accepted ? "You accepted a request" : "You declined a request",
          description: `Request ${shortId(payload.id)}`,
          tone: accepted ? "accept" : "decline",
        };
      }
      return {
        title: accepted ? "Request accepted" : "Request declined",
        description: accepted
          ? "Your trade request was accepted"
          : "Your trade request was declined",
        tone: accepted ? "accept" : "decline",
      };
    }
    case "prop": {
      const what =
        payload.kind === "time"
          ? "new time"
          : payload.kind === "location"
            ? "meeting place"
            : "recognition detail";
      return mine
        ? {
            title: "Proposal sent",
            description: `Proposed a ${what}`,
            tone: "proposal",
          }
        : {
            title: "New trade proposal",
            description: `${shortAddr(payload.from)} proposed a ${what}`,
            tone: "proposal",
          };
    }
    case "prop-res": {
      const accepted = payload.status === "accept";
      if (mine) {
        return {
          title: accepted
            ? "You accepted a proposal"
            : "You declined a proposal",
          description: `Proposal ${shortId(payload.id)}`,
          tone: accepted ? "accept" : "decline",
        };
      }
      return {
        title: accepted ? "Proposal accepted" : "Proposal declined",
        description: `Proposal ${shortId(payload.id)}`,
        tone: accepted ? "accept" : "decline",
      };
    }
    case "status": {
      const label =
        payload.status === "on-the-way"
          ? "on the way"
          : payload.status === "here"
            ? "here"
            : payload.status === "late"
              ? `running late${
                  payload.lateMinutes ? ` (${payload.lateMinutes}m)` : ""
                }`
              : "idle";
      return {
        title: `Trade status: ${label}`,
        description: mine
          ? "You updated your status"
          : `${shortAddr(payload.from)} is ${label}`,
        tone: "status",
      };
    }
    case "ack": {
      const what = payload.refK === "req" ? "request" : "proposal";
      return {
        title: "Delivered",
        description: `Your ${what} was received`,
        tone: "ack",
      };
    }
    default:
      return { title: "Activity", description: "", tone: "neutral" };
  }
}

/**
 * In-app HashRouter destination for a click on this notification. Mirrors the
 * deep-link targets used for host push notifications (see
 * `lib/host/notifications`): trade-scoped activity opens the trade screen, and
 * a trade request/response opens the profile tab that actually tracks it —
 * **Received** for inbound requests (and my own replies to them), **Sent** for
 * the requests I sent (and the replies I get back) — via `?tab=`. Routing by
 * direction matters: a "new trade request" must land on Received, not whatever
 * tab Profile would otherwise default to. Returns null when there's nothing
 * useful to open (delivery acks, unsupported rows).
 */
function routeFor(row: StoredStatement): string | null {
  const payload = row.payload;
  if (!payload) return null;
  const mine = row.direction === "outgoing";
  switch (payload.k) {
    case "req":
      // Inbound = a buyer requested my offer → Received. Outbound = a request
      // I sent → Sent.
      return mine ? "/profile?tab=sent" : "/profile?tab=requests";
    case "res":
      // Inbound = a reply to a request I sent → Sent. Outbound = my own
      // accept/decline of a received request → Received.
      return mine ? "/profile?tab=requests" : "/profile?tab=sent";
    case "prop":
    case "prop-res":
    case "status":
      return `/trades/${payload.tradeId}`;
    case "ack":
    default:
      return null;
  }
}

interface UseNotificationsReturn {
  notifications: NotificationItem[];
  unreadCount: number;
  /** Advance the "last seen" marker so current items stop counting as unread. */
  markAllRead: () => void;
  /** Hide a single row from the bell (soft, bell-only — see `notifDismissed`). */
  dismiss: (pk: string) => void;
  /** Hide every row currently in the feed from the bell. */
  clearAll: () => void;
}

export function useNotifications(): UseNotificationsReturn {
  const [seenTs, setSeenTs] = useState<number>(loadSeenTs);

  // Newest first, capped. `ts` is indexed in the Dexie schema.
  const rows =
    useLiveQuery<StoredStatement[]>(
      () =>
        db.statements
          .orderBy("ts")
          .reverse()
          .limit(MAX_NOTIFICATIONS)
          .toArray(),
      [],
    ) ?? [];

  const notifications = useMemo<NotificationItem[]>(
    () =>
      rows
        .filter((r) => !r.dismissed && !r.notifDismissed)
        .map((r) => {
          const d = describe(r);
          // Acks are passive receipts: shown, but never "unread".
          const unread =
            r.direction === "incoming" && r.k !== "ack" && r.ts > seenTs;
          return {
            pk: r.pk,
            kind: r.k,
            direction: r.direction,
            ts: r.ts,
            unread,
            route: routeFor(r),
            ...d,
          };
        }),
    [rows, seenTs],
  );

  const unreadCount = useMemo(
    () => notifications.reduce((n, item) => n + (item.unread ? 1 : 0), 0),
    [notifications],
  );

  const markAllRead = useCallback(() => {
    // Cover everything currently in the feed, guarding against peer clock skew
    // that could leave a just-arrived row's ts slightly ahead of our clock.
    const maxTs = rows.reduce((m, r) => Math.max(m, r.ts), 0);
    const next = Math.max(Date.now(), maxTs);
    setSeenTs(next);
    saveSeenTs(next);
  }, [rows]);

  const dismiss = useCallback((pk: string) => {
    void db.statements.update(pk, { notifDismissed: true });
  }, []);

  const clearAll = useCallback(() => {
    const pks = notifications.map((n) => n.pk);
    if (pks.length === 0) return;
    void db.statements.where("pk").anyOf(pks).modify({ notifDismissed: true });
  }, [notifications]);

  return { notifications, unreadCount, markAllRead, dismiss, clearAll };
}
