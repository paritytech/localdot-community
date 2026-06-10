/**
 * QR Scanner Component
 *
 * Camera-based QR code scanner using html5-qrcode.
 * Optimized for mobile devices with rear camera.
 */

import { requestDevicePermission } from "@novasamatech/host-api-wrapper";
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";
import { Camera, CameraOff, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { isHosted } from "../../lib/host/detect";

interface QRScannerProps {
  /** Called when a QR code is successfully scanned */
  onScan: (data: string) => void;
  /** Called when an error occurs */
  onError?: (error: string) => void;
  /** Whether scanning is active */
  active?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function QRScanner({
  onScan,
  onError,
  active = true,
  className = "",
}: QRScannerProps): JSX.Element {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const scannedRef = useRef(false);

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (scanner) {
      try {
        const state = scanner.getState();
        // Only call stop() when SCANNING or PAUSED — calling it in any
        // other state throws synchronously in html5-qrcode and the throw
        // can escape Promise.catch and crash the React tree.
        if (
          state === Html5QrcodeScannerState.SCANNING ||
          state === Html5QrcodeScannerState.PAUSED
        ) {
          await scanner.stop();
        }
      } catch {
        // Ignore stop errors
      }
    }
    setIsScanning(false);
  }, []);

  const startScanner = useCallback(async () => {
    if (!containerRef.current || scannedRef.current) return;

    setError(null);

    // In Polkadot Triangle host, html5-qrcode's internal getUserMedia call
    // hits the Electron sandbox's setPermissionRequestHandler which only
    // *reads* the stored Camera decision — it never prompts. We must go
    // through the host's host_device_permission first to surface the dialog.
    if (isHosted()) {
      const granted = await requestDevicePermission("Camera").match(
        (v) => v === true,
        () => false,
      );
      if (!granted) {
        setHasPermission(false);
        const msg =
          "Camera permission denied. Open Polkadot Desktop → app permissions → enable Camera, then retry.";
        setError(msg);
        onError?.(msg);
        return;
      }
    }

    // Create scanner instance if needed
    if (!scannerRef.current) {
      scannerRef.current = new Html5Qrcode("qr-scanner-region");
    }

    const scanner = scannerRef.current;

    // If the scanner is already SCANNING, we're done — calling start()
    // again would throw "already running". This protects the Try Again
    // button case where a background retry already succeeded.
    try {
      const state = scanner.getState();
      if (state === Html5QrcodeScannerState.SCANNING) {
        setIsScanning(true);
        setHasPermission(true);
        return;
      }
      if (state === Html5QrcodeScannerState.PAUSED) {
        // Resume instead of starting fresh.
        try {
          scanner.resume();
          setIsScanning(true);
          setHasPermission(true);
          return;
        } catch {
          /* fall through to full start */
        }
      }
    } catch {
      /* scanner has no state yet — proceed with start */
    }

    // The Triangle host updates its stored device-permission status
    // asynchronously after our requestDevicePermission resolves; the
    // sandbox's setPermissionRequestHandler reads it via firstValueFrom
    // on a reactive observable, so the freshly-granted status may not
    // be visible to the very next getUserMedia call. Retry over a
    // ~4-second window with progressive backoff so the propagation lag
    // is invisible to the user (no "Failed to start" overlay then a
    // delayed Try Again that succeeds).
    const tryStart = () =>
      scanner.start(
        { facingMode: "environment" }, // Prefer back camera
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
        },
        (decodedText) => {
          if (scannedRef.current) return;
          scannedRef.current = true;
          void stopScanner();
          onScan(decodedText);
        },
        () => {
          // QR code not detected in frame - ignore
        },
      );

    const isPermissionError = (err: unknown): boolean => {
      const msg = err instanceof Error ? err.message : String(err);
      return (
        msg.includes("Permission") ||
        msg.includes("NotAllowedError") ||
        msg.includes("permission")
      );
    };

    // Backoff: 200, 300, 400, 500, 600, 700, 800, 900 ms ≈ 4.4s total.
    const DELAYS = [200, 300, 400, 500, 600, 700, 800, 900];

    try {
      let lastErr: unknown;
      for (let attempt = 0; attempt <= DELAYS.length; attempt++) {
        try {
          await tryStart();
          setIsScanning(true);
          setHasPermission(true);
          return;
        } catch (e) {
          lastErr = e;
          // Permission denied is terminal — no point retrying. The user
          // explicitly rejected, so surface the prompt UI immediately.
          if (isPermissionError(e)) break;
          if (attempt < DELAYS.length) {
            await new Promise((r) => setTimeout(r, DELAYS[attempt]));
          }
        }
      }
      throw lastErr ?? new Error("Failed to start camera");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start camera";

      // Check for permission denied
      if (isPermissionError(err)) {
        setHasPermission(false);
        setError("Camera permission denied. Please allow camera access.");
      } else {
        setError(message);
      }

      onError?.(message);
    }
  }, [onScan, onError, stopScanner]);

  // Start/stop scanner based on active prop
  useEffect(() => {
    if (active) {
      void startScanner();
    } else {
      void stopScanner();
    }

    return () => {
      void stopScanner();
    };
  }, [active, startScanner, stopScanner]);

  // Cleanup on unmount
  useEffect(
    () => () => {
      const scanner = scannerRef.current;
      if (!scanner) return;
      // Wrap in try/catch — html5-qrcode's stop() throws synchronously
      // when the scanner isn't running, which would otherwise propagate
      // out of the cleanup function and crash the React tree.
      try {
        const state = scanner.getState();
        if (
          state === Html5QrcodeScannerState.SCANNING ||
          state === Html5QrcodeScannerState.PAUSED
        ) {
          scanner
            .stop()
            .catch(() => {})
            .finally(() => {
              scannerRef.current = null;
            });
          return;
        }
      } catch {
        // fall through to clear the ref
      }
      scannerRef.current = null;
    },
    [],
  );

  const handleRetry = useCallback(() => {
    scannedRef.current = false;
    setError(null);
    void startScanner();
  }, [startScanner]);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Scanner viewport */}
      <div
        id="qr-scanner-region"
        className="w-full aspect-square bg-stone-900 rounded-xl overflow-hidden"
      />

      {/* Overlay with scanning frame */}
      {isScanning && (
        <div className="absolute inset-0 pointer-events-none">
          {/* Corner markers */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative w-64 h-64">
              {/* Top-left corner */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-stone-100 rounded-tl-lg" />
              {/* Top-right corner */}
              <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-stone-100 rounded-tr-lg" />
              {/* Bottom-left corner */}
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-stone-100 rounded-bl-lg" />
              {/* Bottom-right corner */}
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-stone-100 rounded-br-lg" />
              {/* Scanning line animation */}
              <div className="absolute left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-green-400 to-transparent animate-scan" />
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-900/95 rounded-xl">
          <CameraOff className="w-12 h-12 text-red-400 mb-4" />
          <p className="text-stone-300 text-sm text-center px-4 mb-4">
            {error}
          </p>
          <button
            onClick={handleRetry}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-stone-800 text-stone-200 text-sm hover:bg-stone-700 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        </div>
      )}

      {/* Permission denied help */}
      {hasPermission === false && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-stone-900/95 rounded-xl p-6">
          <Camera className="w-12 h-12 text-amber-400 mb-4" />
          <p className="text-stone-200 font-medium mb-2">
            Camera Access Needed
          </p>
          <p className="text-stone-400 text-sm text-center mb-4">
            To scan QR codes, please allow camera access in your browser
            settings.
          </p>
          <button
            onClick={handleRetry}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-stone-100 text-stone-900 text-sm font-medium hover:bg-white transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {!isScanning && !error && hasPermission === null && (
        <div className="absolute inset-0 flex items-center justify-center bg-stone-900 rounded-xl">
          <div className="text-center">
            <Camera className="w-12 h-12 text-stone-600 mx-auto mb-3 animate-pulse" />
            <p className="text-stone-400 text-sm">Starting camera...</p>
          </div>
        </div>
      )}
    </div>
  );
}
