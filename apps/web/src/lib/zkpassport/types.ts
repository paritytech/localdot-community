/**
 * zkpassport Types
 *
 * Types for zkpassport integration - zero-knowledge passport verification.
 */

/**
 * Verification status states
 */
export type VerificationStatus =
  | "idle"
  | "connecting"
  | "pending"
  | "proving"
  | "submitting"
  | "verified"
  | "error";

// Note: ZKPassportAttestation type is defined in lib/host/contract.ts
// Import from there for consistency with on-chain data.

/**
 * Result from zkpassport SDK verification
 */
export interface ZKPassportResult {
  /** Unique identifier for this passport (same passport = same ID) */
  uniqueIdentifier: string;
  /** Whether all proofs verified successfully */
  verified: boolean;
  /** Age verification result */
  ageVerified: boolean;
  /** Disclosed country (if requested) */
  country?: string;
}

/**
 * Verification request options
 */
export interface VerificationOptions {
  /** Whether to request country disclosure */
  discloseCountry?: boolean;
  /** Custom scope for the verification */
  scope?: string;
}

/**
 * Error types for verification flow
 */
export type VerificationError =
  | "duplicate_passport"
  | "proof_invalid"
  | "age_requirement"
  | "user_rejected"
  | "tx_failed"
  | "network_error"
  | "wallet_disconnected"
  | "unknown";

/**
 * Structured error with type and message
 */
export interface VerificationErrorInfo {
  type: VerificationError;
  message: string;
}

/**
 * Error messages for each error type
 */
export const VERIFICATION_ERROR_MESSAGES: Record<VerificationError, string> = {
  duplicate_passport: "This passport is already linked to another wallet",
  proof_invalid: "Verification failed. Please try again.",
  age_requirement: "You must be 18 or older to verify",
  user_rejected: "Verification cancelled",
  tx_failed: "Failed to submit attestation. Please try again.",
  network_error: "Connection error. Check your network.",
  wallet_disconnected: "Wallet disconnected. Please reconnect and try again.",
  unknown: "An unexpected error occurred. Please try again.",
};
