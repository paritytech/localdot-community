import {
  Calendar,
  CheckCircle2,
  Image as ImageIcon,
  MapPin,
  X,
} from "lucide-react";

import { fmtDateTime, shortenAddress } from "../../../lib/format";
import type { Proposal, Role } from "./types";

export function ProposalHistoryCard({
  proposals,
  myRole,
  counterpartyAddr,
}: {
  proposals: Proposal[];
  myRole: Role;
  counterpartyAddr: string;
}): JSX.Element | null {
  const settled = proposals.filter((p) => p.status !== "pending");
  if (settled.length === 0) return null;

  return (
    <div className="rounded-2xl border border-stone-800 bg-stone-900/40 p-5">
      <p className="text-[10px] uppercase tracking-[0.16em] text-stone-500 font-medium mb-3">
        Proposal history
      </p>
      <div className="space-y-2.5">
        {settled.slice(0, 5).map((p) => (
          <HistoryRow
            key={p.id}
            proposal={p}
            myRole={myRole}
            counterpartyAddr={counterpartyAddr}
          />
        ))}
      </div>
    </div>
  );
}

function HistoryRow({
  proposal,
  myRole,
  counterpartyAddr,
}: {
  proposal: Proposal;
  myRole: Role;
  counterpartyAddr: string;
}): JSX.Element {
  const isMine = proposal.from === myRole;
  const proposer = isMine ? "You" : shortenAddress(counterpartyAddr);
  const accepted = proposal.status === "accepted";
  const summary =
    proposal.kind === "time"
      ? proposal.scheduledAt
        ? fmtDateTime(proposal.scheduledAt)
        : "—"
      : proposal.kind === "location"
        ? (proposal.location?.label ?? "—")
        : proposal.recognition
          ? proposal.recognition.length > 32
            ? proposal.recognition.slice(0, 32) + "…"
            : proposal.recognition
          : "Updated note";
  const Icon =
    proposal.kind === "time"
      ? Calendar
      : proposal.kind === "location"
        ? MapPin
        : ImageIcon;

  return (
    <div className="flex items-start gap-2 text-xs">
      <Icon className="w-3.5 h-3.5 text-stone-500 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="mono text-stone-300 truncate">{proposer}</span>
          <span className="text-stone-500 truncate">{summary}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {accepted ? (
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
        ) : (
          <X className="w-3 h-3 text-stone-500" />
        )}
        <span
          className={`text-[10px] uppercase tracking-wider ${
            accepted ? "text-emerald-400" : "text-stone-500"
          }`}
        >
          {accepted ? "accepted" : "declined"}
        </span>
      </div>
    </div>
  );
}
