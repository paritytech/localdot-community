/**
 * Direction-neutral role helpers.
 *
 * Two independent axes for trade participants:
 *   - Trade-flow role: "buyer" (requester) vs "provider" (offer owner). Stable
 *     UI label — buyer is whoever clicked Request Trade, provider is whoever
 *     posted the offer they clicked on.
 *   - Economic role: "tokenHolder" (locks tokens, gets cash) vs "cashHolder"
 *     (brings cash, gets tokens). Direction-dependent — derived from the
 *     offer's OfferRole ("seller" vs "buyer").
 *
 * Mapping:
 *   SELL offer (offer.role === "seller"): owner has tokens to sell.
 *     → provider = tokenHolder, buyer = cashHolder
 *   BUY  offer (offer.role === "buyer"):  owner has cash to spend.
 *     → provider = cashHolder, buyer = tokenHolder
 *
 * Anywhere the UI needs to decide "should I lock tokens?" or "should I bring
 * cash?", route through these helpers instead of comparing role strings.
 */

import type { Offer, OfferRole } from "../types/offers";

export type TradeFlowRole = "buyer" | "provider";
export type EconomicRole = "tokenHolder" | "cashHolder";

/** Pure mapping: offer.role → economic role of each trade-flow side. */
export function offerEconomicRoles(role: OfferRole): {
  provider: EconomicRole;
  buyer: EconomicRole;
} {
  if (role === "seller") {
    return { provider: "tokenHolder", buyer: "cashHolder" };
  }
  return { provider: "cashHolder", buyer: "tokenHolder" };
}

/** Inverse: economic role of the offer creator — handy for offer cards. */
export function ownerEconomicRole(role: OfferRole): EconomicRole {
  return offerEconomicRoles(role).provider;
}

export interface MyOfferRoles {
  /** Wallet matched offer.owner. */
  iAmProvider: boolean;
  /** Wallet is set and is NOT the owner — potential / active requester. */
  iAmBuyer: boolean;
  /** I'm the side that signs lockTrade (locker on-chain). */
  iAmTokenHolder: boolean;
  /** I'm the side that brings cash to the meeting. */
  iAmCashHolder: boolean;
  /** Trade-flow label or null if no wallet. */
  myTradeRole: TradeFlowRole | null;
  /** Economic role or null if no wallet. */
  myEconomicRole: EconomicRole | null;
}

const EMPTY: MyOfferRoles = {
  iAmProvider: false,
  iAmBuyer: false,
  iAmTokenHolder: false,
  iAmCashHolder: false,
  myTradeRole: null,
  myEconomicRole: null,
};

/**
 * Resolve who I am from an offer + my EVM address.
 *
 * Use on offer pages and the request modal — anywhere a trade hasn't been
 * locked yet, so we don't have a ContractTrade with locker/counterparty.
 *
 * `myEvmAddress` should be the lowercased hex EVM address (the same format
 * we use in the contract for offer.owner). If you only have an SS58
 * address, run it through ss58ToEvmAddress() first.
 */
export function myOfferRoles(
  offer: Pick<Offer, "owner" | "role">,
  myEvmAddress: string | null,
): MyOfferRoles {
  if (!myEvmAddress) return EMPTY;
  const me = myEvmAddress.toLowerCase();
  const owner = offer.owner.toLowerCase();
  const iAmProvider = me === owner;
  const iAmBuyer = !iAmProvider;
  const econ = offerEconomicRoles(offer.role);
  const myEconomicRole: EconomicRole = iAmProvider ? econ.provider : econ.buyer;
  return {
    iAmProvider,
    iAmBuyer,
    iAmTokenHolder: myEconomicRole === "tokenHolder",
    iAmCashHolder: myEconomicRole === "cashHolder",
    myTradeRole: iAmProvider ? "provider" : "buyer",
    myEconomicRole,
  };
}

export interface MyTradeRoles {
  iAmTokenHolder: boolean;
  iAmCashHolder: boolean;
  iAmParticipant: boolean;
  myEconomicRole: EconomicRole | null;
}

/**
 * Resolve economic role directly from an on-chain trade.
 *
 * locker = tokenHolder (signed lockTrade, transferred tokens in).
 * counterparty = cashHolder (will receive tokens at the end).
 *
 * Use on trade detail pages once a trade exists — independent of any offer.
 */
export function myTradeRoles(
  trade: { locker: string; counterparty: string },
  myEvmAddress: string | null,
): MyTradeRoles {
  if (!myEvmAddress) {
    return {
      iAmTokenHolder: false,
      iAmCashHolder: false,
      iAmParticipant: false,
      myEconomicRole: null,
    };
  }
  const me = myEvmAddress.toLowerCase();
  const iAmTokenHolder = trade.locker.toLowerCase() === me;
  const iAmCashHolder = trade.counterparty.toLowerCase() === me;
  return {
    iAmTokenHolder,
    iAmCashHolder,
    iAmParticipant: iAmTokenHolder || iAmCashHolder,
    myEconomicRole: iAmTokenHolder
      ? "tokenHolder"
      : iAmCashHolder
        ? "cashHolder"
        : null,
  };
}

/**
 * Given an offer + a trade derived from it, classify each on-chain side as
 * buyer or provider in the trade-flow sense.
 *
 * - The address that matches offer.owner is the provider.
 * - The other trade party is the buyer (requester).
 *
 * Returns null for buyerIsLocker if the trade doesn't reference the
 * provider (shouldn't happen for offer-linked trades, but defensive).
 */
export function tradeFlowSides(
  offer: Pick<Offer, "owner">,
  trade: { locker: string; counterparty: string },
): {
  providerAddress: string;
  buyerAddress: string;
  buyerIsLocker: boolean;
} {
  const owner = offer.owner.toLowerCase();
  if (trade.locker.toLowerCase() === owner) {
    return {
      providerAddress: trade.locker,
      buyerAddress: trade.counterparty,
      buyerIsLocker: false,
    };
  }
  return {
    providerAddress: trade.counterparty,
    buyerAddress: trade.locker,
    buyerIsLocker: true,
  };
}
