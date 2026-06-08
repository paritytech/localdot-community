/**
 * Evidence System Library
 *
 * Exports all evidence-related utilities.
 */

// Types
export * from "./types";

// Merkle tree utilities
export {
  hashLeaf,
  hashNodes,
  hashChunk,
  createEmptyTree,
  computeRoot,
  addLeaf,
  verifyExtension,
  generateProof,
  verifyProof,
  serializeTree,
  deserializeTree,
  uint8ArrayEquals,
  uint8ArrayToHex,
  hexToUint8Array,
  concatUint8Arrays,
} from "./merkle";

// QR encoding/decoding
export {
  QR_MAGIC,
  QR_VERSION,
  encodeQRPayload,
  decodeQRPayload,
  hashSigningPayload,
  getQRPayloadHash,
  encodeForQR,
  decodeFromQR,
  toDisplayFormat,
  validateQRPayload,
  base64urlEncode,
  base64urlDecode,
  createMockQRPayload,
} from "./qr";
