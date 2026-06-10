import { Pencil } from "lucide-react";
import { useMemo, useState } from "react";

import {
  fmtDateTime,
  fmtDay,
  fmtTime,
  toDateTimeLocalString,
} from "../../../lib/format";
import { PendingProposalLine } from "./PendingProposalLine";
import { ProposalActions } from "./ProposalActions";
import type { Proposal, Role } from "./types";

export function MeetingTimeCard({
  scheduledAt,
  isEditing,
  myRole,
  pendingProposal,
  onEdit,
  onCancel,
  onSend,
}: {
  scheduledAt: number | null;
  isEditing: boolean;
  myRole: Role;
  pendingProposal: Proposal | null;
  onEdit: () => void;
  onCancel: () => void;
  onSend: (scheduledAt: number) => void;
}): JSX.Element {
  const [draftDate, setDraftDate] = useState(() =>
    toDateTimeLocalString(new Date(scheduledAt ?? Date.now() + 60 * 60_000)),
  );
  const draftScheduledAt = useMemo(() => {
    const t = new Date(draftDate).getTime();
    return Number.isNaN(t) ? Date.now() + 60 * 60_000 : t;
  }, [draftDate]);

  const empty = scheduledAt === null;
  const minutesUntil =
    scheduledAt !== null ? Math.round((scheduledAt - Date.now()) / 60_000) : 0;
  const editLabel = empty ? "Set time" : "Propose new";

  return (
    <div className="rounded-2xl border border-stone-800 bg-stone-900/40 p-5">
      <p className="text-[10px] uppercase tracking-[0.16em] text-stone-500 font-medium mb-4">
        Meeting time
      </p>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          {empty ? (
            <p className="text-sm text-stone-500 italic">
              Pick a time you can both make.
            </p>
          ) : (
            <>
              <div className="flex items-baseline gap-3">
                <span className="mono text-3xl text-stone-100 font-medium leading-none">
                  {fmtTime(scheduledAt!)}
                </span>
                <span className="text-sm text-stone-500">
                  · {fmtDay(scheduledAt!)}
                </span>
              </div>
              <p className="text-stone-500 text-xs mt-1.5">
                {minutesUntil >= 0
                  ? `in ${minutesUntil} min`
                  : `${Math.abs(minutesUntil)}m ago`}
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
          <span className="mono text-stone-200">
            {fmtDateTime(pendingProposal.scheduledAt!)}
          </span>
        </PendingProposalLine>
      )}

      {isEditing && (
        <div className="mt-4 space-y-3 border-t border-stone-800 pt-4">
          <input
            type="datetime-local"
            value={draftDate}
            onChange={(e) => setDraftDate(e.target.value)}
            className="w-full bg-stone-900 border border-stone-800 rounded-xl px-4 py-3 text-stone-100 text-sm font-mono focus:outline-none focus:border-stone-600"
          />
          <ProposalActions
            onCancel={onCancel}
            onSend={() => onSend(draftScheduledAt)}
          />
        </div>
      )}
    </div>
  );
}
