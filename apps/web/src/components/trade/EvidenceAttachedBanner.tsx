/**
 * EvidenceAttachedBanner — small badge shown on trade detail pages once a
 * handoff video CID has been attached to the trade on-chain.
 *
 * Clicking the banner fetches the file from Bulletin Chain and opens it as
 * a blob URL so the user can review without leaving the app.
 */

import { Loader2, ShieldCheck, Video } from "lucide-react";
import { useCallback, useState } from "react";

import { fetchFromHostStorage } from "../../lib/host";

export function EvidenceAttachedBanner({ cid }: { cid: string }): JSX.Element {
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const open = useCallback(async () => {
    setState("loading");
    setErrorMsg(null);
    try {
      const bytes = await fetchFromHostStorage(cid);
      const buf = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buf).set(bytes);
      const blob = new Blob([buf], { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setState("idle");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not fetch clip");
      setState("error");
    }
  }, [cid]);

  return (
    <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] px-4 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <ShieldCheck className="w-4 h-4 text-emerald-300 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm text-emerald-100">Handoff video attached</p>
          <p className="text-[11px] text-stone-400 mono truncate">{cid}</p>
          {errorMsg && (
            <p className="text-[11px] text-rose-300 mt-0.5">{errorMsg}</p>
          )}
        </div>
      </div>
      <button
        onClick={() => void open()}
        disabled={state === "loading"}
        className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/40 text-emerald-200 text-xs font-medium hover:bg-emerald-500/10 transition-colors disabled:opacity-50"
      >
        {state === "loading" ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading…
          </>
        ) : (
          <>
            <Video className="w-3.5 h-3.5" />
            View clip
          </>
        )}
      </button>
    </div>
  );
}
