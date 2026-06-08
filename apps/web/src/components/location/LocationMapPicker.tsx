import { useEffect, useRef, useState } from "react";

import { randomOffset, reverseGeocode } from "../../lib/geo";
import { getGeolocation } from "../../lib/host";
import {
  BaseMap,
  ErrorMessage,
  LocationIcon,
  MapHelpOverlay,
  type MapLocation,
  Spinner,
} from "./BaseMap";

export interface LocationData {
  city: string;
  country: string;
  lat: number;
  lon: number;
  radiusKm: number;
}

interface LocationMapPickerProps {
  value: LocationData | null;
  onChange: (location: LocationData) => void;
  onInputModeChange?: (mode: "map" | "manual") => void;
  /** Show radius slider and privacy tip. Default true (for offers). Set false for agents. */
  showRadius?: boolean;
}

const SLIDER_CLASSES =
  "w-full h-2 bg-stone-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-500 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-amber-400 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-amber-500 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-amber-400 [&::-moz-range-thumb]:border-0";

function RadiusSlider({
  value,
  onChange,
  helpText,
}: {
  value: number;
  onChange: (value: number) => void;
  helpText?: string;
}): JSX.Element {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-[11px] text-stone-400 uppercase tracking-wider font-medium">
          Meetup Radius
        </label>
        <span className="text-sm font-medium text-stone-200 mono">
          {value} km
        </span>
      </div>
      <input
        type="range"
        min="1"
        max="10"
        step="0.5"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={SLIDER_CLASSES}
      />
      {helpText && <p className="text-xs text-stone-500 mt-1.5">{helpText}</p>}
    </div>
  );
}

export function LocationMapPicker({
  value,
  onChange,
  onInputModeChange,
  showRadius = true,
}: LocationMapPickerProps): JSX.Element {
  const [inputMode, setInputMode] = useState<"map" | "manual">("map");
  const [selectedLocation, setSelectedLocation] = useState<MapLocation | null>(
    value ? { lat: value.lat, lon: value.lon } : null,
  );
  const [radius, setRadius] = useState(value?.radiusKm || 2);
  const [error, setError] = useState<string | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [generatingApprox, setGeneratingApprox] = useState(false);

  // Manual input fields
  const [manualLat, setManualLat] = useState(value?.lat.toString() || "");
  const [manualLon, setManualLon] = useState(value?.lon.toString() || "");
  const [manualCity, setManualCity] = useState(value?.city || "");
  const [manualCountry, setManualCountry] = useState(value?.country || "");

  const emitLocation = (
    city: string,
    country: string,
    lat: number,
    lon: number,
  ) => {
    onChange({ city, country, lat, lon, radiusKm: showRadius ? radius : 0 });
  };

  const handleGenerateApprox = async () => {
    manualEditedRef.current = true;
    setGeneratingApprox(true);
    setError(null);
    try {
      const pos = await getGeolocation({ timeout: 10000 });
      const approx = randomOffset(
        pos.coords.latitude,
        pos.coords.longitude,
        500,
      );

      const result = await reverseGeocode(approx.lat, approx.lon);
      setManualLat(approx.lat.toFixed(4));
      setManualLon(approx.lon.toFixed(4));

      if (result?.city) {
        setManualCity(result.city);
        setManualCountry(result.country);
        emitLocation(result.city, result.country, approx.lat, approx.lon);
      } else {
        setManualCity("");
        setManualCountry("");
        setError("Coordinates set. Please fill in city and country.");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not get your location. Please fill in the fields manually.",
      );
    } finally {
      setGeneratingApprox(false);
    }
  };

  /** Switch to Manual tab with coordinates pre-filled for user to add city/country. */
  const switchToManualWithCoords = (lat: number, lon: number) => {
    setManualLat(lat.toFixed(4));
    setManualLon(lon.toFixed(4));
    setManualCity("");
    setManualCountry("");
    setInputMode("manual");
    onInputModeChange?.("manual");
    setError("Coordinates set. Please fill in city and country.");
  };

  const handleReverseGeocode = async (lat: number, lon: number) => {
    setError(null);
    const result = await reverseGeocode(lat, lon);
    if (result?.city) {
      emitLocation(result.city, result.country, lat, lon);
    } else {
      switchToManualWithCoords(lat, lon);
    }
  };

  const handleMapClick = (lat: number, lon: number) => {
    setSelectedLocation({ lat, lon });
    handleReverseGeocode(lat, lon);
  };

  const handleUseMyLocation = async () => {
    setGettingLocation(true);
    setError(null);
    try {
      const pos = await getGeolocation({ timeout: 10000 });
      const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      setSelectedLocation(loc);
      await handleReverseGeocode(loc.lat, loc.lon);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not get your location. Click on the map instead.",
      );
    } finally {
      setGettingLocation(false);
    }
  };

  const handleRadiusChange = (newRadius: number) => {
    setRadius(newRadius);
    if (value) {
      onChange({ ...value, radiusKm: newRadius });
    }
  };

  // Auto-update location when manual inputs change (skip on tab switch)
  const manualEditedRef = useRef(false);
  useEffect(() => {
    if (inputMode !== "manual") {
      manualEditedRef.current = false;
      return;
    }
    if (!manualEditedRef.current) return;
    const lat = parseFloat(manualLat);
    const lon = parseFloat(manualLon);
    if (
      !isNaN(lat) &&
      !isNaN(lon) &&
      manualCity.trim() &&
      manualCountry.trim()
    ) {
      setError(null);
      emitLocation(manualCity.trim(), manualCountry.trim(), lat, lon);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manualLat, manualLon, manualCity, manualCountry, radius, inputMode]);

  return (
    <div className="space-y-4">
      {/* Tab Toggle */}
      <div className="flex rounded-lg bg-stone-800 p-1">
        <button
          type="button"
          onClick={() => {
            setInputMode("map");
            onInputModeChange?.("map");
          }}
          className={`flex-1 py-2.5 rounded-md text-sm font-medium transition-colors ${
            inputMode === "map"
              ? "bg-stone-100 text-stone-900"
              : "text-stone-400 hover:text-stone-300"
          }`}
        >
          Map
        </button>
        <button
          type="button"
          onClick={() => {
            setInputMode("manual");
            onInputModeChange?.("manual");
          }}
          className={`flex-1 py-2.5 rounded-md text-sm font-medium transition-colors ${
            inputMode === "manual"
              ? "bg-stone-100 text-stone-900"
              : "text-stone-400 hover:text-stone-300"
          }`}
        >
          Manual
        </button>
      </div>

      {inputMode === "map" ? (
        <>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={handleUseMyLocation}
              disabled={gettingLocation}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {gettingLocation ? (
                <>
                  <Spinner size="sm" color="white" />
                  Getting location...
                </>
              ) : (
                <>
                  <LocationIcon size={16} />
                  Use my location
                </>
              )}
            </button>
            {showRadius && (
              <div className="rounded-lg bg-amber-950/30 border border-amber-800/50 px-3 py-2">
                <p className="text-xs text-amber-200/80">
                  Pick a public meetup location nearby instead of your exact
                  address.
                </p>
              </div>
            )}
            <p className="text-xs text-stone-500 text-center">
              or click on the map to pin your location
            </p>
          </div>

          {error && <ErrorMessage message={error} size="sm" />}

          <div className="relative">
            <BaseMap
              height={showRadius ? "400px" : "350px"}
              selectedLocation={selectedLocation}
              markerVariant="red"
              radiusKm={showRadius ? radius : undefined}
              circleColor={showRadius ? "#ef4444" : undefined}
              onMapClick={handleMapClick}
            />
            {!selectedLocation && (
              <MapHelpOverlay text="Click on the map to set your location" />
            )}
          </div>

          {showRadius && (
            <RadiusSlider
              value={radius}
              onChange={handleRadiusChange}
              helpText="How far from the marker you're willing to meet"
            />
          )}

          {value && (
            <div className="rounded-lg bg-stone-800/50 border border-stone-700 px-4 py-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-stone-400">City:</span>
                <span className="text-stone-200 font-medium">{value.city}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-stone-400">Country:</span>
                <span className="text-stone-200 font-medium">
                  {value.country}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-stone-400">Coordinates:</span>
                <span className="text-stone-200 font-medium mono">
                  {value.lat.toFixed(4)}, {value.lon.toFixed(4)}
                </span>
              </div>
            </div>
          )}
        </>
      ) : (
        /* Manual Input Mode */
        <div className="space-y-4">
          <button
            type="button"
            onClick={handleGenerateApprox}
            disabled={generatingApprox}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generatingApprox ? (
              <>
                <Spinner size="sm" color="white" />
                Generating...
              </>
            ) : (
              <>
                <LocationIcon size={16} />
                Generate approximate location
              </>
            )}
          </button>
          <p className="text-xs text-stone-500 text-center">
            Uses your GPS to generate a nearby address (~500m offset for
            privacy). You can also fill in the fields manually.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] text-stone-400 uppercase tracking-wider font-medium mb-2">
                City *
              </label>
              <input
                type="text"
                value={manualCity}
                onChange={(e) => {
                  manualEditedRef.current = true;
                  setManualCity(e.target.value);
                }}
                placeholder="Novi Sad"
                className="input"
              />
            </div>
            <div>
              <label className="block text-[11px] text-stone-400 uppercase tracking-wider font-medium mb-2">
                Country *
              </label>
              <input
                type="text"
                value={manualCountry}
                onChange={(e) => {
                  manualEditedRef.current = true;
                  setManualCountry(e.target.value);
                }}
                placeholder="Serbia"
                className="input"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] text-stone-400 uppercase tracking-wider font-medium mb-2">
                Latitude *
              </label>
              <input
                type="text"
                value={manualLat}
                onChange={(e) => {
                  manualEditedRef.current = true;
                  setManualLat(e.target.value);
                }}
                placeholder="45.2551"
                className="input mono"
              />
            </div>
            <div>
              <label className="block text-[11px] text-stone-400 uppercase tracking-wider font-medium mb-2">
                Longitude *
              </label>
              <input
                type="text"
                value={manualLon}
                onChange={(e) => {
                  manualEditedRef.current = true;
                  setManualLon(e.target.value);
                }}
                placeholder="19.8451"
                className="input mono"
              />
            </div>
          </div>

          <details className="group">
            <summary className="text-[11px] text-stone-600 cursor-pointer hover:text-stone-400 transition-colors list-none flex items-center gap-1">
              <svg
                className="w-3.5 h-3.5 text-stone-600 group-hover:text-stone-400 flex-shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
              How to get coordinates
            </summary>
            <p className="text-[11px] text-stone-500 mt-1.5 ml-5">
              Open{" "}
              <a
                href="https://www.google.com/maps"
                target="_blank"
                rel="noopener noreferrer"
                className="text-stone-400 underline hover:text-stone-300"
              >
                Google Maps
              </a>
              , right-click any location and click the coordinates to copy them.
            </p>
          </details>

          {showRadius && (
            <RadiusSlider
              value={radius}
              onChange={handleRadiusChange}
              helpText="How far from the coordinates you're willing to meet"
            />
          )}

          {error && <ErrorMessage message={error} size="sm" />}
        </div>
      )}
    </div>
  );
}
