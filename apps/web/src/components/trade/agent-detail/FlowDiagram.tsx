import { shortenAddress } from "../../../lib/format";

type Role = "buyer" | "provider" | "agent";

export function FlowDiagram({
  role,
  state,
  buyerAddr,
  providerAddr,
  agentAddr,
}: {
  role: Role;
  state: number;
  buyerAddr: string | null;
  providerAddr: string | null;
  agentAddr: string | null;
}): JSX.Element {
  // stage 1 = LOCKED (buyer hands cash); 2 = RELEASED (provider picks up); 3 = settled
  const stage = state === 0 ? 1 : state === 1 ? 2 : 3;
  return (
    <div className="rounded-2xl border border-stone-800/80 bg-stone-900/40 p-5">
      <p className="text-[10px] uppercase tracking-[0.12em] text-stone-500 font-medium mb-4">
        Trade flow
      </p>
      <div className="grid grid-cols-[1fr_140px_1fr_140px_1fr] items-center gap-2">
        <FlowNode role="Buyer" addr={buyerAddr} isMe={role === "buyer"} />
        <FlowEdge
          label="Cash"
          sub={stage === 1 ? "in progress" : "delivered"}
          active={stage === 1}
          done={stage > 1}
        />
        <FlowNode
          role="Agent"
          addr={agentAddr}
          isMe={role === "agent"}
          active
        />
        <FlowEdge
          label="Cash"
          sub={
            stage === 2
              ? "ready for pickup"
              : stage === 3
                ? "settled"
                : "after release"
          }
          active={stage === 2}
          done={stage > 2}
        />
        <FlowNode
          role="Provider"
          addr={providerAddr}
          isMe={role === "provider"}
        />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-stone-900 pt-3 text-[11px]">
        <FlowStep done label="Tokens locked in escrow" />
        <FlowStep
          done={stage > 1}
          active={stage === 1}
          label="Buyer hands cash to agent"
        />
        <FlowStep
          done={stage > 2}
          active={stage === 2}
          label="Provider picks up cash"
        />
      </div>
    </div>
  );
}

function FlowNode({
  role,
  addr,
  isMe,
  active,
}: {
  role: string;
  addr: string | null;
  isMe: boolean;
  active?: boolean;
}): JSX.Element {
  return (
    <div
      className={`relative rounded-xl border px-4 py-3 ${
        active
          ? "border-amber-500/40 bg-amber-500/[0.06]"
          : "border-stone-800 bg-stone-900/40"
      }`}
    >
      <p className="text-[10px] uppercase tracking-[0.12em] text-stone-500 font-medium">
        {role}
      </p>
      <p className="mono mt-1 text-sm text-stone-100 truncate">
        {isMe ? "You" : addr ? shortenAddress(addr) : "—"}
      </p>
      {isMe && (
        <span className="absolute -top-2 right-3 rounded-md border border-emerald-500/25 bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-emerald-300">
          You
        </span>
      )}
    </div>
  );
}

function FlowEdge({
  label,
  sub,
  active,
  done,
}: {
  label: string;
  sub: string;
  active: boolean;
  done: boolean;
}): JSX.Element {
  const labelColor = active
    ? "text-amber-300"
    : done
      ? "text-emerald-300"
      : "text-stone-600";
  const lineColor = active
    ? "rgba(251,191,36,0.6)"
    : done
      ? "rgba(52,211,153,0.45)"
      : "rgba(120,113,108,0.3)";
  const arrowColor = active
    ? "rgba(251,191,36,0.85)"
    : done
      ? "rgba(52,211,153,0.7)"
      : "rgba(120,113,108,0.5)";
  return (
    <div className="flex flex-col items-center px-2 pt-3">
      <p
        className={`text-[10px] uppercase tracking-[0.12em] font-medium ${labelColor}`}
      >
        {done ? "✓ " : ""}
        {label}
      </p>
      <svg
        className="mt-1 h-3 w-full"
        viewBox="0 0 100 12"
        preserveAspectRatio="none"
      >
        <line
          x1="0"
          y1="6"
          x2="100"
          y2="6"
          stroke={lineColor}
          strokeWidth="1.5"
          strokeDasharray={active ? "0" : "3 3"}
        />
        <polygon points="100,6 92,2 92,10" fill={arrowColor} />
      </svg>
      <p className="mt-1 text-[10px] text-stone-500">{sub}</p>
    </div>
  );
}

function FlowStep({
  done,
  active,
  label,
}: {
  done?: boolean;
  active?: boolean;
  label: string;
}): JSX.Element {
  return (
    <div className="flex items-start gap-2">
      <span
        className={`mt-1.5 inline-block h-1.5 w-1.5 rounded-full ${
          done ? "bg-emerald-400" : active ? "bg-amber-400" : "bg-stone-700"
        }`}
      />
      <span
        className={
          done ? "text-stone-300" : active ? "text-amber-200" : "text-stone-500"
        }
      >
        {label}
      </span>
    </div>
  );
}
