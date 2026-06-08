import { EscrowStampBar } from "./EscrowStampBar";

type TradeState =
  | "LOCKED"
  | "RELEASED"
  | "COMPLETED"
  | "REFUNDED"
  | "CANCELLED";

interface TradeCardProps {
  id: string;
  counterparty: string;
  role: "buyer" | "provider";
  amount: string;
  state: TradeState;
  createdAt: number;
}

export function TradeCard({
  id,
  counterparty,
  role,
  amount,
  state,
  createdAt,
}: TradeCardProps): JSX.Element {
  return (
    <div className="card block">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="mono text-xs text-stone-500">#{id}</span>
            <span
              className={`badge text-[11px] ${
                state === "LOCKED"
                  ? "badge-created"
                  : state === "RELEASED"
                    ? "badge-funded"
                    : state === "COMPLETED"
                      ? "badge-released"
                      : "badge-refunded"
              }`}
            >
              {state}
            </span>
          </div>
          <p className="text-sm text-stone-400 mt-1">
            {role === "buyer" ? "Buying from" : "Selling to"}{" "}
            <span className="mono text-stone-300">
              {counterparty.slice(0, 8)}...
            </span>
          </p>
        </div>
        <div className="text-right">
          <p className="mono text-xl text-stone-50">{amount}</p>
          <p className="text-[11px] text-stone-500">HOLLAR</p>
        </div>
      </div>
      <EscrowStampBar state={state} compact />
      <p className="text-[11px] text-stone-500 mt-2">
        {new Date(createdAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
    </div>
  );
}
