import "leaflet/dist/leaflet.css";
import L from "leaflet";
// Fix for default marker icons in React-Leaflet
import icon from "leaflet/dist/images/marker-icon.png";
import iconRetina from "leaflet/dist/images/marker-icon-2x.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";
import { Star } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  Circle,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
} from "../location/leaflet-lite";

const DefaultIcon = L.icon({
  iconRetinaUrl: iconRetina,
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

L.Marker.prototype.options.icon = DefaultIcon;

// Custom icon for user location (red marker)
const userLocationIcon = L.icon({
  iconUrl:
    "data:image/svg+xml;base64," +
    btoa(`
    <svg width="25" height="41" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
      <path fill="#ef4444" stroke="#dc2626" stroke-width="2" d="M12.5 0C5.596 0 0 5.596 0 12.5c0 9.375 12.5 28.5 12.5 28.5S25 21.875 25 12.5C25 5.596 19.404 0 12.5 0zm0 17.5c-2.761 0-5-2.239-5-5s2.239-5 5-5 5 2.239 5 5-2.239 5-5 5z"/>
    </svg>
  `),
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

// Provider (SELL) - green marker (matches Deposit)
const providerIcon = L.icon({
  iconUrl:
    "data:image/svg+xml;base64," +
    btoa(`
    <svg width="25" height="41" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
      <path fill="#22c55e" stroke="#16a34a" stroke-width="2" d="M12.5 0C5.596 0 0 5.596 0 12.5c0 9.375 12.5 28.5 12.5 28.5S25 21.875 25 12.5C25 5.596 19.404 0 12.5 0zm0 17.5c-2.761 0-5-2.239-5-5s2.239-5 5-5 5 2.239 5 5-2.239 5-5 5z"/>
    </svg>
  `),
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

// Buyer (BUY) - amber marker (matches Withdraw)
const buyerIcon = L.icon({
  iconUrl:
    "data:image/svg+xml;base64," +
    btoa(`
    <svg width="25" height="41" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
      <path fill="#f59e0b" stroke="#d97706" stroke-width="2" d="M12.5 0C5.596 0 0 5.596 0 12.5c0 9.375 12.5 28.5 12.5 28.5S25 21.875 25 12.5C25 5.596 19.404 0 12.5 0zm0 17.5c-2.761 0-5-2.239-5-5s2.239-5 5-5 5 2.239 5 5-2.239 5-5 5z"/>
    </svg>
  `),
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

// Recommended - yellow marker (for recommended offers)
const recommendedIcon = L.icon({
  iconUrl:
    "data:image/svg+xml;base64," +
    btoa(`
    <svg width="25" height="41" viewBox="0 0 25 41" xmlns="http://www.w3.org/2000/svg">
      <path fill="#f59e0b" stroke="#d97706" stroke-width="2" d="M12.5 0C5.596 0 0 5.596 0 12.5c0 9.375 12.5 28.5 12.5 28.5S25 21.875 25 12.5C25 5.596 19.404 0 12.5 0zm0 17.5c-2.761 0-5-2.239-5-5s2.239-5 5-5 5 2.239 5 5-2.239 5-5 5z"/>
    </svg>
  `),
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

interface Offer {
  id: string;
  alias: string;
  role?: "seller" | "buyer";
  city: string;
  country: string;
  lat?: number;
  lon?: number;
  radiusKm?: number;
  fee: string | null;
  minAmount: string;
  maxAmount: string;
  fiatCurrency?: string;
  isRecommended?: boolean;
}

interface MapViewProps {
  offers: Offer[];
  userLocation: { lat: number; lon: number } | null;
  nativeCurrencySymbol: string;
  recommendedOfferIds?: Set<string>;
  /** "offers" (default) or "agents", changes popup content */
  variant?: "offers" | "agents";
}

// Component to fit bounds ONLY on initial load
function FitBounds({
  offers,
  userLocation,
}: {
  offers: Offer[];
  userLocation: { lat: number; lon: number } | null;
}): null {
  const map = useMap();
  const [hasInitialized, setHasInitialized] = useState(false);

  useEffect(() => {
    // Only fit bounds once on initial load
    if (hasInitialized) return;

    const bounds = L.latLngBounds([]);

    // Add user location to bounds
    if (userLocation) {
      bounds.extend([userLocation.lat, userLocation.lon]);
    }

    // Add all offer locations to bounds
    offers.forEach((offer) => {
      if (offer.lat && offer.lon && (offer.lat !== 0 || offer.lon !== 0)) {
        bounds.extend([offer.lat, offer.lon]);
      }
    });

    // Fit map to bounds if we have any points
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 13 });
      setHasInitialized(true);
    }
  }, [offers, userLocation, map, hasInitialized]);

  return null;
}

// Button to center map on user location
function LocationButton({
  userLocation,
}: {
  userLocation: { lat: number; lon: number } | null;
}): JSX.Element | null {
  const map = useMap();

  if (!userLocation) return null;

  const handleClick = () => {
    map.setView([userLocation.lat, userLocation.lon], 14, {
      animate: true,
      duration: 0.5,
    });
  };

  return (
    <button
      onClick={handleClick}
      className="absolute top-4 right-4 z-[1000] bg-white hover:bg-stone-50 text-stone-900 p-2 rounded-lg shadow-lg border border-stone-200 transition-colors"
      title="Center on my location"
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="3" fill="currentColor" />
      </svg>
    </button>
  );
}

/** ~0.002° ≈ 200m offset so overlapping markers are visible */
const MARKER_OFFSET_DEG = 0.002;

/**
 * For offers at the same lat/lon, add small offsets so markers don't stack.
 * Groups by rounded position and offsets each in a circle.
 */
function offsetOverlappingMarkers<T extends { lat?: number; lon?: number }>(
  offers: T[],
): (T & { displayLat: number; displayLon: number })[] {
  const key = (lat: number, lon: number) =>
    `${lat.toFixed(4)}_${lon.toFixed(4)}`;
  const groups = new Map<string, T[]>();

  for (const o of offers) {
    if (o.lat == null || o.lon == null) continue;
    const k = key(o.lat, o.lon);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(o);
  }

  const result: (T & { displayLat: number; displayLon: number })[] = [];
  for (const group of groups.values()) {
    const baseLat = group[0]!.lat!;
    const baseLon = group[0]!.lon!;
    group.forEach((o, i) => {
      if (group.length === 1) {
        result.push({ ...o, displayLat: baseLat, displayLon: baseLon });
      } else {
        const angle = (2 * Math.PI * i) / group.length;
        result.push({
          ...o,
          displayLat: baseLat + MARKER_OFFSET_DEG * Math.cos(angle),
          displayLon: baseLon + MARKER_OFFSET_DEG * Math.sin(angle),
        });
      }
    });
  }
  return result;
}

export function MapView({
  offers,
  userLocation,
  nativeCurrencySymbol,
  recommendedOfferIds,
  variant = "offers",
}: MapViewProps): JSX.Element {
  // Track which marker is clicked to show its radius
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);

  // Default center (will be overridden by FitBounds)
  const defaultCenter: [number, number] = userLocation
    ? [userLocation.lat, userLocation.lon]
    : [40.7128, -74.006]; // Default to NYC if no location

  // Filter offers with valid locations, then offset overlapping markers
  const validOffers = offers.filter(
    (offer) => offer.lat && offer.lon && (offer.lat !== 0 || offer.lon !== 0),
  );
  const offersWithOffset = offsetOverlappingMarkers(validOffers);

  return (
    <div className="h-[600px] w-full rounded-lg overflow-hidden border border-stone-800 relative">
      <MapContainer
        center={defaultCenter}
        zoom={11}
        className="h-full w-full"
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
          url="https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />

        <FitBounds offers={validOffers} userLocation={userLocation} />
        <LocationButton userLocation={userLocation} />

        {/* User location marker */}
        {userLocation && (
          <Marker
            position={[userLocation.lat, userLocation.lon]}
            icon={userLocationIcon}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-medium text-red-600">Your Location</p>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Offer markers with radius circles (use displayLat/displayLon for position, real lat/lon for circle) */}
        {offersWithOffset.map((offer) => {
          const isSelected = selectedOfferId === offer.id;
          const isRecommended = recommendedOfferIds?.has(offer.id) ?? false;

          // Determine marker icon and circle color
          const markerIcon = isRecommended
            ? recommendedIcon
            : offer.role === "buyer"
              ? buyerIcon
              : providerIcon;

          const circleColor = isRecommended
            ? "#f59e0b" // amber-500
            : offer.role === "buyer"
              ? "#f59e0b" // amber-500 (matches Withdraw)
              : "#22c55e"; // green-500 (matches Deposit)

          return (
            <Fragment key={offer.id}>
              {/* Radius circle - only show for selected offer, at real location */}
              {offer.radiusKm &&
                offer.lat != null &&
                offer.lon != null &&
                isSelected && (
                  <Circle
                    center={[offer.lat, offer.lon]}
                    radius={offer.radiusKm * 1000} // Convert km to meters
                    pathOptions={{
                      color: circleColor,
                      fillColor: circleColor,
                      fillOpacity: 0.1,
                      weight: 2,
                    }}
                  />
                )}

              {/* Marker - yellow for recommended, blue for provider (SELL), green for buyer (BUY) */}
              <Marker
                position={[offer.displayLat, offer.displayLon]}
                icon={markerIcon}
                eventHandlers={{
                  click: () => setSelectedOfferId(offer.id),
                }}
              >
                <Popup
                  eventHandlers={{
                    remove: () => setSelectedOfferId(null),
                  }}
                >
                  <div className="min-w-[200px]">
                    {variant === "agents" ? (
                      <>
                        <p className="font-medium text-stone-900 mb-1">
                          {offer.alias}
                        </p>
                        <p className="text-xs text-stone-600 mb-2">
                          {offer.city}
                          {offer.country ? `, ${offer.country}` : ""}
                        </p>
                        <div className="mb-2">
                          <p className="text-xs text-stone-500">Fee</p>
                          <p className="text-sm font-medium text-stone-900">
                            {offer.fiatCurrency}
                          </p>
                        </div>
                        <div className="mb-3">
                          <p className="text-xs text-stone-500">
                            Active offers
                          </p>
                          <p className="text-sm font-medium text-stone-900">
                            {offer.fee}
                          </p>
                        </div>
                        <Link
                          to={`/agent/${offer.id}`}
                          className="block w-full text-center px-3 py-1.5 text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white rounded transition-colors"
                        >
                          View Agent
                        </Link>
                      </>
                    ) : (
                      <>
                        {isRecommended && (
                          <div className="mb-2 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                            <Star className="w-3 h-3 fill-white text-white" />{" "}
                            Recommended
                          </div>
                        )}
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-stone-900">
                            {offer.alias}
                          </p>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              isRecommended
                                ? "bg-amber-500/15 text-amber-600"
                                : offer.role === "buyer"
                                  ? "bg-amber-500/15 text-amber-600"
                                  : "bg-green-500/15 text-green-600"
                            }`}
                          >
                            {offer.role === "buyer" ? "Buying" : "Selling"}
                          </span>
                        </div>
                        <p className="text-xs text-stone-600 mb-2">
                          {offer.city}
                          {offer.country ? `, ${offer.country}` : ""}
                        </p>
                        <div className="mb-2">
                          <p className="text-xs text-stone-500">
                            {offer.role === "buyer"
                              ? "Wants to buy"
                              : "Amount range"}
                          </p>
                          <p className="text-sm font-medium text-stone-900">
                            {offer.minAmount} – {offer.maxAmount}{" "}
                            {nativeCurrencySymbol}
                          </p>
                        </div>
                        <div className="mb-3">
                          <p className="text-xs text-stone-500">Fee</p>
                          <p className="text-sm font-medium text-stone-900">
                            {offer.fee ?? "No fee"}
                          </p>
                        </div>
                        <Link
                          to={`/offer/${offer.id}`}
                          className="block w-full text-center px-3 py-1.5 text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white rounded transition-colors"
                        >
                          View Offer
                        </Link>
                      </>
                    )}
                  </div>
                </Popup>
              </Marker>
            </Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}
