import { MapPin, Pencil } from "lucide-react";
import { useState } from "react";

import { OpenInMapsLink } from "../../common/OpenInMapsLink";
import { BaseMap } from "../../location/BaseMap";
import { PendingProposalLine } from "./PendingProposalLine";
import { ProposalActions } from "./ProposalActions";
import type { MeetingLocation, Proposal, Role } from "./types";

export function MeetingPlaceCard({
  location,
  isEditing,
  myRole,
  pendingProposal,
  onEdit,
  onCancel,
  onSend,
}: {
  location: MeetingLocation | null;
  isEditing: boolean;
  myRole: Role;
  pendingProposal: Proposal | null;
  onEdit: () => void;
  onCancel: () => void;
  onSend: (location: MeetingLocation) => void;
}): JSX.Element {
  const [draftLabel, setDraftLabel] = useState(location?.label ?? "");
  const [draftAddress, setDraftAddress] = useState(location?.address ?? "");
  const empty = !location;

  const editLabel = empty ? "Set place" : "Propose new";

  return (
    <div className="rounded-2xl border border-stone-800 bg-stone-900/40 overflow-hidden">
      <div className="relative h-56 lg:h-72">
        {location ? (
          <>
            <BaseMap
              center={[location.lat, location.lon]}
              zoom={14}
              selectedLocation={{ lat: location.lat, lon: location.lon }}
              markerVariant="amber"
              height="100%"
              className="!rounded-none !border-0 h-full"
            />
            <div className="pointer-events-none absolute top-3 left-3 px-2.5 py-1 bg-stone-950/80 backdrop-blur rounded-md text-[10px] uppercase tracking-[0.14em] text-stone-300 font-medium">
              Meeting place
            </div>
            <OpenInMapsLink lat={location.lat} lon={location.lon} />
          </>
        ) : (
          <div className="w-full h-full bg-stone-900/60 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2 text-stone-600">
              <MapPin className="w-6 h-6" />
              <span className="text-xs">No place set yet</span>
            </div>
          </div>
        )}
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {empty ? (
              <p className="text-sm text-stone-500 italic">
                Pick a public, well-lit spot you both know.
              </p>
            ) : (
              <>
                <p className="text-stone-100 text-base font-medium truncate">
                  {location.label}
                </p>
                <p className="text-stone-500 text-sm mt-0.5 truncate">
                  {location.address}
                </p>
              </>
            )}
          </div>
          {!isEditing && (
            <button
              onClick={onEdit}
              className="text-xs text-stone-300 hover:text-stone-100 px-3 py-1.5 rounded-lg border border-stone-800 hover:border-stone-700 hover:bg-stone-800/50 transition-colors flex items-center gap-1.5 shrink-0"
            >
              <Pencil className="w-3 h-3" />
              {editLabel}
            </button>
          )}
        </div>

        {pendingProposal && pendingProposal.from === myRole && !isEditing && (
          <PendingProposalLine>
            You proposed{" "}
            <span className="text-stone-200">
              {pendingProposal.location?.label}
            </span>
          </PendingProposalLine>
        )}

        {isEditing && (
          <div className="mt-4 space-y-2 border-t border-stone-800 pt-4">
            <input
              type="text"
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              placeholder="Café name, building, landmark…"
              className="w-full bg-stone-900 border border-stone-800 rounded-xl px-4 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-stone-600"
            />
            <input
              type="text"
              value={draftAddress}
              onChange={(e) => setDraftAddress(e.target.value)}
              placeholder="Street, city"
              className="w-full bg-stone-900 border border-stone-800 rounded-xl px-4 py-2.5 text-stone-100 text-sm focus:outline-none focus:border-stone-600"
            />
            <ProposalActions
              onCancel={onCancel}
              onSend={() =>
                onSend({
                  label: draftLabel,
                  address: draftAddress,
                  lat: location?.lat ?? 0,
                  lon: location?.lon ?? 0,
                })
              }
              sendDisabled={!draftLabel.trim()}
            />
          </div>
        )}
      </div>
    </div>
  );
}
