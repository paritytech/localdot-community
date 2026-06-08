/**
 * useZKPassport Hook
 *
 * Provides zkpassport verification flow and on-chain attestation management.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import {
  getSignerAndAddress,
  useWalletContext,
} from "../context/WalletContext";
import type { ZKPassportAttestation } from "../lib/host";
import {
  getZKPassportAttestation,
  isZKPassportVerified,
  revokeZKPassportAttestation,
  submitZKPassportAttestation,
} from "../lib/host";
import type {
  VerificationError,
  VerificationStatus,
  ZKPassportResult,
} from "../lib/zkpassport";
import {
  countryToCode,
  createVerificationRequest,
  getDeepLinkUrl,
  hashUniqueId,
  isMobileDevice,
  VERIFICATION_ERROR_MESSAGES,
} from "../lib/zkpassport";

const BRIDGE_RECONNECT_GRACE_MS = 45_000;

export interface UseZKPassportOptions {
  /** Whether to disclose country during verification */
  discloseCountry?: boolean;
  /** Auto-refresh attestation status on mount */
  autoRefresh?: boolean;
}

export interface UseZKPassportReturn {
  /** Current verification flow status */
  status: VerificationStatus;
  /** Whether the connected wallet is verified */
  isVerified: boolean;
  /** Attestation data if verified */
  attestation: ZKPassportAttestation | null;
  /** Current error if any */
  error: VerificationError | null;
  /** Error message for display */
  errorMessage: string | null;
  /** Verification URL for QR code */
  verificationUrl: string | null;
  /** Deep link URL for mobile */
  deepLinkUrl: string | null;
  /** Whether running on mobile device */
  isMobile: boolean;
  /** Start the verification flow */
  startVerification: () => Promise<void>;
  /** Reset verification state */
  reset: () => void;
  /** Refresh attestation status from chain */
  refreshAttestation: () => Promise<void>;
  /** Revoke current attestation */
  revokeAttestation: () => Promise<void>;
  /** Loading state for attestation queries */
  isLoading: boolean;
}

export function useZKPassport(
  options: UseZKPassportOptions = {},
): UseZKPassportReturn {
  const { discloseCountry = false, autoRefresh = true } = options;
  const { address } = useWalletContext();

  // State
  const [status, setStatus] = useState<VerificationStatus>("idle");
  const [isVerified, setIsVerified] = useState(false);
  const [attestation, setAttestation] = useState<ZKPassportAttestation | null>(
    null,
  );
  const [error, setError] = useState<VerificationError | null>(null);
  const [verificationUrl, setVerificationUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Track wallet address captured at verification start to detect mid-flow changes
  const verificationAddressRef = useRef<string | null>(null);
  // Request counter for stale-request guard (used for ALL requests)
  const requestCounterRef = useRef(0);
  // Active verification request ID (track to invalidate callbacks)
  const activeRequestIdRef = useRef<string | null>(null);
  const activeSdkRequestIdRef = useRef<string | null>(null);
  const activeCancelRef = useRef<(() => void) | null>(null);
  const bridgeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isMobile = isMobileDevice();

  const clearBridgeTimeout = useCallback(() => {
    if (bridgeTimeoutRef.current) {
      clearTimeout(bridgeTimeoutRef.current);
      bridgeTimeoutRef.current = null;
    }
  }, []);

  const cancelActiveVerificationRequest = useCallback(() => {
    clearBridgeTimeout();
    activeCancelRef.current?.();
    activeCancelRef.current = null;
    activeSdkRequestIdRef.current = null;
  }, [clearBridgeTimeout]);

  const scheduleBridgeTimeout = useCallback(
    (requestId: string) => {
      clearBridgeTimeout();
      bridgeTimeoutRef.current = setTimeout(() => {
        if (activeRequestIdRef.current !== requestId) {
          return;
        }
        cancelActiveVerificationRequest();
        setError("network_error");
        setStatus("error");
      }, BRIDGE_RECONNECT_GRACE_MS);
    },
    [cancelActiveVerificationRequest, clearBridgeTimeout],
  );

  /**
   * Refresh attestation status from chain
   * @param options.throwOnError - If true, throws instead of swallowing errors
   */
  const refreshAttestation = useCallback(
    async (opts: { throwOnError?: boolean } = {}) => {
      // Always increment counter BEFORE address check to invalidate in-flight requests
      const thisRequest = ++requestCounterRef.current;

      if (!address) {
        setIsLoading(false);
        setIsVerified(false);
        setAttestation(null);
        return;
      }

      const capturedAddress = address;

      // Clear stale state immediately when address changes to prevent
      // showing previous wallet's verification status during async fetch
      setIsVerified(false);
      setAttestation(null);
      setIsLoading(true);

      try {
        const verified = await isZKPassportVerified(capturedAddress);

        // Check if this request is still current
        if (thisRequest !== requestCounterRef.current) {
          return;
        }

        setIsVerified(verified);

        if (verified) {
          const att = await getZKPassportAttestation(capturedAddress);

          // Check again after second async call
          if (thisRequest !== requestCounterRef.current) {
            return;
          }

          setAttestation(att);
        } else {
          setAttestation(null);
        }
      } catch (err) {
        // Optionally propagate errors instead of swallowing
        if (opts.throwOnError) {
          throw err;
        }
        // Log refresh failures in development for debugging
        // Production: silent fail for background refresh is acceptable UX
        if (thisRequest === requestCounterRef.current && import.meta.env.DEV) {
          console.warn("[useZKPassport] Refresh failed:", err);
        }
      } finally {
        // Only clear loading if this is still the current request
        if (thisRequest === requestCounterRef.current) {
          setIsLoading(false);
        }
      }
    },
    [address],
  );

  // Auto-refresh on mount and address change
  useEffect(() => {
    if (autoRefresh) {
      void refreshAttestation();
    }
  }, [autoRefresh, refreshAttestation]);

  // Cleanup on unmount - invalidate any pending requests
  useEffect(
    () => () => {
      requestCounterRef.current++;
      activeRequestIdRef.current = null;
      cancelActiveVerificationRequest();
    },
    [cancelActiveVerificationRequest],
  );

  /**
   * Reset all verification state and invalidate pending requests
   */
  const reset = useCallback(() => {
    // Invalidate any pending verification callbacks
    requestCounterRef.current++;
    activeRequestIdRef.current = null;
    cancelActiveVerificationRequest();

    setStatus("idle");
    setError(null);
    setVerificationUrl(null);
    verificationAddressRef.current = null;
  }, [cancelActiveVerificationRequest]);

  /**
   * Submit attestation to chain after successful verification
   */
  const submitAttestationToChain = useCallback(
    async (result: ZKPassportResult, requestId: string) => {
      // Ignore if this request was cancelled/superseded
      if (activeRequestIdRef.current !== requestId) {
        return;
      }

      setStatus("submitting");

      const substrateSigner = getSignerAndAddress();
      if (!substrateSigner) {
        setError("wallet_disconnected");
        setStatus("error");
        return;
      }

      // Verify wallet hasn't changed since verification started
      if (
        verificationAddressRef.current &&
        substrateSigner.address !== verificationAddressRef.current
      ) {
        setError("wallet_disconnected");
        setStatus("error");
        return;
      }

      try {
        // Hash the unique identifier
        const uniqueIdHash = await hashUniqueId(result.uniqueIdentifier);

        // Convert country to bytes2 format (countryToCode now throws for unknown)
        let countryBytes = "0x0000"; // No country disclosed
        if (result.country) {
          try {
            const code = countryToCode(result.country);
            countryBytes = `0x${code.charCodeAt(0).toString(16).padStart(2, "0")}${code.charCodeAt(1).toString(16).padStart(2, "0")}`;
          } catch {
            // Country not in our supported list - proceed without storing country
            countryBytes = "0x0000";
          }
        }

        // Submit to chain
        await submitZKPassportAttestation(
          substrateSigner.address,
          substrateSigner.signer,
          uniqueIdHash,
          countryBytes,
        );

        // Verify attestation was actually written
        const confirmed = await isZKPassportVerified(substrateSigner.address);
        if (!confirmed) {
          // Attestation not visible yet - try refresh with error propagation
          await refreshAttestation({ throwOnError: true });
        } else {
          await refreshAttestation();
        }

        // Final check: only set verified if request still active
        if (activeRequestIdRef.current === requestId) {
          setStatus("verified");
        }
      } catch (err) {
        // Check for specific error types
        if (err instanceof Error) {
          if (err.message.includes("UniqueIdAlreadyUsed")) {
            setError("duplicate_passport");
          } else if (err.message.includes("AlreadyVerified")) {
            // Already verified - just refresh and succeed
            await refreshAttestation();
            if (activeRequestIdRef.current === requestId) {
              setStatus("verified");
            }
            return;
          } else if (
            err.message.includes("balance") ||
            err.message.includes("Payment")
          ) {
            setError("tx_failed");
          } else {
            setError("tx_failed");
          }
        } else {
          setError("unknown");
        }
        setStatus("error");
      }
    },
    [refreshAttestation],
  );

  /**
   * Start the verification flow
   */
  const startVerification = useCallback(async () => {
    if (!address) {
      setError("wallet_disconnected");
      setStatus("error");
      return;
    }

    // Invalidate any previous request before starting new one
    requestCounterRef.current++;
    cancelActiveVerificationRequest();

    // Capture wallet address at verification start to detect mid-flow changes
    verificationAddressRef.current = address;

    // Reset state
    setError(null);
    setStatus("connecting");

    try {
      // Generate a local request ID to track this verification attempt
      const localRequestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      activeRequestIdRef.current = localRequestId;

      const { url, requestId, cancel } = await createVerificationRequest(
        {
          discloseCountry,
          scope: `localdot-verification-${address.slice(0, 10)}`,
        },
        {
          onRequestReceived: () => {
            if (activeRequestIdRef.current === localRequestId) {
              setStatus("pending");
            }
          },
          onGeneratingProof: () => {
            if (activeRequestIdRef.current === localRequestId) {
              setStatus("proving");
            }
          },
          onBridgeDisconnect: (event) => {
            if (activeRequestIdRef.current !== localRequestId) {
              return;
            }

            if (event.willReconnect) {
              scheduleBridgeTimeout(localRequestId);
              return;
            }

            cancelActiveVerificationRequest();
            setError("network_error");
            setStatus("error");
          },
          onBridgeReconnect: () => {
            if (activeRequestIdRef.current !== localRequestId) {
              return;
            }
            clearBridgeTimeout();
          },
          onResult: (result: ZKPassportResult) => {
            if (activeRequestIdRef.current !== localRequestId) {
              return;
            }

            clearBridgeTimeout();
            cancelActiveVerificationRequest();

            if (!result.verified) {
              setError("proof_invalid");
              setStatus("error");
              return;
            }

            if (!result.ageVerified) {
              setError("age_requirement");
              setStatus("error");
              return;
            }

            // Submit attestation to chain
            void submitAttestationToChain(result, localRequestId);
          },
          onReject: () => {
            if (activeRequestIdRef.current === localRequestId) {
              clearBridgeTimeout();
              cancelActiveVerificationRequest();
              setError("user_rejected");
              setStatus("error");
            }
          },
          onError: (err: Error) => {
            if (activeRequestIdRef.current !== localRequestId) {
              return;
            }

            const normalizedMessage = err.message.toLowerCase();

            // Fully terminate the request to prevent late callbacks
            cancelActiveVerificationRequest();
            activeRequestIdRef.current = null;

            if (
              normalizedMessage.includes("network") ||
              normalizedMessage.includes("heartbeat") ||
              normalizedMessage.includes("bridge") ||
              normalizedMessage.includes("websocket") ||
              normalizedMessage.includes("timeout")
            ) {
              setError("network_error");
            } else {
              setError("unknown");
            }
            setStatus("error");
          },
        },
      );

      activeSdkRequestIdRef.current = requestId;
      activeCancelRef.current = cancel;
      setVerificationUrl(url);
      setStatus("pending");
    } catch {
      cancelActiveVerificationRequest();
      setError("network_error");
      setStatus("error");
    }
  }, [
    address,
    cancelActiveVerificationRequest,
    clearBridgeTimeout,
    discloseCountry,
    scheduleBridgeTimeout,
    submitAttestationToChain,
  ]);

  /**
   * Revoke current attestation
   */
  const revokeAttestation = useCallback(async () => {
    const substrateSigner = getSignerAndAddress();
    if (!substrateSigner) {
      throw new Error("Wallet not connected or read-only.");
    }

    await revokeZKPassportAttestation(
      substrateSigner.address,
      substrateSigner.signer,
    );

    // Refresh attestation status
    await refreshAttestation();
  }, [refreshAttestation]);

  return {
    status,
    isVerified,
    attestation,
    error,
    errorMessage: error ? VERIFICATION_ERROR_MESSAGES[error] : null,
    verificationUrl,
    deepLinkUrl: verificationUrl ? getDeepLinkUrl(verificationUrl) : null,
    isMobile,
    startVerification,
    reset,
    refreshAttestation,
    revokeAttestation,
    isLoading,
  };
}
