import { type DependencyList, useEffect } from "react";

/**
 * Run an async effect that respects React 18 strict-mode double-mount and
 * unmounts: the callback receives a `cancelled` ref-like getter so it can
 * bail before calling `setState` on a stale render.
 *
 * Usage:
 *   useAsyncEffect(async (isCancelled) => {
 *     const data = await fetchSomething();
 *     if (isCancelled()) return;
 *     setData(data);
 *   }, [deps]);
 *
 * Replaces the boilerplate `let cancelled = false; … return () => { cancelled = true; }`
 * that's otherwise duplicated for every chain fetch.
 */
export function useAsyncEffect(
  effect: (isCancelled: () => boolean) => Promise<void> | void,
  deps: DependencyList,
): void {
  useEffect(() => {
    let cancelled = false;
    void effect(() => cancelled);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
