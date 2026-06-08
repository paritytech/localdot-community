/**
 * EvidenceRecorder — captures a handoff video, uploads it to the Bulletin
 * Chain, and attaches the resulting CID to the trade on-chain.
 *
 * Buyer-side: shown alongside the QR they bring to the meeting. Recording is
 * optional but a strong signal in case of a dispute later.
 *
 * Two-step UX so the wallet only prompts when the user actually commits:
 *   1. Stop  → blob + upload (no signature, just Bulletin store)
 *   2. Attach → setEvidenceCID(tradeId, cid) (one wallet signature)
 */

import { Loader2, ShieldCheck, Square, Video, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useEscrow } from "../../hooks/useEscrow";
import { uploadToHostStorage } from "../../lib/host";

type Stage =
  | { kind: "idle" }
  | { kind: "permission" }
  | { kind: "recording"; stream: MediaStream; startedAt: number }
  | { kind: "uploading"; blob: Blob }
  | { kind: "uploaded"; blob: Blob; cid: string }
  | { kind: "attaching"; cid: string }
  | { kind: "done"; cid: string }
  | { kind: "error"; message: string };

interface EvidenceRecorderProps {
  tradeId: string; // bigint as string
}

export function EvidenceRecorder({
  tradeId,
}: EvidenceRecorderProps): JSX.Element {
  const { setEvidenceCID } = useEscrow();
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [now, setNow] = useState(() => Date.now());

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const previewRef = useRef<HTMLVideoElement | null>(null);

  // Drive the recording timer.
  useEffect(() => {
    if (stage.kind !== "recording") return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [stage.kind]);

  // Wire the live preview to the active stream.
  useEffect(() => {
    if (stage.kind !== "recording") return;
    const el = previewRef.current;
    if (el) {
      el.srcObject = stage.stream;
      void el.play().catch(() => {
        // Autoplay can fail silently in some browsers; the user still has the
        // stop button so we don't surface this.
      });
    }
  }, [stage]);

  // Always release the camera when the component unmounts mid-recording.
  useEffect(
    () => () => {
      const r = recorderRef.current;
      if (r && r.state !== "inactive") {
        r.stream.getTracks().forEach((t) => t.stop());
        try {
          r.stop();
        } catch {
          /* already stopped */
        }
      }
    },
    [],
  );

  const start = useCallback(async () => {
    setStage({ kind: "permission" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: true,
      });

      const mime = pickMimeType();
      const recorder = new MediaRecorder(
        stream,
        mime ? { mimeType: mime } : undefined,
      );
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mime || "video/webm",
        });
        stream.getTracks().forEach((t) => t.stop());
        recorderRef.current = null;
        chunksRef.current = [];
        void uploadEvidence(blob);
      };
      recorderRef.current = recorder;
      recorder.start(1000); // emit chunks every 1s
      setStage({ kind: "recording", stream, startedAt: Date.now() });
    } catch (err) {
      setStage({
        kind: "error",
        message:
          err instanceof Error
            ? err.message
            : "Could not access camera/microphone",
      });
    }
  }, []);

  const stop = useCallback(() => {
    const r = recorderRef.current;
    if (!r) return;
    try {
      r.stop();
    } catch (err) {
      setStage({
        kind: "error",
        message: err instanceof Error ? err.message : "Stop failed",
      });
    }
  }, []);

  const uploadEvidence = useCallback(async (blob: Blob) => {
    setStage({ kind: "uploading", blob });
    try {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const result = await uploadToHostStorage(
        bytes,
        "bulletin",
        "trade-evidence.webm",
      );
      setStage({ kind: "uploaded", blob, cid: result.cid });
    } catch (err) {
      setStage({
        kind: "error",
        message: err instanceof Error ? err.message : "Upload failed",
      });
    }
  }, []);

  const attach = useCallback(async () => {
    if (stage.kind !== "uploaded") return;
    const cid = stage.cid;
    setStage({ kind: "attaching", cid });
    try {
      await setEvidenceCID(BigInt(tradeId), cid);
      setStage({ kind: "done", cid });
    } catch (err) {
      setStage({
        kind: "error",
        message:
          err instanceof Error ? err.message : "Could not attach evidence",
      });
    }
  }, [stage, setEvidenceCID, tradeId]);

  const reset = useCallback(() => {
    chunksRef.current = [];
    recorderRef.current = null;
    setStage({ kind: "idle" });
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (stage.kind === "idle" || stage.kind === "permission") {
    return (
      <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-left">
        <div className="flex items-start gap-2">
          <Video className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-medium text-amber-200">
              Record the handover
            </p>
            <p className="text-[11px] text-stone-400 mt-0.5 leading-relaxed">
              Optional but recommended. The clip is stored on Bulletin Chain for
              ~14 days as evidence in case of a dispute.
            </p>
            <button
              onClick={() => void start()}
              disabled={stage.kind === "permission"}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-300 text-stone-900 text-xs font-medium hover:bg-amber-200 transition-colors disabled:opacity-50"
            >
              {stage.kind === "permission" ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Asking permission…
                </>
              ) : (
                <>
                  <Video className="w-3.5 h-3.5" />
                  Start recording
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (stage.kind === "recording") {
    const seconds = Math.floor((now - stage.startedAt) / 1000);
    const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
    const ss = String(seconds % 60).padStart(2, "0");
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.06] p-3 text-left">
        <div className="flex items-center gap-3">
          <video
            ref={previewRef}
            muted
            playsInline
            className="w-20 h-20 rounded-lg object-cover bg-stone-900"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse" />
              <span className="text-xs font-medium text-rose-200">
                Recording
              </span>
              <span className="mono text-xs text-stone-300 ml-auto">
                {mm}:{ss}
              </span>
            </div>
            <p className="text-[11px] text-stone-400 mt-0.5">
              Capture the cash exchange clearly.
            </p>
            <button
              onClick={stop}
              className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-400 text-stone-900 text-xs font-medium hover:bg-rose-300 transition-colors"
            >
              <Square className="w-3.5 h-3.5" />
              Stop & save
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (stage.kind === "uploading") {
    return (
      <div className="rounded-xl border border-stone-700 bg-stone-900/60 p-3 text-left">
        <div className="flex items-center gap-2 text-xs text-stone-300">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Uploading clip to Bulletin Chain…
        </div>
      </div>
    );
  }

  if (stage.kind === "uploaded") {
    return (
      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3 text-left">
        <div className="flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-300 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-emerald-200">
              Clip stored — attach it to the trade?
            </p>
            <p className="text-[11px] text-stone-400 mt-0.5 leading-relaxed truncate">
              CID: <span className="mono text-stone-300">{stage.cid}</span>
            </p>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => void attach()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-400 text-stone-900 text-xs font-medium hover:bg-emerald-300 transition-colors"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                Attach to trade
              </button>
              <button
                onClick={reset}
                className="px-3 py-1.5 rounded-lg border border-stone-700 text-stone-300 text-xs hover:bg-stone-800/50 transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (stage.kind === "attaching") {
    return (
      <div className="rounded-xl border border-stone-700 bg-stone-900/60 p-3 text-left">
        <div className="flex items-center gap-2 text-xs text-stone-300">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Attaching evidence on chain — confirm in your wallet…
        </div>
      </div>
    );
  }

  if (stage.kind === "done") {
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3 text-left">
        <div className="flex items-center gap-2 text-xs text-emerald-200">
          <ShieldCheck className="w-4 h-4 text-emerald-300" />
          Evidence attached to trade.
        </div>
      </div>
    );
  }

  // error
  return (
    <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.06] p-3 text-left">
      <div className="flex items-start gap-2">
        <X className="w-4 h-4 text-rose-300 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-rose-200">Recording failed</p>
          <p className="text-[11px] text-stone-400 mt-0.5">{stage.message}</p>
          <button
            onClick={reset}
            className="mt-2 px-3 py-1.5 rounded-lg border border-stone-700 text-stone-300 text-xs hover:bg-stone-800/50 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    </div>
  );
}

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  const candidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return null;
}
