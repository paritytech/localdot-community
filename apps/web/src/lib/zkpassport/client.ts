/**
 * zkpassport Client
 *
 * Wrapper around the zkpassport SDK for LocalDOT integration.
 */

import { ZKPassport } from "@zkpassport/sdk";

import type { VerificationOptions, ZKPassportResult } from "./types";

// SDK instance (lazy initialized)
let zkPassportInstance: ZKPassport | null = null;

/**
 * Check if dev mode is enabled
 * Production builds NEVER enable dev mode, regardless of env vars
 */
function isDevMode(): boolean {
  // Hard-disable in production builds - security critical
  if (import.meta.env.PROD) {
    return false;
  }
  return (
    import.meta.env.DEV || import.meta.env.VITE_ZKPASSPORT_DEV_MODE === "true"
  );
}

/**
 * Get or create the ZKPassport SDK instance
 * In browser, SDK auto-detects domain from window.location
 */
function getZKPassport(): ZKPassport {
  if (!zkPassportInstance) {
    // Let SDK auto-detect domain from window.location in browser
    zkPassportInstance = new ZKPassport();
  }
  return zkPassportInstance;
}

/**
 * Callbacks for verification flow
 */
export interface VerificationCallbacks {
  onRequestReceived?: () => void;
  onGeneratingProof?: () => void;
  onResult?: (result: ZKPassportResult) => void;
  onReject?: () => void;
  onError?: (error: Error) => void;
  onBridgeDisconnect?: (event: {
    code: number;
    reason: string;
    wasClean: boolean;
    willReconnect: boolean;
  }) => void;
  onBridgeReconnect?: () => void;
}

interface BridgeDisconnectEvent {
  code: number;
  reason: string;
  wasClean: boolean;
  willReconnect: boolean;
}

interface BridgeInterface {
  onConnect: (callback: (reconnection: boolean) => void) => () => void;
  onDisconnect: (
    callback: (event: BridgeDisconnectEvent) => void,
  ) => () => void;
  onFailedToConnect: (
    callback: (event: { code: number; reason: string }) => void,
  ) => () => void;
  onError: (callback: (error: string) => void) => () => void;
}

interface ZKPassportWithBridgeState {
  topicToBridge?: Record<string, BridgeInterface | undefined>;
}

/**
 * Runtime-guarded access to SDK internals
 * Returns bridge interface for a request, or null if not available.
 * Gracefully handles SDK version changes that might alter internal structure.
 */
function getBridgeForRequest(
  zkPassport: ZKPassport,
  requestId: string,
): BridgeInterface | null {
  try {
    const bridgeMap = (zkPassport as unknown as ZKPassportWithBridgeState)
      .topicToBridge;

    // Guard: Verify bridgeMap exists and is object-like
    if (!bridgeMap || typeof bridgeMap !== "object") {
      if (import.meta.env.DEV) {
        console.warn(
          "[zkpassport] SDK internals not accessible - bridge lifecycle hooks unavailable",
        );
      }
      return null;
    }

    const bridge = bridgeMap[requestId];

    // Guard: Verify bridge has expected interface
    if (
      bridge &&
      typeof bridge.onConnect === "function" &&
      typeof bridge.onDisconnect === "function"
    ) {
      return bridge;
    }

    return null;
  } catch {
    // Defensive: catch any access errors from SDK internals
    if (import.meta.env.DEV) {
      console.warn("[zkpassport] Failed to access SDK bridge internals");
    }
    return null;
  }
}

function cancelVerificationRequest(requestId: string): void {
  getZKPassport().cancelRequest(requestId);
}

/**
 * Create a verification request
 *
 * @param options - Verification options
 * @param callbacks - Callbacks for verification events
 * @returns Object with verification URL, request ID, and cancel function
 */
export async function createVerificationRequest(
  options: VerificationOptions = {},
  callbacks: VerificationCallbacks = {},
): Promise<{ url: string; requestId: string; cancel: () => void }> {
  // Track unsubscribe functions for cleanup
  const unsubscribers: (() => void)[] = [];
  const zkPassport = getZKPassport();

  // Create the request
  const devMode = isDevMode();
  const queryBuilder = await zkPassport.request({
    name: "LocalDOT",
    logo: `${window.location.origin}/logo.png`,
    purpose: "Verify your identity to build trust with other users",
    scope: options.scope ?? "localdot-verification",
    // Enable dev mode for testing with mock passports
    devMode,
  });

  // Build the query - require age >= 18
  let query = queryBuilder.gte("age", 18);

  // Optionally disclose country
  if (options.discloseCountry) {
    query = query.disclose("nationality");
  }

  // Finalize and get callbacks
  const {
    url,
    requestId,
    onRequestReceived,
    onGeneratingProof,
    onResult,
    onReject,
    onError,
  } = query.done();

  // Wire up callbacks
  if (callbacks.onRequestReceived) {
    onRequestReceived(() => {
      callbacks.onRequestReceived?.();
    });
  }

  if (callbacks.onGeneratingProof) {
    onGeneratingProof(() => {
      callbacks.onGeneratingProof?.();
    });
  }

  onResult(
    ({
      uniqueIdentifier,
      verified,
      result,
    }: {
      uniqueIdentifier: string | undefined;
      verified: boolean;
      result: {
        age?: { gte?: { result?: boolean } };
        nationality?: { disclose?: { result?: string } };
      };
    }) => {
      if (!uniqueIdentifier) {
        callbacks.onError?.(new Error("No unique identifier returned"));
        return;
      }
      callbacks.onResult?.({
        uniqueIdentifier,
        verified,
        ageVerified: result.age?.gte?.result ?? false,
        country: result.nationality?.disclose?.result,
      });
    },
  );

  onReject(() => {
    callbacks.onReject?.();
  });

  onError((errorMessage: string) => {
    callbacks.onError?.(new Error(errorMessage));
  });

  const bridge = getBridgeForRequest(zkPassport, requestId);
  if (bridge) {
    // Capture unsubscribe functions for proper cleanup
    const unsubConnect = bridge.onConnect((reconnection: boolean) => {
      if (reconnection) {
        callbacks.onBridgeReconnect?.();
      }
    });
    unsubscribers.push(unsubConnect);

    const unsubDisconnect = bridge.onDisconnect(
      (event: BridgeDisconnectEvent) => {
        callbacks.onBridgeDisconnect?.(event);
      },
    );
    unsubscribers.push(unsubDisconnect);

    const unsubFailedToConnect = bridge.onFailedToConnect(
      (event: { code: number; reason: string }) => {
        callbacks.onError?.(
          new Error(
            `Bridge connection failed${event.reason ? `: ${event.reason}` : ""}`,
          ),
        );
      },
    );
    unsubscribers.push(unsubFailedToConnect);

    const unsubError = bridge.onError((error: string) => {
      callbacks.onError?.(new Error(error));
    });
    unsubscribers.push(unsubError);
  }

  return {
    url,
    requestId,
    cancel: () => {
      // Unsubscribe all listeners before cancelling request
      unsubscribers.forEach((unsub) => unsub());
      cancelVerificationRequest(requestId);
    },
  };
}

/**
 * Check if running on mobile device
 */
export function isMobileDevice(): boolean {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

/**
 * Get the deep link URL for mobile
 */
export function getDeepLinkUrl(verificationUrl: string): string {
  return `zkpassport://verify?url=${encodeURIComponent(verificationUrl)}`;
}

/**
 * Hash a unique identifier for on-chain storage
 * Uses keccak256 to match Solidity's hashing
 */
export async function hashUniqueId(uniqueId: string): Promise<string> {
  // Use ethers keccak256 for consistency with contract
  const { keccak256, toUtf8Bytes } = await import("ethers");
  return keccak256(toUtf8Bytes(uniqueId));
}

/**
 * ISO 3166-1 alpha-2 country code mapping
 * Only includes countries we explicitly support to avoid storing incorrect data on-chain
 */
const ISO_COUNTRY_CODES: Record<string, string> = {
  "United States": "US",
  "United Kingdom": "GB",
  Canada: "CA",
  Australia: "AU",
  Germany: "DE",
  France: "FR",
  Japan: "JP",
  "South Korea": "KR",
  Singapore: "SG",
  Switzerland: "CH",
  Netherlands: "NL",
  Sweden: "SE",
  Norway: "NO",
  Denmark: "DK",
  Finland: "FI",
  Ireland: "IE",
  "New Zealand": "NZ",
  Austria: "AT",
  Belgium: "BE",
  Spain: "ES",
  Italy: "IT",
  Portugal: "PT",
  Poland: "PL",
  Brazil: "BR",
  Mexico: "MX",
  Argentina: "AR",
  India: "IN",
  China: "CN",
  "South Africa": "ZA",
  "United Arab Emirates": "AE",
  Israel: "IL",
  Thailand: "TH",
  Indonesia: "ID",
  Malaysia: "MY",
  Philippines: "PH",
  Vietnam: "VN",
  Taiwan: "TW",
  "Hong Kong": "HK",
  Greece: "GR",
  "Czech Republic": "CZ",
  Czechia: "CZ",
  Hungary: "HU",
  Romania: "RO",
  Ukraine: "UA",
  Turkey: "TR",
  Chile: "CL",
  Colombia: "CO",
  Peru: "PE",
  Egypt: "EG",
  Nigeria: "NG",
  Kenya: "KE",
  "Côte d'Ivoire": "CI",
  "Ivory Coast": "CI",
};

/**
 * Normalize country name for matching
 * Handles common variations: "united states" -> "United States"
 */
function normalizeCountryName(country: string): string {
  const trimmed = country.trim();

  // Try exact match first
  if (ISO_COUNTRY_CODES[trimmed]) {
    return trimmed;
  }

  // Try case-insensitive match
  const lowerInput = trimmed.toLowerCase();
  for (const name of Object.keys(ISO_COUNTRY_CODES)) {
    if (name.toLowerCase() === lowerInput) {
      return name; // Return canonical name
    }
  }

  // Try removing extra whitespace and matching
  const compactInput = trimmed.replace(/\s+/g, " ");
  for (const name of Object.keys(ISO_COUNTRY_CODES)) {
    if (name.toLowerCase() === compactInput.toLowerCase()) {
      return name;
    }
  }

  return trimmed; // Return as-is if no match found
}

/**
 * Convert country name to ISO 3166-1 alpha-2 code
 * Throws if country is not in our supported list to prevent incorrect on-chain data
 */
export function countryToCode(country: string): string {
  const normalized = normalizeCountryName(country);
  const code = ISO_COUNTRY_CODES[normalized];

  if (!code) {
    // Surface helpful warning in dev mode
    if (import.meta.env.DEV) {
      console.warn(
        `[zkpassport] Country "${country}" not in supported list. ` +
          `Available countries: ${Object.keys(ISO_COUNTRY_CODES).slice(0, 5).join(", ")}...`,
      );
    }
    throw new Error(
      `Unsupported country for disclosure: "${country}". Country will not be stored.`,
    );
  }

  return code;
}
