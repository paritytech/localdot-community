/**
 * SwipeConfirm Component
 *
 * Swipe-to-confirm gesture for trade confirmations. Drag the thumb across the
 * track (touch or mouse) to fire `onConfirm`. Fully keyboard-operable too —
 * focus the control and press Enter / Space / →, so it works on desktop and
 * for assistive tech without a drag.
 *
 * The public API (label / onConfirm / disabled / loading / variant) is stable;
 * every caller (agent release, provider pickup, direct handoff) shares it.
 */

import { ArrowRight, Check, ChevronRight } from "lucide-react";
import { useCallback, useRef, useState } from "react";

interface SwipeConfirmProps {
  /** Text to display on the button */
  label: string;
  /** Called when swipe is completed */
  onConfirm: () => void;
  /** Whether the button is disabled */
  disabled?: boolean;
  /** Whether confirmation is in progress */
  loading?: boolean;
  /** Color variant */
  variant?: "default" | "success" | "danger";
}

const SWIPE_THRESHOLD = 0.85; // 85% of track width to confirm
const THUMB_WIDTH = 48; // matches the w-12 thumb + insets below

function buzz(): void {
  // Best-effort haptic — silently no-ops where unsupported (desktop, iOS Safari).
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.vibrate === "function"
  ) {
    try {
      navigator.vibrate(18);
    } catch {
      // ignore — vibration is a nicety, never load-bearing
    }
  }
}

export function SwipeConfirm({
  label,
  onConfirm,
  disabled = false,
  loading = false,
  variant = "default",
}: SwipeConfirmProps): JSX.Element {
  const trackRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const startXRef = useRef(0);

  const getTrackWidth = useCallback(() => {
    if (!trackRef.current) return 0;
    // Usable travel = full track minus the thumb width.
    return trackRef.current.offsetWidth - THUMB_WIDTH;
  }, []);

  const complete = useCallback(() => {
    setIsCompleted(true);
    setProgress(1);
    buzz();
    onConfirm();
  }, [onConfirm]);

  const handleStart = useCallback(
    (clientX: number) => {
      if (disabled || loading || isCompleted) return;
      setIsDragging(true);
      startXRef.current = clientX;
    },
    [disabled, loading, isCompleted],
  );

  const handleMove = useCallback(
    (clientX: number) => {
      if (!isDragging) return;

      const trackWidth = getTrackWidth();
      if (trackWidth === 0) return;

      const delta = clientX - startXRef.current;
      const newProgress = Math.max(0, Math.min(1, delta / trackWidth));
      setProgress(newProgress);
    },
    [isDragging, getTrackWidth],
  );

  const handleEnd = useCallback(() => {
    if (!isDragging) return;
    setIsDragging(false);

    if (progress >= SWIPE_THRESHOLD) {
      complete();
    } else {
      // Animate back to start
      setProgress(0);
    }
  }, [isDragging, progress, complete]);

  // Touch event handlers
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      if (touch) handleStart(touch.clientX);
    },
    [handleStart],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      if (touch) handleMove(touch.clientX);
    },
    [handleMove],
  );

  const onTouchEnd = useCallback(() => {
    handleEnd();
  }, [handleEnd]);

  // Mouse event handlers (for desktop testing)
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      handleStart(e.clientX);
    },
    [handleStart],
  );

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      handleMove(e.clientX);
    },
    [handleMove],
  );

  const onMouseUp = useCallback(() => {
    handleEnd();
  }, [handleEnd]);

  const onMouseLeave = useCallback(() => {
    if (isDragging) handleEnd();
  }, [isDragging, handleEnd]);

  // Keyboard: confirm on Enter / Space / → so the control is fully operable
  // without a pointer (conventional button activation).
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (disabled || loading || isCompleted) return;
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
        e.preventDefault();
        complete();
      }
    },
    [disabled, loading, isCompleted, complete],
  );

  // Variant colors — track / fill gradient / thumb.
  const variantColors = {
    default: {
      track: "bg-stone-800",
      fill: "from-stone-600 to-stone-500",
      thumb: "bg-stone-100",
      thumbIcon: "text-stone-900",
      text: "text-stone-400",
      ring: "focus-visible:ring-stone-500/50",
    },
    success: {
      track: "bg-green-950",
      fill: "from-green-600 to-emerald-500",
      thumb: "bg-green-500",
      thumbIcon: "text-white",
      text: "text-green-300",
      ring: "focus-visible:ring-green-500/50",
    },
    danger: {
      track: "bg-red-950",
      fill: "from-red-600 to-rose-500",
      thumb: "bg-red-500",
      thumbIcon: "text-white",
      text: "text-red-300",
      ring: "focus-visible:ring-red-500/50",
    },
  };

  const colors = variantColors[variant];
  const thumbPosition = progress * getTrackWidth();
  const interactive = !disabled && !loading && !isCompleted;

  return (
    <div
      ref={trackRef}
      role="button"
      aria-label={label}
      aria-disabled={disabled || loading || undefined}
      tabIndex={interactive ? 0 : -1}
      onKeyDown={onKeyDown}
      className={`relative h-14 rounded-full overflow-hidden select-none outline-none ring-2 ring-transparent transition-shadow ${colors.ring} focus-visible:ring-offset-0 ${colors.track} ${
        disabled || loading ? "opacity-50 cursor-not-allowed" : "cursor-grab"
      } ${isDragging ? "cursor-grabbing" : ""}`}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
    >
      {/* Inner inset shadow for depth */}
      <div className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_1px_2px_rgba(0,0,0,0.45)]" />

      {/* Progress fill — gradient that follows the thumb */}
      <div
        className={`absolute inset-y-0 left-0 bg-gradient-to-r ${colors.fill} ${
          isDragging ? "duration-0" : "duration-300"
        } transition-all`}
        style={{ width: `${Math.max(progress * 100, isCompleted ? 100 : 0)}%` }}
      />

      {/* Label + swipe hint */}
      <div
        className={`absolute inset-0 flex items-center justify-center gap-2 ${colors.text} text-sm font-medium transition-opacity ${
          progress > 0.25 && !isCompleted ? "opacity-0" : "opacity-100"
        }`}
      >
        {loading ? (
          <span className="flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            Processing…
          </span>
        ) : isCompleted ? (
          <span className="flex items-center gap-2 text-white">
            <Check className="w-4 h-4" />
            Confirmed
          </span>
        ) : (
          <>
            {/* leave room for the thumb at rest so the label stays centered */}
            <span className="pl-10">{label}</span>
            <span className="flex items-center -space-x-1.5" aria-hidden>
              <ChevronRight className="w-4 h-4 opacity-30 animate-pulse [animation-delay:0ms]" />
              <ChevronRight className="w-4 h-4 opacity-60 animate-pulse [animation-delay:150ms]" />
              <ChevronRight className="w-4 h-4 opacity-90 animate-pulse [animation-delay:300ms]" />
            </span>
          </>
        )}
      </div>

      {/* Swipe thumb */}
      <div
        className={`absolute top-1 bottom-1 left-1 w-12 rounded-full ${colors.thumb} flex items-center justify-center shadow-lg ring-1 ring-black/10 z-10 ${
          isDragging ? "duration-0 scale-105" : "duration-300"
        } transition-transform`}
        style={{ transform: `translateX(${thumbPosition}px)` }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
      >
        {isCompleted ? (
          <Check className={`w-5 h-5 ${colors.thumbIcon}`} />
        ) : (
          <ArrowRight className={`w-5 h-5 ${colors.thumbIcon}`} />
        )}
      </div>
    </div>
  );
}
