/**
 * Cancel / Send-proposal button pair used inside MeetingPlaceCard and
 * MeetingTimeCard edit modes.
 */
export function ProposalActions({
  onCancel,
  onSend,
  sendDisabled,
  sendLabel = "Send proposal",
}: {
  onCancel: () => void;
  onSend: () => void;
  sendDisabled?: boolean;
  sendLabel?: string;
}): JSX.Element {
  return (
    <div className="flex gap-2">
      <button
        onClick={onCancel}
        className="flex-1 rounded-xl border border-stone-800 px-3 py-2 text-sm text-stone-300 hover:bg-stone-900 transition-colors"
      >
        Cancel
      </button>
      <button
        onClick={onSend}
        disabled={sendDisabled}
        className="flex-1 rounded-xl bg-stone-100 text-stone-900 px-3 py-2 text-sm font-medium hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {sendLabel}
      </button>
    </div>
  );
}
