import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";

// ICONS

const createMarkerIcon = (fillColor: string, strokeColor: string) =>
  L.icon({
    iconUrl:
      "data:image/svg+xml;base64," +
      btoa(`
    <svg width="25" height="41" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
      <path fill="${fillColor}" stroke="${strokeColor}" stroke-width="2" d="M12.5 0C5.596 0 0 5.596 0 12.5c0 9.375 12.5 28.5 12.5 28.5S25 21.875 25 12.5C25 5.596 19.404 0 12.5 0zm0 17.5c-2.761 0-5-2.239-5-5s2.239-5 5-5 5 2.239 5 5-2.239 5-5 5z"/>
    </svg>
  `),
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  });

export const markerIcons = {
  amber: createMarkerIcon("#f59e0b", "#d97706"),
  blue: createMarkerIcon("#3b82f6", "#2563eb"),
  green: createMarkerIcon("#22c55e", "#16a34a"),
  red: createMarkerIcon("#ef4444", "#dc2626"),
};

// REUSABLE UI COMPONENTS

/** Reusable loading spinner */
export function Spinner({
  size = "md",
  color = "amber",
}: {
  size?: "sm" | "md";
  color?: "amber" | "white" | "stone";
}): JSX.Element {
  const sizeClasses = size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5";
  const colorClasses = {
    amber: "border-amber-500/30 border-t-amber-500",
    white: "border-white/30 border-t-white",
    stone: "border-stone-400/30 border-t-stone-400",
  }[color];

  return (
    <div
      className={`${sizeClasses} border-2 ${colorClasses} rounded-full animate-spin`}
    />
  );
}

/** Reusable error message */
export function ErrorMessage({
  message,
  size = "md",
}: {
  message: string;
  size?: "sm" | "md";
}): JSX.Element {
  const sizeClasses = size === "sm" ? "px-3 py-2 text-xs" : "px-4 py-3 text-sm";
  return (
    <div
      className={`rounded-lg bg-red-950/50 border border-red-800 text-red-200 ${sizeClasses}`}
    >
      {message}
    </div>
  );
}

/** Location icon (crosshairs) */
export function LocationIcon({
  size = 20,
  color = "currentColor",
}: {
  size?: number;
  color?: string;
}): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="3" fill={color} />
    </svg>
  );
}

/** Map pin icon */
export function MapPinIcon({
  size = 20,
  color = "currentColor",
}: {
  size?: number;
  color?: string;
}): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

/** Back arrow icon */
export function BackIcon({ size = 16 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

/** Crosshairs icon (for centering) */
export function CrosshairsIcon({ size = 14 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="3" />
      <line x1="12" y1="2" x2="12" y2="6" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line x1="2" y1="12" x2="6" y2="12" />
      <line x1="18" y1="12" x2="22" y2="12" />
    </svg>
  );
}

/** Map help overlay - shows hint text over the map */
export function MapHelpOverlay({ text }: { text: string }): JSX.Element {
  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      <div className="bg-stone-900/90 border border-stone-700 rounded-lg px-4 py-3 max-w-xs text-center">
        <p className="text-xs text-stone-300">{text}</p>
      </div>
    </div>
  );
}

/** Map loading overlay */
export function MapLoadingOverlay({
  text = "Finding location...",
}: {
  text?: string;
}): JSX.Element {
  return (
    <div className="absolute inset-0 bg-stone-900/50 flex items-center justify-center rounded-lg">
      <div className="flex items-center gap-2 bg-stone-800 border border-stone-700 rounded-lg px-4 py-2">
        <Spinner size="sm" color="amber" />
        <span className="text-sm text-stone-300">{text}</span>
      </div>
    </div>
  );
}

/** Location display card */
export function LocationCard({
  city,
  country,
  lat,
  lon,
  label = "Location",
  onChangeClick,
}: {
  city: string;
  country: string;
  lat: number;
  lon: number;
  label?: string;
  onChangeClick?: () => void;
}): JSX.Element {
  return (
    <div className="rounded-lg bg-stone-800/50 border border-stone-700 px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-stone-400">{label}:</span>
        {onChangeClick && (
          <button
            type="button"
            onClick={onChangeClick}
            className="text-xs text-amber-400 hover:text-amber-300 underline"
          >
            Change
          </button>
        )}
      </div>
      <div className="text-base text-stone-100 font-medium">
        {city}, {country}
      </div>
      <div className="text-xs text-stone-500 mono">
        {lat.toFixed(4)}, {lon.toFixed(4)}
      </div>
    </div>
  );
}

// TYPES
export interface MapLocation {
  lat: number;
  lon: number;
}

interface BaseMapProps {
  /** Initial center of the map */
  center?: [number, number];
  /** Initial zoom level */
  zoom?: number;
  /** Height of the map container */
  height?: string;
  /** Selected location marker */
  selectedLocation?: MapLocation | null;
  /** Marker icon variant */
  markerVariant?: "amber" | "blue" | "green" | "red";
  /** Radius circle in kilometers (optional) */
  radiusKm?: number;
  /** Circle color */
  circleColor?: string;
  /** Called when user clicks on the map */
  onMapClick?: (lat: number, lon: number) => void;
  /** Whether to fly to selected location when it changes */
  flyToSelection?: boolean;
  /** External location to fly to (for centering without selecting) */
  flyToLocation?: MapLocation | null;
  /** Additional class names */
  className?: string;
}

// ============================================================================
// INTERNAL MAP COMPONENTS
// ============================================================================

function MapClickHandler({
  onClick,
}: {
  onClick?: (lat: number, lon: number) => void;
}): null {
  useMapEvents({
    click(e) {
      onClick?.(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function FlyToLocation({ location }: { location: MapLocation | null }): null {
  const map = useMap();
  const lat = location?.lat ?? null;
  const lon = location?.lon ?? null;

  // Key the effect on the primitive coordinates, not the object identity.
  // Callers routinely pass a fresh `{ lat, lon }` literal on every render (the
  // meeting-place card does), so depending on the object reference re-fires
  // `flyTo` on every parent re-render — the map visibly jumps around. Depending
  // on lat/lon means we only animate when the place actually moves.
  useEffect(() => {
    if (lat !== null && lon !== null) {
      map.flyTo([lat, lon], 14, { duration: 1.5 });
    }
  }, [lat, lon, map]);

  return null;
}

// MAIN COMPONENT

const DEFAULT_CENTER: [number, number] = [45.2671, 19.8335];
const DEFAULT_ZOOM = 11;

export function BaseMap({
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  height = "300px",
  selectedLocation = null,
  markerVariant = "amber",
  radiusKm,
  circleColor = "#f59e0b",
  onMapClick,
  flyToSelection = true,
  flyToLocation = null,
  className = "",
}: BaseMapProps): JSX.Element {
  const markerIcon = markerIcons[markerVariant];

  return (
    <div
      className={`w-full rounded-lg overflow-hidden border border-stone-700 ${className}`}
      style={{ height }}
    >
      <MapContainer
        center={center}
        zoom={zoom}
        className="h-full w-full"
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
          url="https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />

        {onMapClick && <MapClickHandler onClick={onMapClick} />}
        {flyToSelection && <FlyToLocation location={selectedLocation} />}
        {flyToLocation && <FlyToLocation location={flyToLocation} />}

        {selectedLocation && (
          <>
            <Marker
              position={[selectedLocation.lat, selectedLocation.lon]}
              icon={markerIcon}
            />
            {radiusKm && (
              <Circle
                center={[selectedLocation.lat, selectedLocation.lon]}
                radius={radiusKm * 1000}
                pathOptions={{
                  color: circleColor,
                  fillColor: circleColor,
                  fillOpacity: 0.1,
                  weight: 2,
                }}
              />
            )}
          </>
        )}
      </MapContainer>
    </div>
  );
}

// HOOKS

export function useCurrentLocation() {
  const getLocation = async (): Promise<MapLocation> => {
    const { getGeolocation } = await import("../../lib/host");
    const pos = await getGeolocation({ timeout: 10000 });
    return { lat: pos.coords.latitude, lon: pos.coords.longitude };
  };

  return { getLocation };
}
