const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";
const NOMINATIM_USER_AGENT =
  "LocalDOT P2P Market (https://github.com/paritytech/localdot-community)";

interface NominatimAddress {
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  country?: string;
}

interface NominatimResult {
  address: NominatimAddress;
}

/**
 * Haversine formula: distance between two points on Earth in km.
 * Used for offer distance calculation and recommendation scoring.
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export interface ReverseGeocodeResult {
  city: string;
  country: string;
}

/**
 * Reverse geocode lat/lon via Nominatim to get city and country.
 * Returns null if fetch fails or city/country cannot be determined.
 */
export async function reverseGeocode(
  lat: number,
  lon: number,
): Promise<ReverseGeocodeResult | null> {
  const url = `${NOMINATIM_URL}?lat=${lat}&lon=${lon}&format=json&addressdetails=1`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
      const response = await fetch(url, {
        headers: { "User-Agent": NOMINATIM_USER_AGENT },
      });
      if (!response.ok) {
        console.warn(
          `[reverseGeocode] HTTP ${response.status} (attempt ${attempt + 1})`,
        );
        continue;
      }
      const data: NominatimResult = await response.json();

      const city =
        data.address?.city ||
        data.address?.town ||
        data.address?.village ||
        data.address?.municipality ||
        "";
      const country = data.address?.country || "";

      if (!city && !country) return null;

      return { city: city || "Unknown", country };
    } catch (err) {
      console.warn(`[reverseGeocode] Failed (attempt ${attempt + 1}):`, err);
    }
  }
  return null;
}

/**
 * Offset a lat/lon by a random distance (meters) in a random direction.
 * Used for privacy — generates approximate location near the real one.
 */
export function randomOffset(
  lat: number,
  lon: number,
  maxMeters: number = 500,
): { lat: number; lon: number } {
  const angle = Math.random() * 2 * Math.PI;
  const distance = Math.random() * maxMeters;
  // 1 degree latitude ≈ 111,320 meters
  const dLat = (distance * Math.cos(angle)) / 111320;
  // 1 degree longitude varies by latitude
  const dLon =
    (distance * Math.sin(angle)) / (111320 * Math.cos((lat * Math.PI) / 180));
  return { lat: lat + dLat, lon: lon + dLon };
}
