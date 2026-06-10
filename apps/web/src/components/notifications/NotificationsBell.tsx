/**
 * NotificationsBell — nav-bar bell that surfaces everything the Statement
 * Store subscriber has collected about us (see `useNotifications`). Click to
 * open a dropdown listing all statements regarding the connected wallet:
 * incoming trade requests, accept/declines, proposals, live status, and
 * delivery receipts, plus our own outbound actions.
 *
 * Unread badge clears when the panel closes (`markAllRead`), so opening it
 * counts as "seen". Renders nothing until a wallet is connected.
 */

import {
  ArrowLeftRight,
  BadgeCheck,
  Bell,
  CalendarClock,
  Check,
  type LucideIcon,
  Radio,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useWalletContext } from "../../context/WalletContext";
import {
  type NotificationItem,
  type NotificationTone,
  useNotifications,
} from "../../hooks/useNotifications";

function toneVisual(tone: NotificationTone): {
  Icon: LucideIcon;
  color: string;
} {
  switch (tone) {
    case "request":
      return { Icon: ArrowLeftRight, color: "text-amber-400" };
    case "accept":
      return { Icon: Check, color: "text-green-400" };
    case "decline":
      return { Icon: X, color: "text-red-400" };
    case "proposal":
      return { Icon: CalendarClock, color: "text-sky-400" };
    case "status":
      return { Icon: Radio, color: "text-sky-400" };
    case "ack":
      return { Icon: BadgeCheck, color: "text-stone-500" };
    case "neutral":
      return { Icon: Bell, color: "text-stone-400" };
    default:
      return { Icon: Bell, color: "text-stone-400" };
  }
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function NotificationRow({
  n,
  onClick,
  onDismiss,
}: {
  n: NotificationItem;
  onClick?: () => void;
  onDismiss: () => void;
}): JSX.Element {
  const { Icon, color } = toneVisual(n.tone);
  const body = (
    <>
      <span className={`mt-0.5 flex-shrink-0 ${color}`}>
        <Icon className="w-4 h-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-stone-100 truncate">
            {n.title}
          </p>
          <span className="text-xs text-stone-500 flex-shrink-0">
            {timeAgo(n.ts)}
          </span>
        </div>
        {n.description && (
          <p className="text-xs text-stone-400 mt-0.5 break-words">
            {n.description}
          </p>
        )}
      </div>
      {n.unread && (
        <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
      )}
    </>
  );
  const innerClass = "flex items-start gap-3 px-4 py-3 flex-1 min-w-0";

  // The clickable nav target and the dismiss X are siblings (never nested) so
  // both stay valid, keyboard-focusable buttons. Actionable rows (a trade /
  // inbox to open) render their body as a full-width button; informational
  // rows render it as a plain div.
  return (
    <li
      className={`group flex items-stretch ${n.unread ? "bg-stone-800/40" : ""}`}
    >
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className={`${innerClass} text-left hover:bg-stone-800/70 transition-colors`}
        >
          {body}
        </button>
      ) : (
        <div className={innerClass}>{body}</div>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        title="Dismiss"
        className="flex-shrink-0 flex items-start pt-3.5 pr-3 pl-1 text-stone-600 hover:text-stone-300 transition-colors"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </li>
  );
}

export function NotificationsBell(): JSX.Element | null {
  const { isConnected } = useWalletContext();
  const { notifications, unreadCount, markAllRead, dismiss, clearAll } =
    useNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  // Marking read on close means opening the panel counts as "seen", while the
  // unread highlights stay visible the whole time it's open.
  const close = useCallback(() => {
    setOpen(false);
    markAllRead();
  }, [markAllRead]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!isConnected) return null;

  return (
    <div className="relative">
      <button
        onClick={() => (open ? close() : setOpen(true))}
        aria-label="Notifications"
        title="Notifications"
        className={`relative inline-flex items-center justify-center w-9 h-9 rounded-full border transition-colors ${
          open
            ? "border-stone-600 bg-stone-800 text-stone-100"
            : "border-stone-700 text-stone-400 hover:text-stone-100 hover:border-stone-600"
        }`}
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Invisible backdrop: any outside click closes the panel. */}
          <div
            className="fixed inset-0 z-[1500]"
            onClick={close}
            aria-hidden="true"
          />
          <div className="absolute right-0 mt-2 w-80 max-w-[calc(100vw-1rem)] z-[1600] rounded-2xl border border-stone-700 bg-stone-900 shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-stone-800">
              <h3 className="text-sm font-medium text-stone-100">
                Notifications
              </h3>
              {notifications.length > 0 && (
                <span className="text-xs text-stone-500">
                  {notifications.length}
                </span>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <Bell className="w-6 h-6 text-stone-700 mx-auto mb-2" />
                  <p className="text-sm text-stone-500">No notifications yet</p>
                  <p className="text-xs text-stone-600 mt-1">
                    Trade requests and updates will show up here.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-stone-800">
                  {notifications.map((n) => {
                    const route = n.route;
                    return (
                      <NotificationRow
                        key={n.pk}
                        n={n}
                        onClick={
                          route
                            ? () => {
                                close();
                                navigate(route);
                              }
                            : undefined
                        }
                        onDismiss={() => dismiss(n.pk)}
                      />
                    );
                  })}
                </ul>
              )}
            </div>
            {notifications.length > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="w-full border-t border-stone-800 px-4 py-2.5 text-center text-xs text-stone-500 hover:text-stone-300 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
