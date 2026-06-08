import { useState } from "react";

import { reverseGeocode } from "../../lib/geo";
import {
  BackIcon,
  BaseMap,
  CrosshairsIcon,
  ErrorMessage,
  LocationCard,
  LocationIcon,
  MapHelpOverlay,
  MapLoadingOverlay,
  type MapLocation,
  MapPinIcon,
  Spinner,
  useCurrentLocation,
} from "./BaseMap";

interface SimpleLocationData {
  city: string;
  country: string;
  lat: number;
  lon: number;
}

interface QuickLocationPickerProps {
  value: SimpleLocationData | null;
  onChange: (location: SimpleLocationData | null) => void;
}

type PickerMode = "choose" | "map";

export function QuickLocationPicker({
  value,
  onChange,
}: QuickLocationPickerProps): JSX.Element {
  const [mode, setMode] = useState<PickerMode>("choose");
  const [gettingLocation, setGettingLocation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Map state - separate pending selection from confirmed
  const [mapSelection, setMapSelection] = useState<MapLocation | null>(null);
  const [pendingLocationData, setPendingLocationData] =
    useState<SimpleLocationData | null>(null);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);

  // For centering map without selecting
  const [centerLocation, setCenterLocation] = useState<MapLocation | null>(
    null,
  );
  const [isCentering, setIsCentering] = useState(false);

  const { getLocation } = useCurrentLocation();

  const handleShareLocation = async () => {
    setGettingLocation(true);
    setError(null);

    try {
      const location = await getLocation();
      const result = await reverseGeocode(location.lat, location.lon);
      onChange({
        city: result?.city || "Unknown",
        country: result?.country || "",
        lat: location.lat,
        lon: location.lon,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to get location");
    } finally {
      setGettingLocation(false);
    }
  };

  const handleCenterOnMe = async () => {
    setIsCentering(true);
    setError(null);

    try {
      const location = await getLocation();
      setCenterLocation(location);
      // Also set as pending selection (user still needs to confirm)
      setMapSelection(location);
      setIsReverseGeocoding(true);
      setPendingLocationData(null);

      const result = await reverseGeocode(location.lat, location.lon);
      setIsReverseGeocoding(false);

      setPendingLocationData({
        city: result?.city || "Unknown",
        country: result?.country || "",
        lat: location.lat,
        lon: location.lon,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to get location");
    } finally {
      setIsCentering(false);
    }
  };

  const handleMapClick = async (lat: number, lon: number) => {
    setMapSelection({ lat, lon });
    setError(null);
    setIsReverseGeocoding(true);
    setPendingLocationData(null);

    const result = await reverseGeocode(lat, lon);
    setIsReverseGeocoding(false);

    if (result) {
      setPendingLocationData({ ...result, lat, lon });
    } else {
      setError(
        "Could not determine city for this location. Try a different spot.",
      );
    }
  };

  const handleConfirmSelection = () => {
    if (pendingLocationData) {
      onChange(pendingLocationData);
    }
  };

  const handleCancelSelection = () => {
    setMapSelection(null);
    setPendingLocationData(null);
    setError(null);
  };

  const handleReset = () => {
    onChange(null);
    setMapSelection(null);
    setPendingLocationData(null);
    setCenterLocation(null);
    setMode("choose");
    setError(null);
  };

  // If we have a value, show the selected location
  if (value) {
    return (
      <LocationCard
        city={value.city}
        country={value.country}
        lat={value.lat}
        lon={value.lon}
        label="Search location"
        onChangeClick={handleReset}
      />
    );
  }

  // Mode: Choose between current location or map
  if (mode === "choose") {
    return (
      <div className="space-y-3">
        {/* Option 1: Share current location */}
        <button
          type="button"
          onClick={handleShareLocation}
          disabled={gettingLocation}
          className="w-full flex items-center gap-4 px-4 py-4 rounded-lg text-left bg-stone-800 border-2 border-stone-700 hover:border-amber-500/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center">
            {gettingLocation ? (
              <Spinner color="amber" />
            ) : (
              <LocationIcon color="#f59e0b" />
            )}
          </div>
          <div className="flex-1">
            <div className="font-medium text-stone-100">
              {gettingLocation
                ? "Getting your location..."
                : "Use my current location"}
            </div>
            <div className="text-xs text-stone-400 mt-0.5">
              Find providers near where you are now
            </div>
          </div>
        </button>

        {/* Option 2: Pick on map */}
        <button
          type="button"
          onClick={() => setMode("map")}
          className="w-full flex items-center gap-4 px-4 py-4 rounded-lg text-left bg-stone-800 border-2 border-stone-700 hover:border-amber-500/50 transition-colors"
        >
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
            <MapPinIcon color="#3b82f6" />
          </div>
          <div className="flex-1">
            <div className="font-medium text-stone-100">
              Pick a different location
            </div>
            <div className="text-xs text-stone-400 mt-0.5">
              Select where you'll be (e.g., traveling to another city)
            </div>
          </div>
        </button>

        {error && (
          <div className="flex items-start gap-2">
            <ErrorMessage message={error} />
            <button
              type="button"
              onClick={() => {
                setError(null);
                void handleShareLocation();
              }}
              className="flex-shrink-0 mt-2 text-xs text-amber-400 hover:text-amber-300 transition-colors"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    );
  }

  // Mode: Map picker
  return (
    <div className="space-y-3">
      {/* Header with back and center buttons */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            setMode("choose");
            setMapSelection(null);
            setPendingLocationData(null);
            setCenterLocation(null);
            setError(null);
          }}
          className="flex items-center gap-2 text-sm text-stone-400 hover:text-stone-300 transition-colors"
        >
          <BackIcon />
          Back
        </button>

        {/* Center on me button */}
        <button
          type="button"
          onClick={handleCenterOnMe}
          disabled={isCentering}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-stone-700 hover:bg-stone-600 text-stone-200 transition-colors disabled:opacity-50"
        >
          {isCentering ? (
            <Spinner size="sm" color="stone" />
          ) : (
            <CrosshairsIcon />
          )}
          {isCentering ? "Locating..." : "Center on me"}
        </button>
      </div>

      {/* Map */}
      <div className="relative">
        <BaseMap
          height="250px"
          selectedLocation={mapSelection}
          markerVariant="red"
          onMapClick={handleMapClick}
          flyToSelection={true}
          flyToLocation={centerLocation}
        />

        {!mapSelection && (
          <MapHelpOverlay text="Click on the map to select a location" />
        )}
        {isReverseGeocoding && <MapLoadingOverlay />}
      </div>

      {error && (
        <div className="flex items-start gap-2">
          <ErrorMessage message={error} />
          <button
            type="button"
            onClick={() => {
              setError(null);
              void handleCenterOnMe();
            }}
            className="flex-shrink-0 mt-2 text-xs text-amber-400 hover:text-amber-300 transition-colors"
          >
            Try again
          </button>
        </div>
      )}

      {/* Pending location confirmation */}
      {pendingLocationData && (
        <div className="rounded-lg bg-stone-800 border border-stone-600 p-4 space-y-3">
          <div className="space-y-1">
            <div className="text-xs text-stone-400 uppercase tracking-wider">
              Selected location
            </div>
            <div className="text-base text-stone-100 font-medium">
              {pendingLocationData.city}, {pendingLocationData.country}
            </div>
            <div className="text-xs text-stone-500 mono">
              {pendingLocationData.lat.toFixed(4)},{" "}
              {pendingLocationData.lon.toFixed(4)}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCancelSelection}
              className="flex-1 py-2 px-4 rounded-lg text-sm font-medium bg-stone-700 hover:bg-stone-600 text-stone-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmSelection}
              className="flex-1 py-2 px-4 rounded-lg text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors"
            >
              Confirm
            </button>
          </div>
        </div>
      )}

      {/* Coordinates preview before geocoding completes */}
      {mapSelection &&
        !pendingLocationData &&
        !isReverseGeocoding &&
        !error && (
          <div className="rounded-lg bg-stone-800/50 border border-stone-700 px-4 py-3">
            <div className="text-xs text-stone-400 mono">
              Selected: {mapSelection.lat.toFixed(4)},{" "}
              {mapSelection.lon.toFixed(4)}
            </div>
          </div>
        )}
    </div>
  );
}
