/**
 * Host API permissions
 *
 * Strategy:
 *
 * - Network access — requested upfront from main.tsx (mapa hits CARTO/Nominatim
 *   on first render, has to be ready before the page mounts).
 * - Camera, Location — exposed two ways:
 *     • Up front, post-connect, by the onboarding gate (see
 *       `lib/host/onboarding.ts`), which calls `ensureDevicePermission` once
 *       the wallet reports "connected".
 *     • Just-in-time from the feature call (getCameraStream / getGeolocation),
 *       which covers users who skipped or denied onboarding.
 *
 *   These were originally JIT-only, never upfront, for two reasons:
 *     1. Reliability: the host's permission handler (handleDevicePermission)
 *        is registered inside ProductContainerBinding's React useEffect.
 *        Firing upfront from main.tsx racing against the host's mount can
 *        hit the createContainer default `NotImplemented` slot before the
 *        real handler swaps in, silently denying. The onboarding gate sidesteps
 *        this by firing only *after* the host reports "connected".
 *     2. UX: the prompt fires when the user actually wants the feature. The
 *        onboarding gate trades this for an all-at-once setup, by request.
 *
 * Both gates only fire when `isHosted()`; on plain localhost in dev, the
 * native browser permission flow handles them.
 */

import {
  type DevicePermissionKind,
  requestDevicePermission,
  requestPermission,
} from "@novasamatech/host-api-wrapper";

import { initHostDetection, isHosted } from "./detect";

const NETWORK_PERMISSIONS = [
  "https://basemaps.cartocdn.com", // CARTO Voyager map tiles
  "https://nominatim.openstreetmap.org", // Reverse geocoding
];

/**
 * Request network access upfront. Awaits the host handshake first so
 * transport.request doesn't throw "Polkadot host is not ready".
 */
export async function requestRemotePermissions(): Promise<void> {
  const inHost = await initHostDetection();
  if (!inHost) return;

  try {
    await requestPermission({
      tag: "Remote",
      value: NETWORK_PERMISSIONS,
    }).match(
      (v) => v === true,
      (err) => {
        console.warn("[host-permissions] network err:", err);
        return false;
      },
    );
  } catch (e) {
    console.warn("[host-permissions] network threw:", e);
  }
}

/**
 * Request a device permission and return whether the user granted it. Called
 * from getGeolocation / getCameraStream right before invoking the native
 * browser API, and from the onboarding gate to prefetch it up front. Host-gated
 * and idempotent from the user's view (the host remembers a prior grant).
 */
export async function ensureDevicePermission(
  device: DevicePermissionKind,
): Promise<boolean> {
  if (!isHosted()) return true; // native browser flow takes over
  try {
    const granted = await requestDevicePermission(device).match(
      (v) => v === true,
      (err) => {
        console.warn(`[host-permissions] device ${device} err:`, err);
        return false;
      },
    );
    return granted;
  } catch (e) {
    console.warn(`[host-permissions] device ${device} threw:`, e);
    return false;
  }
}

// ═══ Safe browser API wrappers ═══

/**
 * Get user's geolocation. Prompts the host for Location permission first
 * (no-op on subsequent calls if already granted), then calls navigator.
 */
export async function getGeolocation(
  options?: PositionOptions,
): Promise<GeolocationPosition> {
  if (!navigator.geolocation) {
    throw new Error("Geolocation is not supported by your browser.");
  }
  const granted = await ensureDevicePermission("Location");
  if (!granted) {
    throw new Error(
      "Location permission denied. Open Polkadot Desktop → app permissions → enable Location, then retry.",
    );
  }
  return await new Promise<GeolocationPosition>((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(
      resolve,
      (err) => {
        switch (err.code) {
          case err.PERMISSION_DENIED:
            reject(
              new Error(
                "Location permission denied. Open Polkadot Desktop → app permissions → enable Location, then retry.",
              ),
            );
            break;
          case err.POSITION_UNAVAILABLE:
            reject(
              new Error(
                "Location unavailable. Make sure location services are enabled on your device.",
              ),
            );
            break;
          case err.TIMEOUT:
            reject(
              new Error(
                "Location request timed out. Try again or pick a location on the map.",
              ),
            );
            break;
          default:
            reject(new Error("Unable to get your location."));
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 60_000,
        timeout: 15_000,
        ...options,
      },
    ),
  );
}

/**
 * Get camera stream. Prompts for Camera permission first.
 */
export async function getCameraStream(
  constraints?: MediaStreamConstraints,
): Promise<MediaStream> {
  const granted = await ensureDevicePermission("Camera");
  if (!granted) {
    throw new Error(
      "Camera permission denied. Open Polkadot Desktop → app permissions → enable Camera, then retry.",
    );
  }
  return await navigator.mediaDevices.getUserMedia(
    constraints ?? { video: { facingMode: "environment" } },
  );
}
