import {
  ArrowLeftRight,
  Compass,
  Info,
  MapPin,
  PlusCircle,
  UserCircle2,
} from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation } from "react-router-dom";

import { useLocationContext } from "../../context/LocationContext";
import { useWalletContext } from "../../context/WalletContext";
import { getChainName, isSupportedChain } from "../../lib/constants";
import { NotificationsBell } from "../notifications/NotificationsBell";

const LocationMapPicker = lazy(() =>
  import("../location/LocationMapPicker").then((m) => {
    return {
      default: m.LocationMapPicker,
    };
  }),
);

const NAV_ITEMS = [
  { label: "Exchange", href: "/exchange", icon: ArrowLeftRight },
  { label: "Explore", href: "/explore", icon: Compass },
  { label: "Create", href: "/create", icon: PlusCircle },
] as const;

export function Header(): JSX.Element {
  const { address, accountName, isConnected, chainId, connect, isDetecting } =
    useWalletContext();
  const profileLabel = accountName?.trim() || "My Profile";
  const routeLocation = useLocation();
  const {
    location: userLocation,
    loading: locationLoading,
    setLocation: setUserLocation,
  } = useLocationContext();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);
  const [changingLocation, setChangingLocation] = useState(false);

  const isWrongNetwork = isConnected && !isSupportedChain(chainId);

  // Auto-open location modal when no location is set (step 0 requirement)
  const hasLocation = !!userLocation;
  useEffect(() => {
    if (!locationLoading && !hasLocation) {
      setLocationModalOpen(true);
      setChangingLocation(true);
    }
  }, [locationLoading, hasLocation]);

  return (
    <header className="sticky top-0 z-[1100] bg-stone-950/95 backdrop-blur-xl border-b border-stone-700">
      <div className="max-w-6xl mx-auto px-4 md:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center">
              <div className="w-3 h-3 rounded-full bg-stone-900" />
            </div>
            <span className="font-serif text-xl text-stone-50 tracking-tight">
              LocalDOT
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = routeLocation.pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
                    isActive
                      ? "bg-stone-800 text-stone-100"
                      : "text-stone-400 hover:text-stone-100 hover:bg-stone-800/50"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}

            {/* Profile — carries the wallet connection status dot */}
            <Link
              to="/profile"
              title={address ?? undefined}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 ${
                routeLocation.pathname === "/profile"
                  ? "bg-stone-800 text-stone-100"
                  : "text-stone-400 hover:text-stone-100 hover:bg-stone-800/50"
              }`}
            >
              <UserCircle2 className="w-4 h-4" />
              Profile
              {isConnected && (
                <span
                  className={`w-1.5 h-1.5 rounded-full ${isWrongNetwork ? "bg-red-500" : "bg-green-500"}`}
                  aria-label={isWrongNetwork ? "Wrong network" : "Connected"}
                />
              )}
            </Link>
          </nav>

          {/* Wallet */}
          <div className="flex items-center gap-3">
            {isConnected && address ? (
              <div className="flex items-center gap-2">
                {/* Chain Badge */}
                <span
                  className={`hidden md:inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                    isWrongNetwork
                      ? "bg-red-500/20 text-red-400 border border-red-500/30"
                      : "bg-stone-800 text-stone-400 border border-stone-700"
                  }`}
                >
                  {isWrongNetwork ? "Wrong Network" : getChainName(chainId)}
                </span>

                {/* Location Badge */}
                <button
                  onClick={() => setLocationModalOpen(true)}
                  className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-stone-700 hover:border-stone-600 transition-colors"
                >
                  <MapPin className="w-3 h-3 text-amber-400" />
                  <span className="text-xs text-stone-400">
                    {locationLoading
                      ? "..."
                      : userLocation?.city || "Set location"}
                  </span>
                </button>
              </div>
            ) : isDetecting ? (
              <span className="text-xs text-stone-500">Connecting...</span>
            ) : (
              <button
                onClick={connect}
                className="btn-ghost text-xs text-stone-500"
              >
                Retry connection
              </button>
            )}

            {/* Notifications — bell + unread badge (hidden until connected) */}
            <NotificationsBell />

            {/* About — icon only, far right */}
            <Link
              to="/about"
              title="About"
              aria-label="About"
              className={`hidden md:inline-flex items-center justify-center w-9 h-9 rounded-full border transition-colors ${
                routeLocation.pathname === "/about"
                  ? "border-stone-600 bg-stone-800 text-stone-100"
                  : "border-stone-700 text-stone-400 hover:text-stone-100 hover:border-stone-600"
              }`}
            >
              <Info className="w-4 h-4" />
            </Link>

            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden btn-ghost p-2"
              aria-label="Toggle menu"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                {mobileMenuOpen ? (
                  <path d="M5 5l10 10M15 5L5 15" />
                ) : (
                  <path d="M3 6h14M3 10h14M3 14h14" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-stone-700 bg-stone-950">
          <nav className="px-4 py-3 space-y-1">
            {NAV_ITEMS.map((item) => {
              const isActive = routeLocation.pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-stone-800 text-stone-100"
                      : "text-stone-400 hover:text-stone-100"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}

            {/* Mobile Profile link */}
            {isConnected && (
              <Link
                to="/profile"
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  routeLocation.pathname === "/profile"
                    ? "bg-stone-800 text-stone-100"
                    : "text-stone-400 hover:text-stone-100"
                }`}
              >
                <UserCircle2 className="w-4 h-4" />
                <span className="flex-1 truncate">{profileLabel}</span>
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isWrongNetwork ? "bg-red-500" : "bg-green-500"}`}
                  aria-label={isWrongNetwork ? "Wrong network" : "Connected"}
                />
              </Link>
            )}

            {/* Mobile About link */}
            <Link
              to="/about"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                routeLocation.pathname === "/about"
                  ? "bg-stone-800 text-stone-100"
                  : "text-stone-400 hover:text-stone-100"
              }`}
            >
              <Info className="w-4 h-4" />
              About
            </Link>

            {/* Mobile Chain Badge */}
            {isConnected && (
              <div className="px-3 py-2 text-xs text-stone-500">
                {isWrongNetwork ? (
                  <span className="text-red-400">Wrong Network</span>
                ) : (
                  <span>Connected to {getChainName(chainId)}</span>
                )}
              </div>
            )}
          </nav>
        </div>
      )}
      {/* Location Modal — rendered via portal to escape header sticky context */}
      {locationModalOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() =>
              !changingLocation && hasLocation && setLocationModalOpen(false)
            }
          >
            <div
              className="bg-stone-900 border border-stone-700 rounded-2xl max-w-md w-full mx-4 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {!changingLocation ? (
                /* Current location view */
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-medium text-stone-100">
                      Your Location
                    </h3>
                    {hasLocation && (
                      <button
                        onClick={() => setLocationModalOpen(false)}
                        className="text-stone-500 hover:text-stone-300 transition-colors"
                      >
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 20 20"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <path d="M5 5l10 10M15 5L5 15" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {userLocation ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-3 p-4 rounded-xl bg-stone-800/60 border border-stone-700/50">
                        <MapPin className="w-5 h-5 text-amber-400 flex-shrink-0" />
                        <div>
                          <p className="text-stone-100 font-medium">
                            {userLocation.city}
                            {userLocation.country
                              ? `, ${userLocation.country}`
                              : ""}
                          </p>
                          <p className="mono text-xs text-stone-500 mt-0.5">
                            {userLocation.lat.toFixed(4)},{" "}
                            {userLocation.lon.toFixed(4)}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-stone-500">
                        This location is used for finding nearby agents and
                        offers.
                      </p>
                      <button
                        onClick={() => setChangingLocation(true)}
                        className="w-full py-2.5 rounded-xl border border-stone-700 text-sm text-stone-300 hover:bg-stone-800 transition-colors"
                      >
                        Change Location
                      </button>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <MapPin className="w-8 h-8 text-stone-600 mx-auto mb-3" />
                      <p className="text-stone-400 text-sm mb-3">
                        Location not set. Set your location to find nearby
                        agents and offers.
                      </p>
                      <button
                        onClick={() => setChangingLocation(true)}
                        className="px-6 py-2.5 rounded-xl bg-amber-500 text-stone-900 text-sm font-medium hover:bg-amber-400 transition-colors"
                      >
                        Set Location
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* Change location view */
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-medium text-stone-100">
                      Change Location
                    </h3>
                    {hasLocation && (
                      <button
                        onClick={() => setChangingLocation(false)}
                        className="text-stone-500 hover:text-stone-300 transition-colors text-xs"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                  <Suspense
                    fallback={
                      <div className="h-[350px] flex items-center justify-center">
                        <p className="text-stone-500 text-sm">Loading...</p>
                      </div>
                    }
                  >
                    <LocationMapPicker
                      value={
                        userLocation
                          ? {
                              city: userLocation.city,
                              country: userLocation.country,
                              lat: userLocation.lat,
                              lon: userLocation.lon,
                              radiusKm: 0,
                            }
                          : null
                      }
                      onChange={(loc) => {
                        setUserLocation({
                          lat: loc.lat,
                          lon: loc.lon,
                          city: loc.city,
                          country: loc.country,
                        });
                      }}
                      showRadius={false}
                    />
                  </Suspense>
                  <button
                    onClick={() => {
                      setChangingLocation(false);
                      setLocationModalOpen(false);
                    }}
                    disabled={!hasLocation}
                    className="w-full mt-4 py-2.5 rounded-xl bg-amber-500 text-stone-900 text-sm font-medium hover:bg-amber-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </header>
  );
}
