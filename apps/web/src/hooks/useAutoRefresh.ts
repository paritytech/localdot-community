import { useEffect, useRef } from "react";

interface AutoRefreshOptions {
  /** Poll interval in ms while the tab is visible. 0 disables interval polling. */
  intervalMs?: number;
  /** When false, no polling or focus refresh runs (e.g. while not connected). */
  enabled?: boolean;
  /** Also refresh when the tab regains focus / becomes visible. Default true. */
  refetchOnFocus?: boolean;
}

/**
 * Keeps on-chain / remote data fresh without a manual browser reload.
 *
 * Calls `refresh` on a fixed interval *while the tab is visible*, and again
 * whenever the tab regains focus or visibility. Hidden background tabs never
 * poll (saves chain queries), and coming back to the app triggers an immediate
 * refresh. Bursts (focus + visibilitychange firing together) are throttled.
 *
 * `refresh` should be "silent" — it must not toggle a full-page loading flag,
 * or the UI will flash a spinner on every poll.
 */
export function useAutoRefresh(
  refresh: () => void | Promise<void>,
  {
    intervalMs = 0,
    enabled = true,
    refetchOnFocus = true,
  }: AutoRefreshOptions = {},
): void {
  // Hold the latest callback in a ref so a changing closure identity does not
  // tear down and re-arm the interval / listeners on every render.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    if (!enabled) return;

    let lastRun = 0;
    const run = (): void => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastRun < 2_000) return; // throttle focus/visibility bursts
      lastRun = now;
      void refreshRef.current();
    };

    const intervalId =
      intervalMs > 0 ? setInterval(run, intervalMs) : undefined;

    if (refetchOnFocus) {
      document.addEventListener("visibilitychange", run);
      window.addEventListener("focus", run);
    }

    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener("visibilitychange", run);
      window.removeEventListener("focus", run);
    };
  }, [enabled, intervalMs, refetchOnFocus]);
}
