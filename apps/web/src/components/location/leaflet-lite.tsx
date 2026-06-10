import L from "leaflet";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

/**
 * Minimal in-house React bindings for Leaflet.
 *
 * Replaces the `react-leaflet` package, which is licensed under the
 * Hippocratic License 2.1 — a non-OSI license that is incompatible with our
 * GPL-3.0 release. Leaflet itself is BSD-2-Clause (OSI, GPL-compatible), so we
 * keep the map engine and only reimplement the thin React glue.
 *
 * This intentionally implements ONLY the subset of the react-leaflet API used
 * in this codebase: `MapContainer`, `TileLayer`, `Marker`, `Circle`, `Popup`,
 * `useMap`, and `useMapEvents`. The component prop shapes match react-leaflet
 * so the consuming components (BaseMap, MapView) need no other changes.
 */

const MapContext = createContext<L.Map | null>(null);
const MarkerContext = createContext<L.Marker | null>(null);

/**
 * Invokes a handler from a Leaflet event-handler map by event name. Indexing
 * `LeafletEventHandlerFnMap` by a `string` yields the intersection of every
 * event type, so we narrow to the generic `LeafletEvent` signature here (the
 * one place the cast lives) rather than at each call site.
 */
function invokeHandler(
  handlers: L.LeafletEventHandlerFnMap | undefined,
  type: string,
  event: L.LeafletEvent,
): void {
  const fn = handlers?.[type as keyof L.LeafletEventHandlerFnMap] as
    | ((event: L.LeafletEvent) => void)
    | undefined;
  fn?.(event);
}

/** Access the Leaflet map instance from inside a `<MapContainer>`. */
export function useMap(): L.Map {
  const map = useContext(MapContext);
  if (!map) {
    throw new Error("useMap() must be used inside a <MapContainer>");
  }
  return map;
}

/**
 * Subscribe to Leaflet map events. Handlers are kept in a ref so the
 * subscription is bound once per map and never re-bound on re-render.
 */
export function useMapEvents(handlers: L.LeafletEventHandlerFnMap): L.Map {
  const map = useMap();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const types = Object.keys(handlersRef.current);
    const wrappers: Record<string, (event: L.LeafletEvent) => void> = {};
    for (const type of types) {
      const wrapper = (event: L.LeafletEvent): void =>
        invokeHandler(handlersRef.current, type, event);
      wrappers[type] = wrapper;
      map.on(type, wrapper);
    }
    return () => {
      for (const type of Object.keys(wrappers)) {
        map.off(type, wrappers[type]);
      }
    };
  }, [map]);

  return map;
}

interface MapContainerProps {
  center: L.LatLngExpression;
  zoom: number;
  className?: string;
  scrollWheelZoom?: boolean;
  children?: ReactNode;
}

/**
 * Creates the Leaflet map and provides it to descendants via context.
 * Children render only once the map exists, so `useMap()` is always defined.
 * `center`/`zoom` are initial-only (matching react-leaflet); pan/zoom updates
 * go through the map instance (e.g. `flyTo`, `fitBounds`).
 */
export function MapContainer({
  center,
  zoom,
  className,
  scrollWheelZoom = true,
  children,
}: MapContainerProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [map, setMap] = useState<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const instance = L.map(containerRef.current, {
      center,
      zoom,
      scrollWheelZoom,
    });
    setMap(instance);
    // Leaflet needs a size recalc once the container has been laid out.
    const raf = requestAnimationFrame(() => instance.invalidateSize());
    return () => {
      cancelAnimationFrame(raf);
      instance.remove();
      setMap(null);
    };
    // Initial-only: do not re-create the map when center/zoom props change.
  }, []);

  return (
    <div ref={containerRef} className={className}>
      {map && <MapContext.Provider value={map}>{children}</MapContext.Provider>}
    </div>
  );
}

interface TileLayerProps {
  url: string;
  attribution?: string;
}

/** Adds a tile layer to the map. */
export function TileLayer({ url, attribution }: TileLayerProps): null {
  const map = useMap();
  useEffect(() => {
    const layer = L.tileLayer(url, { attribution }).addTo(map);
    return () => {
      layer.remove();
    };
  }, [map, url, attribution]);
  return null;
}

interface MarkerProps {
  position: L.LatLngExpression;
  icon?: L.Icon | L.DivIcon;
  eventHandlers?: L.LeafletEventHandlerFnMap;
  children?: ReactNode;
}

/**
 * Renders a Leaflet marker. The marker is created once; position, icon and
 * event handlers are updated in place to avoid flicker on re-render. Children
 * (a `<Popup>`) receive the marker via context.
 */
export function Marker({
  position,
  icon,
  eventHandlers,
  children,
}: MarkerProps): JSX.Element | null {
  const map = useMap();
  const [marker, setMarker] = useState<L.Marker | null>(null);
  const handlersRef = useRef(eventHandlers);
  handlersRef.current = eventHandlers;

  useEffect(() => {
    const instance = L.marker(position, icon ? { icon } : undefined).addTo(map);
    setMarker(instance);
    return () => {
      instance.remove();
      setMarker(null);
    };
    // Created once per map; position/icon are synced by the effects below.
  }, [map]);

  useEffect(() => {
    marker?.setLatLng(position);
  }, [marker, position]);

  useEffect(() => {
    if (marker && icon) marker.setIcon(icon);
  }, [marker, icon]);

  useEffect(() => {
    if (!marker) return;
    const handlers = handlersRef.current;
    if (!handlers) return;
    const wrappers: Record<string, (event: L.LeafletEvent) => void> = {};
    for (const type of Object.keys(handlers)) {
      const wrapper = (event: L.LeafletEvent): void =>
        invokeHandler(handlersRef.current, type, event);
      wrappers[type] = wrapper;
      marker.on(type, wrapper);
    }
    return () => {
      for (const type of Object.keys(wrappers)) {
        marker.off(type, wrappers[type]);
      }
    };
  }, [marker]);

  return marker ? (
    <MarkerContext.Provider value={marker}>{children}</MarkerContext.Provider>
  ) : null;
}

interface CircleProps {
  center: L.LatLngExpression;
  radius: number;
  pathOptions?: L.PathOptions;
}

/** Renders a Leaflet circle (created once, restyled in place). */
export function Circle({ center, radius, pathOptions }: CircleProps): null {
  const map = useMap();
  const circleRef = useRef<L.Circle | null>(null);

  useEffect(() => {
    const circle = L.circle(center, { radius, ...pathOptions }).addTo(map);
    circleRef.current = circle;
    return () => {
      circle.remove();
      circleRef.current = null;
    };
    // Created once per map; geometry/style are synced by the effects below.
  }, [map]);

  useEffect(() => {
    circleRef.current?.setLatLng(center).setRadius(radius);
  }, [center, radius]);

  useEffect(() => {
    if (pathOptions) circleRef.current?.setStyle(pathOptions);
  }, [pathOptions]);

  return null;
}

interface PopupProps {
  children?: ReactNode;
  eventHandlers?: L.LeafletEventHandlerFnMap;
}

/**
 * Binds a popup to the enclosing `<Marker>`. Popup content is rendered through
 * a React portal into the popup's DOM node, so it stays in the React tree and
 * keeps access to context (e.g. react-router's `<Link>`).
 */
export function Popup({
  children,
  eventHandlers,
}: PopupProps): JSX.Element | null {
  const marker = useContext(MarkerContext);
  const [container] = useState(() => document.createElement("div"));
  const handlersRef = useRef(eventHandlers);
  handlersRef.current = eventHandlers;

  useEffect(() => {
    if (!marker) return;
    marker.bindPopup(container);
    const popup = marker.getPopup();
    const handlers = handlersRef.current;
    const wrappers: Record<string, (event: L.LeafletEvent) => void> = {};
    if (popup && handlers) {
      for (const type of Object.keys(handlers)) {
        const wrapper = (event: L.LeafletEvent): void =>
          invokeHandler(handlersRef.current, type, event);
        wrappers[type] = wrapper;
        popup.on(type, wrapper);
      }
    }
    return () => {
      for (const type of Object.keys(wrappers)) {
        popup?.off(type, wrappers[type]);
      }
      marker.unbindPopup();
    };
  }, [marker, container]);

  return marker ? createPortal(children, container) : null;
}
