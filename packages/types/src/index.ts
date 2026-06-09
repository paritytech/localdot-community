/**
 * Shared TypeScript types for LocalDOT P2P marketplace
 */

// Trade States (matches P2PMarket.sol TradeState enum)
export enum TradeState {
  LOCKED = 0,
  RELEASED = 1,
  REFUNDED = 2,
  CANCELLED = 3,
}

// Trade structure (matches P2PMarket.sol Trade struct)
export interface Trade {
  id: bigint;
  offerId: bigint;
  locker: string; // Deposited native tokens
  counterparty: string; // Receives tokens after confirmation
  agent: string; // Optional witness (zero address for direct)
  amount: bigint; // Locked native token amount
  state: TradeState;
  lockerConfirmed: boolean;
  counterpartyConfirmed: boolean;
  agentConfirmed: boolean;
  lockerCancelRequested: boolean;
  counterpartyCancelRequested: boolean;
  lockedAt: bigint;
}

// Frontend-friendly Trade (with string amounts for display)
export interface TradeDisplay {
  id: string;
  offerId: string;
  locker: string;
  counterparty: string;
  agent: string;
  amount: string;
  state: TradeState;
  lockerConfirmed: boolean;
  counterpartyConfirmed: boolean;
  agentConfirmed: boolean;
  lockerCancelRequested: boolean;
  counterpartyCancelRequested: boolean;
  lockedAt: number;
}

// Offer types — seller posts an offer to sell tokens for cash, buyer the inverse
export type OfferRole = "seller" | "buyer";

/** Metadata JSON stored on Bulletin Chain (location + availability) */
export interface OfferMetadata {
  location: {
    lat: number;
    lng: number;
    radius: number; // km
    city: string;
    country: string;
  };
  availability: {
    schedule: Record<string, { open: string; close: string }>;
    timezone: string;
  };
}

export interface Offer {
  id: string;
  alias: string;
  role: OfferRole;
  city: string;
  country: string;
  lat: number;
  lon: number;
  radiusKm: number;
  asset: string;
  fee: string | null; // null for buyers
  minAmount: string;
  maxAmount: string;
  availability: {
    days: string[];
    hours: string;
    timezone: string;
  };
  rating?: number;
  completedOrders?: number;
  successRate?: string;
  memberSince?: string;
  publishedAt: number;
  expiresAt: number;
}

// Chat message
export interface ChatMessage {
  id: string;
  context: string; // Offer alias
  sender: string; // Wallet address
  message: string;
  timestamp: number;
  signature: string;
}

// Protocol constants
export const CONFIRMATION_TIMEOUT = 24 * 60 * 60; // 24 hours in seconds
export const OFFER_TTL = 14 * 24 * 60 * 60; // 14 days in seconds
export const MIN_TRADE_AMOUNT = "1"; // 1 token
