/**
 * "You proposed X — Awaiting reply" inline banner used inside MeetingPlaceCard
 * and MeetingTimeCard when the local user has an outgoing proposal pending.
 */
export function PendingProposalLine({
  children,
}: {
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="mt-3 rounded-xl bg-stone-800/50 border border-stone-700/60 px-3 py-2 flex items-center justify-between">
      <span className="text-xs text-stone-400 truncate">{children}</span>
      <span className="text-[10px] text-stone-500 uppercase tracking-wider whitespace-nowrap ml-2">
        Awaiting reply
      </span>
    </div>
  );
}
