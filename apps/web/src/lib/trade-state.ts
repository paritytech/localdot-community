/**
 * Trade state enum (matches P2PMarket.sol):
 *   0 = LOCKED, 1 = RELEASED, 2 = COMPLETED, 3 = REFUNDED, 4 = CANCELLED, 5 = INSURED
 *
 * The label for state=1 differs by context: direct trades read "Tokens out"
 * (provider has released to buyer), agent trades read "Cash ready" (cash sits
 * with the agent awaiting provider pickup).
 */
export type TradeStateContext = "direct" | "agent";

export function tradeStateLabel(
  state: number,
  context: TradeStateContext = "direct",
): string {
  switch (state) {
    case 0:
      return "Active";
    case 1:
      return context === "agent" ? "Cash ready" : "Tokens out";
    case 2:
      return "Settled";
    case 3:
      return "Refunded";
    case 4:
      return "Cancelled";
    case 5:
      return "Insured";
    default:
      return "Unknown";
  }
}
