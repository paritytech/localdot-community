/**
 * QR Payload Encoding/Decoding
 *
 * Binary format for trade agreement QR codes.
 * Uses a simple binary structure for prototype compatibility.
 */

import { blake2b } from "@noble/hashes/blake2b";

import { randomBytes } from "../crypto";
import { uint8ArrayToHex } from "./merkle";
import type { QRPayload, QRPayloadDisplay } from "./types";

// Magic bytes for format identification
export const QR_MAGIC = new Uint8Array([0x4c, 0x44, 0x4f, 0x54]); // "LDOT"
export const QR_VERSION = 1;

/**
 * Encode QR payload to binary format
 *
 * Format:
 * - 4 bytes: magic ("LDOT")
 * - 1 byte: version
 * - 4 bytes: chainId (u32 LE)
 * - 2 bytes: palletVersion (u16 LE)
 * - 1 byte: flags (bit 0 = hasAgent)
 * - 32 bytes: tradeId
 * - 32 bytes: seller
 * - 32 bytes: buyer
 * - 4 bytes: tokenType (u32 LE)
 * - 16 bytes: tokenAmount (u128 LE)
 * - 3 bytes: fiatCurrency (ASCII)
 * - 8 bytes: fiatAmount (u64 LE)
 * - 8 bytes: createdAt (u64 LE)
 * - 8 bytes: expiresAt (u64 LE)
 * - 8 bytes: lat (f64 LE)
 * - 8 bytes: lng (f64 LE)
 * - 2 bytes: radiusKm (u16 LE)
 * - If hasAgent:
 *   - 32 bytes: agent address
 *   - 8 bytes: agent fee (u64 LE)
 *   - 64 bytes: agent signature
 * - 64 bytes: seller signature
 * - 64 bytes: buyer signature
 *
 * Total: 301 bytes (no agent) or 405 bytes (with agent)
 */
export function encodeQRPayload(payload: QRPayload): Uint8Array {
  const hasAgent = payload.agent !== undefined;
  // Base: 4+1+4+2+1+32+32+32+4+16+3+8+8+8+8+8+2+64+64 = 301
  // Agent: +32+8+64 = +104
  const size = hasAgent ? 405 : 301;
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  let offset = 0;

  // Magic
  bytes.set(QR_MAGIC, offset);
  offset += 4;

  // Version
  view.setUint8(offset, QR_VERSION);
  offset += 1;

  // ChainId
  view.setUint32(offset, payload.header.chainId, true);
  offset += 4;

  // PalletVersion
  view.setUint16(offset, payload.header.palletVersion, true);
  offset += 2;

  // Flags
  view.setUint8(offset, hasAgent ? 1 : 0);
  offset += 1;

  // TradeId
  bytes.set(payload.header.tradeId, offset);
  offset += 32;

  // Seller
  bytes.set(payload.parties.seller, offset);
  offset += 32;

  // Buyer
  bytes.set(payload.parties.buyer, offset);
  offset += 32;

  // TokenType
  view.setUint32(offset, payload.terms.tokenType, true);
  offset += 4;

  // TokenAmount (u128 as two u64s)
  const tokenAmountLow =
    payload.terms.tokenAmount & BigInt("0xFFFFFFFFFFFFFFFF");
  const tokenAmountHigh = payload.terms.tokenAmount >> BigInt(64);
  view.setBigUint64(offset, tokenAmountLow, true);
  view.setBigUint64(offset + 8, tokenAmountHigh, true);
  offset += 16;

  // FiatCurrency (3 ASCII bytes)
  const currencyBytes = new TextEncoder().encode(
    payload.terms.fiatCurrency.slice(0, 3).padEnd(3, " "),
  );
  bytes.set(currencyBytes, offset);
  offset += 3;

  // FiatAmount
  view.setBigUint64(offset, payload.terms.fiatAmount, true);
  offset += 8;

  // CreatedAt
  view.setBigUint64(offset, payload.validity.createdAt, true);
  offset += 8;

  // ExpiresAt
  view.setBigUint64(offset, payload.validity.expiresAt, true);
  offset += 8;

  // Location
  view.setFloat64(offset, payload.validity.location.lat, true);
  offset += 8;
  view.setFloat64(offset, payload.validity.location.lng, true);
  offset += 8;

  // RadiusKm
  view.setUint16(offset, payload.validity.radiusKm, true);
  offset += 2;

  // Agent (if present)
  if (payload.agent) {
    bytes.set(payload.agent.address, offset);
    offset += 32;
    view.setBigUint64(offset, payload.agent.fee, true);
    offset += 8;
    bytes.set(payload.agent.signature, offset);
    offset += 64;
  }

  // Seller signature
  bytes.set(payload.sellerSignature, offset);
  offset += 64;

  // Buyer signature
  bytes.set(payload.buyerSignature, offset);

  return bytes;
}

/**
 * Decode QR payload from binary format
 * MEDIUM FIX: Validate input length before parsing
 */
export function decodeQRPayload(bytes: Uint8Array): QRPayload {
  // Minimum size is 301 bytes (no agent)
  const MIN_SIZE = 301;
  const WITH_AGENT_SIZE = 405;

  if (bytes.length < MIN_SIZE) {
    throw new Error(
      `Invalid QR payload: expected at least ${MIN_SIZE} bytes, got ${bytes.length}`,
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  // Verify magic
  for (let i = 0; i < 4; i++) {
    if (bytes[offset + i] !== QR_MAGIC[i]) {
      throw new Error("Invalid QR magic bytes");
    }
  }
  offset += 4;

  // Version
  const version = view.getUint8(offset);
  if (version !== QR_VERSION) {
    throw new Error(`Unsupported QR version: ${version}`);
  }
  offset += 1;

  // ChainId
  const chainId = view.getUint32(offset, true);
  offset += 4;

  // PalletVersion
  const palletVersion = view.getUint16(offset, true);
  offset += 2;

  // Flags
  const flags = view.getUint8(offset);
  const hasAgent = (flags & 1) !== 0;
  offset += 1;

  // Validate size now that we know hasAgent
  const expectedSize = hasAgent ? WITH_AGENT_SIZE : MIN_SIZE;
  if (bytes.length < expectedSize) {
    throw new Error(
      `Invalid QR payload: expected ${expectedSize} bytes for ${hasAgent ? "agent" : "no-agent"} mode, got ${bytes.length}`,
    );
  }

  // TradeId
  const tradeId = bytes.slice(offset, offset + 32);
  offset += 32;

  // Seller
  const seller = bytes.slice(offset, offset + 32);
  offset += 32;

  // Buyer
  const buyer = bytes.slice(offset, offset + 32);
  offset += 32;

  // TokenType
  const tokenType = view.getUint32(offset, true);
  offset += 4;

  // TokenAmount
  const tokenAmountLow = view.getBigUint64(offset, true);
  const tokenAmountHigh = view.getBigUint64(offset + 8, true);
  const tokenAmount = tokenAmountLow | (tokenAmountHigh << BigInt(64));
  offset += 16;

  // FiatCurrency
  const fiatCurrency = new TextDecoder()
    .decode(bytes.slice(offset, offset + 3))
    .trim();
  offset += 3;

  // FiatAmount
  const fiatAmount = view.getBigUint64(offset, true);
  offset += 8;

  // CreatedAt
  const createdAt = view.getBigUint64(offset, true);
  offset += 8;

  // ExpiresAt
  const expiresAt = view.getBigUint64(offset, true);
  offset += 8;

  // Location
  const lat = view.getFloat64(offset, true);
  offset += 8;
  const lng = view.getFloat64(offset, true);
  offset += 8;

  // RadiusKm
  const radiusKm = view.getUint16(offset, true);
  offset += 2;

  // Agent (if present)
  let agent;
  if (hasAgent) {
    const agentAddress = bytes.slice(offset, offset + 32);
    offset += 32;
    const agentFee = view.getBigUint64(offset, true);
    offset += 8;
    const agentSignature = bytes.slice(offset, offset + 64);
    offset += 64;
    agent = {
      address: agentAddress,
      fee: agentFee,
      signature: agentSignature,
    };
  }

  // Seller signature
  const sellerSignature = bytes.slice(offset, offset + 64);
  offset += 64;

  // Buyer signature
  const buyerSignature = bytes.slice(offset, offset + 64);

  return {
    header: {
      version: 1,
      chainId,
      palletVersion,
      hasAgent,
      tradeId,
    },
    parties: {
      seller,
      buyer,
    },
    terms: {
      tokenType,
      tokenAmount,
      fiatCurrency,
      fiatAmount,
    },
    validity: {
      createdAt,
      expiresAt,
      location: { lat, lng },
      radiusKm,
    },
    agent,
    sellerSignature,
    buyerSignature,
  };
}

/**
 * Hash the signing payload (everything except signatures)
 */
export function hashSigningPayload(
  payload: QRPayload,
  includeAgentSig: boolean = false,
  includeSellerSig: boolean = false,
): Uint8Array {
  // Create a copy with zeroed signatures to hash
  const copy: QRPayload = {
    ...payload,
    sellerSignature: includeSellerSig
      ? payload.sellerSignature
      : new Uint8Array(64),
    buyerSignature: new Uint8Array(64),
    agent: payload.agent
      ? {
          ...payload.agent,
          signature: includeAgentSig
            ? payload.agent.signature
            : new Uint8Array(64),
        }
      : undefined,
  };

  const encoded = encodeQRPayload(copy);
  return blake2b(encoded, { dkLen: 32 });
}

/**
 * Get the payload hash for the full signed QR
 */
export function getQRPayloadHash(payload: QRPayload): Uint8Array {
  const encoded = encodeQRPayload(payload);
  return blake2b(encoded, { dkLen: 32 });
}

/**
 * Encode payload to base64url for QR code
 */
export function encodeForQR(payload: QRPayload): string {
  const bytes = encodeQRPayload(payload);
  return base64urlEncode(bytes);
}

/**
 * Decode payload from QR code string
 */
export function decodeFromQR(qrData: string): QRPayload {
  const bytes = base64urlDecode(qrData);
  return decodeQRPayload(bytes);
}

/**
 * Convert QR payload to human-readable display format
 */
export function toDisplayFormat(
  payload: QRPayload,
  formatAddress: (bytes: Uint8Array) => string,
  formatAmount: (amount: bigint, decimals: number) => string,
  tokenDecimals: number = 18,
): QRPayloadDisplay {
  const fiatAmountNum = Number(payload.terms.fiatAmount) / 100;
  const fiatFormatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: payload.terms.fiatCurrency,
  }).format(fiatAmountNum);

  return {
    tradeId: uint8ArrayToHex(payload.header.tradeId),
    seller: formatAddress(payload.parties.seller),
    buyer: formatAddress(payload.parties.buyer),
    tokenAmount: formatAmount(payload.terms.tokenAmount, tokenDecimals),
    fiatCurrency: payload.terms.fiatCurrency,
    fiatAmount: fiatFormatted,
    expiresAt: new Date(Number(payload.validity.expiresAt) * 1000),
    agent: payload.agent
      ? {
          address: formatAddress(payload.agent.address),
          feePercent: `${Number(payload.agent.fee) / 100}%`,
        }
      : undefined,
  };
}

/**
 * Validate QR payload structure
 */
export function validateQRPayload(payload: QRPayload): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Check required fields
  if (payload.header.tradeId.length !== 32) {
    errors.push("Invalid tradeId length");
  }
  if (payload.parties.seller.length !== 32) {
    errors.push("Invalid seller address length");
  }
  if (payload.parties.buyer.length !== 32) {
    errors.push("Invalid buyer address length");
  }
  if (payload.terms.tokenAmount <= 0n) {
    errors.push("Token amount must be positive");
  }
  if (payload.terms.fiatAmount <= 0n) {
    errors.push("Fiat amount must be positive");
  }
  if (payload.terms.fiatCurrency.length !== 3) {
    errors.push("Fiat currency must be 3 characters");
  }

  // Check expiry
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (payload.validity.expiresAt <= now) {
    errors.push("QR payload has expired");
  }

  // Check signatures are present
  if (payload.sellerSignature.length !== 64) {
    errors.push("Invalid seller signature length");
  }
  if (payload.buyerSignature.length !== 64) {
    errors.push("Invalid buyer signature length");
  }

  // MEDIUM FIX: Check hasAgent flag consistency with agent object
  if (payload.header.hasAgent && !payload.agent) {
    errors.push("hasAgent flag is true but no agent object provided");
  }
  if (!payload.header.hasAgent && payload.agent) {
    errors.push("hasAgent flag is false but agent object is present");
  }

  // Check agent fields if present
  if (payload.agent) {
    if (payload.agent.address.length !== 32) {
      errors.push("Invalid agent address length");
    }
    if (payload.agent.signature.length !== 64) {
      errors.push("Invalid agent signature length");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// -----------------------------------------------------------------------------
// Base64url utilities
// -----------------------------------------------------------------------------

const BASE64URL_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function base64urlEncode(bytes: Uint8Array): string {
  let result = "";
  const len = bytes.length;

  for (let i = 0; i < len; i += 3) {
    const b1 = bytes[i] ?? 0;
    const b2 = bytes[i + 1] ?? 0;
    const b3 = bytes[i + 2] ?? 0;

    result += BASE64URL_CHARS[b1 >> 2];
    result += BASE64URL_CHARS[((b1 & 0x03) << 4) | (b2 >> 4)];

    if (i + 1 < len) {
      result += BASE64URL_CHARS[((b2 & 0x0f) << 2) | (b3 >> 6)];
    }

    if (i + 2 < len) {
      result += BASE64URL_CHARS[b3 & 0x3f];
    }
  }

  return result;
}

/**
 * Decode base64url string to bytes
 * MEDIUM FIX: Throw on invalid characters instead of silently mapping to 0
 */
export function base64urlDecode(str: string): Uint8Array {
  const lookup = new Map<string, number>();
  for (let i = 0; i < BASE64URL_CHARS.length; i++) {
    const char = BASE64URL_CHARS[i];
    if (char) {
      lookup.set(char, i);
    }
  }

  // Helper to get char value or throw
  const getCharValue = (char: string | undefined, position: number): number => {
    if (char === undefined) {
      throw new Error(
        `Unexpected end of base64url string at position ${position}`,
      );
    }
    const value = lookup.get(char);
    if (value === undefined) {
      throw new Error(
        `Invalid base64url character '${char}' at position ${position}`,
      );
    }
    return value;
  };

  const bytes: number[] = [];
  const len = str.length;

  for (let i = 0; i < len; i += 4) {
    const c1 = getCharValue(str[i], i);
    const c2 = getCharValue(str[i + 1], i + 1);
    bytes.push((c1 << 2) | (c2 >> 4));

    if (i + 2 < len) {
      const c3 = getCharValue(str[i + 2], i + 2);
      bytes.push(((c2 & 0x0f) << 4) | (c3 >> 2));

      if (i + 3 < len) {
        const c4 = getCharValue(str[i + 3], i + 3);
        bytes.push(((c3 & 0x03) << 6) | c4);
      }
    }
  }

  return new Uint8Array(bytes);
}

// -----------------------------------------------------------------------------
// Test/Mock helpers
// -----------------------------------------------------------------------------

/**
 * Create a mock QR payload for testing
 * MEDIUM FIX: Create agent object when hasAgent is true
 */
export function createMockQRPayload(
  overrides?: Partial<{
    tradeId: Uint8Array;
    seller: Uint8Array;
    buyer: Uint8Array;
    tokenAmount: bigint;
    fiatAmount: bigint;
    hasAgent: boolean;
  }>,
): QRPayload {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const hasAgent = overrides?.hasAgent ?? false;

  return {
    header: {
      version: 1,
      chainId: 420420417, // Paseo Asset Hub
      palletVersion: 1,
      hasAgent,
      tradeId: overrides?.tradeId ?? randomBytes(32),
    },
    parties: {
      seller: overrides?.seller ?? randomBytes(32),
      buyer: overrides?.buyer ?? randomBytes(32),
    },
    terms: {
      tokenType: 1, // HOLLAR
      tokenAmount: overrides?.tokenAmount ?? BigInt("100000000000000000000"), // 100 tokens
      fiatCurrency: "USD",
      fiatAmount: overrides?.fiatAmount ?? BigInt(10000), // $100.00
    },
    validity: {
      createdAt: now,
      expiresAt: now + BigInt(3600), // 1 hour
      location: { lat: 37.7749, lng: -122.4194 },
      radiusKm: 10,
    },
    // Create agent object if hasAgent is true
    agent: hasAgent
      ? {
          address: randomBytes(32),
          fee: BigInt(100), // 1% fee
          signature: randomBytes(64),
        }
      : undefined,
    sellerSignature: randomBytes(64),
    buyerSignature: randomBytes(64),
  };
}
