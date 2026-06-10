/**
 * AddAgentModal — lets an offer owner add an exchange agent that registered
 * after the offer was created. Lists active agents not already on the offer;
 * each "Add" calls addAgentToOffer on-chain (one agent per transaction).
 */

import { useEffect, useState } from "react";

import { type ContractAgent, useP2PMarket } from "../../hooks/useP2PMarket";
import { AgentAvatar } from "../agents/AgentVisuals";
import { Modal, ModalBody, ModalHeader } from "../common/Modal";
import { Spinner } from "../common/Spinner";

export function AddAgentModal({
  open,
  onClose,
  offerId,
  existingAgents,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  offerId: string;
  existingAgents: string[];
  onAdded: () => void;
}): JSX.Element {
  const { getAllAgents, addAgentToOffer } = useP2PMarket();
  const [available, setAvailable] = useState<ContractAgent[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAvailable(null);
    setError(null);
    const existing = new Set(existingAgents.map((a) => a.toLowerCase()));
    void getAllAgents()
      .then((all) =>
        setAvailable(
          all.filter((a) => a.active && !existing.has(a.wallet.toLowerCase())),
        ),
      )
      .catch(() => setError("Failed to load agents"));
  }, [open, existingAgents, getAllAgents]);

  const handleAdd = async (wallet: string) => {
    setPending(wallet);
    setError(null);
    try {
      await addAgentToOffer(BigInt(offerId), wallet);
      setAvailable((cur) => cur?.filter((a) => a.wallet !== wallet) ?? cur);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add agent");
    } finally {
      setPending(null);
    }
  };

  return (
    <Modal isOpen={open} onClose={onClose} size="sm">
      <ModalHeader onClose={onClose}>
        <h2 className="text-lg font-semibold text-stone-200">Add an agent</h2>
      </ModalHeader>
      <ModalBody>
        <p className="text-xs text-stone-500 mb-4">
          Add an exchange agent that registered after this offer was created.
          Buyers will then be able to route this trade through them.
        </p>

        {error && (
          <div className="rounded-lg bg-red-950/50 border border-red-800 text-red-200 px-3 py-2 text-sm mb-3">
            {error}
          </div>
        )}

        {available === null ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : available.length === 0 ? (
          <p className="text-sm text-stone-500 text-center py-8">
            No other active agents available to add.
          </p>
        ) : (
          <div className="space-y-2">
            {available.map((a) => (
              <div
                key={a.wallet}
                className="flex items-center justify-between gap-3 rounded-xl border border-stone-800 bg-stone-900/60 px-3 py-2.5"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <AgentAvatar name={a.name} wallet={a.wallet} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm text-stone-200 truncate">{a.name}</p>
                    <p className="mono text-[11px] text-stone-500">
                      ${a.flatFee.toString()} fee · holds {a.holdHours}h
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => void handleAdd(a.wallet)}
                  disabled={pending !== null}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-stone-100 text-stone-900 text-sm font-medium hover:bg-white transition-colors disabled:opacity-50"
                >
                  {pending === a.wallet ? "Adding…" : "Add"}
                </button>
              </div>
            ))}
          </div>
        )}
      </ModalBody>
    </Modal>
  );
}
