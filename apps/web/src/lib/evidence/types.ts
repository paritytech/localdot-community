/**
 * Evidence System Types
 *
 * Types for the v1.1 evidence gathering system:
 * - QR payload for trade sync
 * - Video chunks and Merkle tree
 * - Swipe commitments
 * - Session state
 */

// -----------------------------------------------------------------------------
// QR Payload (SCALE-encoded trade agreement)
// -----------------------------------------------------------------------------

export interface QRPayloadHeader {
  version: 1;
  chainId: number;
  palletVersion: number;
  hasAgent: boolean;
  tradeId: Uint8Array; // 32 bytes
}

export interface QRPayloadParties {
  seller: Uint8Array; // 32 bytes (SS58 decoded)
  buyer: Uint8Array; // 32 bytes
}

export interface QRPayloadTerms {
  tokenType: number; // 4 bytes - asset ID
  tokenAmount: bigint; // 16 bytes - u128
  fiatCurrency: string; // 3 bytes - ISO 4217 (e.g., "USD")
  fiatAmount: bigint; // 8 bytes - u64 (cents)
}

export interface QRPayloadValidity {
  createdAt: bigint; // 8 bytes - unix timestamp
  expiresAt: bigint; // 8 bytes - unix timestamp
  location: {
    lat: number; // 8 bytes - f64
    lng: number; // 8 bytes - f64
  };
  radiusKm: number; // 2 bytes - u16
}

export interface QRPayloadAgent {
  address: Uint8Array; // 32 bytes
  fee: bigint; // 8 bytes - u64 (basis points)
  signature: Uint8Array; // 64 bytes
}

export interface QRPayload {
  header: QRPayloadHeader;
  parties: QRPayloadParties;
  terms: QRPayloadTerms;
  validity: QRPayloadValidity;
  agent?: QRPayloadAgent;
  sellerSignature: Uint8Array; // 64 bytes
  buyerSignature: Uint8Array; // 64 bytes
}

// Human-readable version for UI display
export interface QRPayloadDisplay {
  tradeId: string; // hex
  seller: string; // SS58
  buyer: string; // SS58
  tokenAmount: string; // formatted with decimals
  fiatCurrency: string;
  fiatAmount: string; // formatted (e.g., "$100.00")
  expiresAt: Date;
  agent?: {
    address: string; // SS58
    feePercent: string; // e.g., "1.5%"
  };
}

// -----------------------------------------------------------------------------
// Video Chunks
// -----------------------------------------------------------------------------

export const CHUNK_DURATION_MS = 10_000; // 10 seconds
export const VIDEO_MIME_TYPE = "video/webm;codecs=vp8";

export interface VideoChunk {
  id: string; // UUID
  tradeId: string;
  sequenceNumber: number;
  blob: Blob;
  hash: Uint8Array; // 32 bytes - blake2b(blob)
  prevChunkHash: Uint8Array | null; // 32 bytes - null for first chunk
  capturedAt: number; // unix timestamp ms
  durationMs: number;
}

export interface VideoChunkMeta {
  id: string;
  sequenceNumber: number;
  hash: string; // hex
  prevChunkHash: string | null; // hex
  capturedAt: number;
  durationMs: number;
  sizeBytes: number;
}

// -----------------------------------------------------------------------------
// Merkle Tree
// -----------------------------------------------------------------------------

export interface MerkleNode {
  hash: Uint8Array; // 32 bytes
  left?: MerkleNode;
  right?: MerkleNode;
  isLeaf: boolean;
  leafIndex?: number; // Only for leaves
}

export interface MerkleTree {
  root: Uint8Array; // 32 bytes - current root hash
  leaves: Uint8Array[]; // All leaf hashes (chunk hashes)
  leafCount: number;
}

export interface MerkleProof {
  leafHash: Uint8Array;
  leafIndex: number;
  siblings: Uint8Array[]; // Sibling hashes from leaf to root
  directions: ("left" | "right")[]; // Direction of each sibling
}

// -----------------------------------------------------------------------------
// Swipe Commitments
// -----------------------------------------------------------------------------

export type SwipeNumber = 1 | 2 | 3 | 4 | 5 | 6;
export type SignerRole = "seller" | "buyer" | "agent";

export interface SwipeLocation {
  lat: number;
  lng: number;
  accuracy?: number; // meters
}

// Swipe-specific data varies by swipe number
export interface SwipeOneData {
  qrPayloadHash: Uint8Array; // 32 bytes
}

export interface SwipeTwoData {
  observedLockBlock: number;
  observedLockHash: Uint8Array; // 32 bytes - block hash
}

export interface SwipeThreeData {
  observedAmount: bigint;
  attestationType: 1; // Cash counted
}

export interface SwipeFourData {
  handoverConfirmed: true;
  jointSignatures?: {
    seller: Uint8Array;
    buyer: Uint8Array;
    agent?: Uint8Array;
  };
}

export interface SwipeFiveData {
  releaseConfirmed: true;
  releaseTxHash?: Uint8Array; // 32 bytes
}

export interface SwipeSixData {
  finalVideoMerkleRoot: Uint8Array; // 32 bytes
  videoChunkCount: number;
}

export type SwipeData =
  | SwipeOneData
  | SwipeTwoData
  | SwipeThreeData
  | SwipeFourData
  | SwipeFiveData
  | SwipeSixData;

export interface SwipeCommitment {
  tradeId: Uint8Array; // 32 bytes
  swipeNumber: SwipeNumber;
  signerRole: SignerRole;
  timestamp: number; // unix timestamp
  location: SwipeLocation;
  videoHashSoFar: Uint8Array; // 32 bytes - current Merkle root
  prevCommitmentHash: Uint8Array; // 32 bytes - chain to previous (zero for first)
  swipeData: SwipeData;
  signature: Uint8Array; // 64 bytes
}

// For on-chain submission (matches Solidity struct)
export interface SwipeCommitmentOnChain {
  swipeNumber: number;
  videoHashSoFar: `0x${string}`;
  prevCommitmentHash: `0x${string}`;
  swipeDataHash: `0x${string}`;
  timestamp: bigint;
  locationLat: bigint; // Fixed-point (lat * 1e7)
  locationLng: bigint; // Fixed-point (lng * 1e7)
}

// -----------------------------------------------------------------------------
// Evidence Session State
// -----------------------------------------------------------------------------

export type SessionPhase =
  | "idle" // Not started
  | "qr_sync" // Showing/scanning QR
  | "recording" // Video recording, awaiting swipes
  | "swipe_pending" // Waiting for swipe confirmation
  | "swipe_submitting" // Submitting to chain
  | "waiting_counterparty" // Waiting for other party's swipe
  | "complete" // All 6 swipes done
  | "error"; // Something went wrong

export interface SwipeStatus {
  swipeNumber: SwipeNumber;
  required: SignerRole[]; // Who needs to swipe
  completed: SignerRole[]; // Who has swiped
  myCommitment?: SwipeCommitment;
  counterpartyCommitment?: SwipeCommitment;
  agentCommitment?: SwipeCommitment;
}

export interface EvidenceSession {
  tradeId: string;
  qrPayload?: QRPayload;
  phase: SessionPhase;
  currentSwipe: SwipeNumber;
  swipeStatuses: Record<SwipeNumber, SwipeStatus>;
  merkleTree: MerkleTree;
  chunkCount: number;
  isRecording: boolean;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

// -----------------------------------------------------------------------------
// Storage Keys
// -----------------------------------------------------------------------------

export const EVIDENCE_DB_NAME = "localdot-evidence";
export const EVIDENCE_DB_VERSION = 1;

export const STORE_NAMES = {
  chunks: "video-chunks",
  sessions: "sessions",
  commitments: "commitments",
} as const;

// -----------------------------------------------------------------------------
// Mock Mode
// -----------------------------------------------------------------------------

export interface MockConfig {
  useRealCamera: boolean;
  useRealLocation: boolean;
  useRealChain: boolean;
  useRealStorage: boolean;
  mockChunkIntervalMs: number; // How often to generate fake chunks
  mockLocation: SwipeLocation;
}

export const DEFAULT_MOCK_CONFIG: MockConfig = {
  useRealCamera: false,
  useRealLocation: false,
  useRealChain: false,
  useRealStorage: true, // IndexedDB works in dev
  mockChunkIntervalMs: 2000, // Faster for testing
  mockLocation: { lat: 37.7749, lng: -122.4194 }, // San Francisco
};
