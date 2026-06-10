/**
 * ZKPassport Verification Component
 *
 * Full-page flow for verifying identity with zkpassport.
 * Always shows QR code for scanning. On mobile, provides a manual link
 * to open the zkpassport app if QR scanning isn't convenient.
 */

import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";

import { useZKPassport } from "../../hooks/useZKPassport";
import { Spinner } from "../common/Spinner";

interface ZKPassportVerifyProps {
  /** Called when verification is complete */
  onComplete?: () => void;
  /** Called when user cancels */
  onCancel?: () => void;
  /** Whether to disclose country */
  discloseCountry?: boolean;
}

export function ZKPassportVerify({
  onComplete,
  onCancel,
  discloseCountry = false,
}: ZKPassportVerifyProps): JSX.Element {
  const {
    status,
    isVerified,
    errorMessage,
    verificationUrl,
    deepLinkUrl,
    isMobile,
    startVerification,
    reset,
  } = useZKPassport({ discloseCountry, autoRefresh: true });

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState(false);

  // Generate QR code when verification URL is available
  useEffect(() => {
    if (!verificationUrl) {
      setQrDataUrl(null);
      setQrError(false);
      return;
    }

    // Track cancellation to prevent state updates on unmounted component
    let cancelled = false;

    setQrError(false);
    QRCode.toDataURL(verificationUrl, {
      width: 280,
      margin: 2,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    })
      .then((dataUrl) => {
        if (!cancelled) {
          setQrDataUrl(dataUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setQrError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [verificationUrl]);

  const handleStart = useCallback(() => {
    void startVerification();
  }, [startVerification]);

  // Actually retry verification instead of just resetting
  const handleTryAgain = useCallback(() => {
    reset();
    // Use setTimeout to ensure reset completes before starting new verification
    setTimeout(() => {
      void startVerification();
    }, 0);
  }, [reset, startVerification]);

  const handleCancel = useCallback(() => {
    reset();
    onCancel?.();
  }, [reset, onCancel]);

  // Already verified
  if (isVerified && status === "idle") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] px-4">
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-green-400"
          >
            <path d="M9 12l2 2 4-4" />
            <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-stone-200 mb-2">
          Already Verified
        </h2>
        <p className="text-stone-400 text-sm text-center max-w-xs">
          Your identity has been verified with zkpassport.
        </p>
        <button
          onClick={onCancel}
          className="mt-6 px-6 py-2.5 rounded-xl bg-stone-800 text-stone-200 text-sm font-medium hover:bg-stone-700 transition-colors"
        >
          Done
        </button>
      </div>
    );
  }

  // Error state
  if (status === "error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] px-4">
        <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-red-400"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-stone-200 mb-2">
          Verification Failed
        </h2>
        <p className="text-stone-400 text-sm text-center max-w-xs mb-6">
          {errorMessage}
        </p>
        <div className="flex gap-3">
          <button
            onClick={handleCancel}
            className="px-6 py-2.5 rounded-xl bg-stone-800 text-stone-200 text-sm font-medium hover:bg-stone-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleTryAgain}
            className="px-6 py-2.5 rounded-xl bg-stone-100 text-stone-900 text-sm font-medium hover:bg-stone-200 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Success state
  if (status === "verified") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] px-4">
        <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-green-400"
          >
            <path d="M9 12l2 2 4-4" />
            <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-stone-200 mb-2">
          Verification Complete
        </h2>
        <p className="text-stone-400 text-sm text-center max-w-xs">
          Your identity has been verified and recorded on-chain.
        </p>
        <button
          onClick={onComplete}
          className="mt-6 px-6 py-2.5 rounded-xl bg-stone-100 text-stone-900 text-sm font-medium hover:bg-stone-200 transition-colors"
        >
          Done
        </button>
      </div>
    );
  }

  // Submitting to chain
  if (status === "submitting") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] px-4">
        <Spinner size="lg" inline />
        <h2 className="text-xl font-semibold text-stone-200 mt-6 mb-2">
          Recording on Chain
        </h2>
        <p className="text-stone-400 text-sm text-center max-w-xs">
          Please confirm the transaction in your wallet to complete
          verification.
        </p>
      </div>
    );
  }

  // Generating proof
  if (status === "proving") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] px-4">
        <Spinner size="lg" inline />
        <h2 className="text-xl font-semibold text-stone-200 mt-6 mb-2">
          Generating Proof
        </h2>
        <p className="text-stone-400 text-sm text-center max-w-xs">
          The zkpassport app is generating a zero-knowledge proof. This may take
          a moment. Keep this tab open while the proof is returned.
        </p>
      </div>
    );
  }

  // Waiting for user to scan/verify
  if (status === "pending" && verificationUrl) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] px-4">
        {/* Show QR code */}
        {qrDataUrl && (
          <>
            <div className="bg-white rounded-2xl p-4 mb-6">
              <img
                src={qrDataUrl}
                alt="Scan with zkpassport app"
                className="w-64 h-64"
              />
            </div>
            <h2 className="text-xl font-semibold text-stone-200 mb-2">
              Scan with zkpassport
            </h2>
            <p className="text-stone-400 text-sm text-center max-w-xs mb-4">
              Open the zkpassport app on your phone and scan this QR code to
              verify your identity.
            </p>
            <div className="flex items-center gap-4 text-xs">
              <span className="text-stone-500">Don&apos;t have the app?</span>
              <a
                href="https://apps.apple.com/app/zkpassport/id6504912407"
                target="_blank"
                rel="noopener noreferrer"
                className="text-stone-400 hover:text-stone-300 transition-colors underline"
              >
                iOS
              </a>
              <a
                href="https://play.google.com/store/apps/details?id=id.zkpassport.app"
                target="_blank"
                rel="noopener noreferrer"
                className="text-stone-400 hover:text-stone-300 transition-colors underline"
              >
                Android
              </a>
            </div>
          </>
        )}

        {/* Desktop: QR generation failed - show fallback link */}
        {!isMobile && qrError && (
          <>
            <div className="w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center mb-4">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="text-yellow-400"
              >
                <path d="M12 9v4M12 17h.01" />
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-stone-200 mb-2">
              QR Code Unavailable
            </h2>
            <p className="text-stone-400 text-sm text-center max-w-xs mb-4">
              Could not generate QR code. Use the link below on your mobile
              device instead.
            </p>
            <a
              href={verificationUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-2.5 rounded-xl bg-stone-100 text-stone-900 text-sm font-medium hover:bg-stone-200 transition-colors"
            >
              Open Verification Link
            </a>
          </>
        )}

        {/* Desktop: QR still loading */}
        {!isMobile && !qrDataUrl && !qrError && <Spinner size="lg" inline />}

        {/* Mobile fallback: Only show if QR code failed to generate */}
        {isMobile && !qrDataUrl && !qrError && (
          <>
            <Spinner size="md" inline />
            <h2 className="text-xl font-semibold text-stone-200 mt-6 mb-2">
              Ready to Verify
            </h2>
            {/* Removed misleading "automatically" - app doesn't auto-open */}
            <p className="text-stone-400 text-sm text-center max-w-xs mb-4">
              Tap below to open the zkpassport app.
            </p>
            <a
              href={deepLinkUrl ?? verificationUrl}
              className="px-6 py-2.5 rounded-xl bg-stone-100 text-stone-900 text-sm font-medium hover:bg-stone-200 transition-colors"
            >
              Open zkpassport
            </a>
          </>
        )}

        <button
          onClick={handleCancel}
          className="mt-6 text-stone-500 text-sm hover:text-stone-400 transition-colors"
        >
          Cancel
        </button>
      </div>
    );
  }

  // Connecting state
  if (status === "connecting") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] px-4">
        <Spinner size="lg" inline />
        <h2 className="text-xl font-semibold text-stone-200 mt-6 mb-2">
          Connecting
        </h2>
        <p className="text-stone-400 text-sm text-center max-w-xs">
          Setting up your verification request...
        </p>
      </div>
    );
  }

  // Initial state - show start button
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] px-4">
      {/* zkpassport logo/icon */}
      <div className="w-20 h-20 rounded-full bg-stone-800 border border-stone-700 flex items-center justify-center mb-6">
        <svg
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-stone-300"
        >
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="9" cy="12" r="2" />
          <path d="M15 10h3M15 14h3" />
        </svg>
      </div>

      <h2 className="text-xl font-semibold text-stone-200 mb-2">
        Verify Your Identity
      </h2>
      <p className="text-stone-400 text-sm text-center max-w-xs mb-6">
        Use zkpassport to prove you&apos;re 18+ without sharing personal data.
        This creates a verified badge on your profile.
      </p>

      {/* Features list */}
      <div className="w-full max-w-xs space-y-3 mb-8">
        <div className="flex items-center gap-3 text-sm">
          <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-green-400"
            >
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <span className="text-stone-300">Zero-knowledge proof</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-green-400"
            >
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <span className="text-stone-300">No personal data shared</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-green-400"
            >
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <span className="text-stone-300">On-chain verified badge</span>
        </div>
      </div>

      <button
        onClick={handleStart}
        className="w-full max-w-xs py-3 rounded-xl bg-stone-100 text-stone-900 text-sm font-medium hover:bg-white transition-colors"
      >
        Start Verification
      </button>

      {onCancel && (
        <button
          onClick={onCancel}
          className="mt-4 text-stone-500 text-sm hover:text-stone-400 transition-colors"
        >
          Maybe later
        </button>
      )}
    </div>
  );
}
