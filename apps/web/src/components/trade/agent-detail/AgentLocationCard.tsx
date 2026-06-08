import { MapPin } from "lucide-react";

import { OpenInMapsLink } from "../../common/OpenInMapsLink";
import { BaseMap } from "../../location/BaseMap";

export interface AgentLocation {
  label: string;
  address: string;
  lat: number;
  lon: number;
}

export function AgentLocationCard({
  location,
}: {
  location: AgentLocation | null;
}): JSX.Element {
  if (!location) {
    return (
      <div className="rounded-2xl border border-stone-800/80 bg-stone-900/40 overflow-hidden">
        <div className="h-56 lg:h-72 flex flex-col items-center justify-center gap-2 text-stone-600 bg-stone-900/60">
          <MapPin className="w-6 h-6" />
          <span className="text-xs">
            Agent hasn&apos;t published a location yet
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-stone-800/80 bg-stone-900/40 overflow-hidden">
      <div className="relative h-56 lg:h-72">
        <BaseMap
          selectedLocation={{ lat: location.lat, lon: location.lon }}
          markerVariant="amber"
          height="100%"
          flyToSelection={false}
          className="!rounded-none !border-0 h-full"
        />
        <div className="pointer-events-none absolute top-3 left-3 px-2.5 py-1 bg-stone-950/80 backdrop-blur rounded-md text-[10px] uppercase tracking-[0.12em] text-stone-300 font-medium">
          Agent location
        </div>
        <OpenInMapsLink lat={location.lat} lon={location.lon} />
      </div>
      <div className="p-5">
        <p className="text-stone-100 text-base font-medium">{location.label}</p>
        {location.address && (
          <p className="text-stone-500 text-sm mt-0.5">{location.address}</p>
        )}
      </div>
    </div>
  );
}
