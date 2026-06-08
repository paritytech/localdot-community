export type OfferRole = "seller" | "buyer";

/** Metadata JSON stored on Bulletin Chain (location + availability).
 *  Both fields are optional — direct-only listings omit `location`, and
 *  older payloads may lack `availability`. Always defend against absence. */
export interface OfferMetadata {
  location?: {
    lat: number;
    lng: number;
    radius: number; // km
    city: string;
    country: string;
  };
  availability?: {
    schedule: Record<string, { open: string; close: string }>;
    timezone: string;
  };
}

/**
 * Frontend representation of an offer
 * Maps to P2PMarket contract's Offer struct
 *
 * Metadata JSON structure from Bulletin Chain (all optional):
 * {
 *   location: { lat, lng, radius, city, country },
 *   availability: { days, hours, timezone }
 * }
 */
export interface Offer {
  id: string; // Contract offerId
  alias: string; // Display name (derived from owner address)
  owner: string; // Full owner address
  role: OfferRole; // 'seller' = Selling, 'buyer' = Buying
  fiatCurrency: string; // V1: "USD" only
  fee: string | null; // Flat fee (e.g., "$12")
  minAmount: string; // Min trade amount
  maxAmount: string; // Max trade amount (amountAvailable)
  metadataCID: string; // Bulletin Chain CID → JSON with location + availability
  city: string; // Parsed from metadataCID JSON
  country: string; // Parsed from metadataCID JSON
  lat?: number; // Parsed from metadataCID JSON (optional)
  lon?: number; // Parsed from metadataCID JSON (optional)
  radiusKm?: number; // Parsed from metadataCID JSON (optional)
  availability?: {
    // Parsed from metadataCID JSON (optional)
    days: string[];
    hours: string;
    timezone: string;
  };
  rating?: number; // Temporary: hardcoded 4.0 until reputation system
  createdAt: string; // Human-readable date
  agentAddresses: string[]; // Agents where this offer is available
}
