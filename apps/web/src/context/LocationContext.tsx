/**
 * LocationContext — global user location state.
 *
 * Auto-detects on app startup via geolocation, persists in localStorage.
 * Used across all pages for distance calculations, sorting, filtering.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { reverseGeocode } from "../lib/geo";
import { getGeolocation } from "../lib/host";

export interface UserLocation {
  lat: number;
  lon: number;
  city: string;
  country: string;
}

interface LocationContextValue {
  location: UserLocation | null;
  loading: boolean;
  error: string | null;
  /** Update location manually */
  setLocation: (loc: UserLocation) => void;
  /** Re-detect from GPS */
  refreshLocation: () => Promise<void>;
}

const LocationCtx = createContext<LocationContextValue | null>(null);

const STORAGE_KEY = "localdot_user_location";

function loadFromStorage(): UserLocation | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserLocation;
    if (parsed.lat && parsed.lon && parsed.city && parsed.city !== "Unknown")
      return parsed;
    return null;
  } catch {
    return null;
  }
}

function saveToStorage(loc: UserLocation): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
}

export function LocationProvider({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  const [location, setLocationState] = useState<UserLocation | null>(
    loadFromStorage,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setLocation = useCallback((loc: UserLocation) => {
    setLocationState(loc);
    saveToStorage(loc);
    setError(null);
  }, []);

  const refreshLocation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pos = await getGeolocation({ timeout: 10000 });
      const lat = pos.coords.latitude;
      const lon = pos.coords.longitude;
      const geo = await reverseGeocode(lat, lon);
      if (geo?.city) {
        setLocation({ lat, lon, city: geo.city, country: geo.country });
      }
      // If reverse geocode fails, don't save — let the modal prompt for city
    } catch {
      // GPS failed — user will set location via modal
    } finally {
      setLoading(false);
    }
  }, [setLocation]);

  // Auto-detect on mount if no saved location
  useEffect(() => {
    if (!location) {
      void refreshLocation();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <LocationCtx.Provider
      value={{ location, loading, error, setLocation, refreshLocation }}
    >
      {children}
    </LocationCtx.Provider>
  );
}

export function useLocationContext(): LocationContextValue {
  const ctx = useContext(LocationCtx);
  if (!ctx)
    throw new Error("useLocationContext must be within LocationProvider");
  return ctx;
}
