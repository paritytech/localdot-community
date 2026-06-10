/**
 * Host API abstraction layer
 *
 * Provides runtime detection and access to the Polkadot Triangle Host API.
 * Products run in sandboxed iframes — chain interactions go through these APIs.
 */

export { initHostDetection, isHosted, isLikelyHosted } from "./detect";
export {
  assetHubProvider,
  getNativeToEvmRatio,
  waitForNativeToEvmRatio,
  getEvmDecimals,
} from "./assethub-provider";

export { FunctionMissingError } from "./_internal";

// Offers
export {
  addAgentToOffer as addAgentToOfferViaSubstrate,
  createOffer as createOfferViaSubstrate,
  getAllOffers as getAllOffersViaSubstrate,
  removeOffer as removeOfferViaSubstrate,
  getExpiredOfferIds as getExpiredOfferIdsViaSubstrate,
  pruneExpiredOffers as pruneExpiredOffersViaSubstrate,
} from "./offers";
export type { ContractOffer, CreateOfferParams } from "./offers";

// Agents (incl. insurance staking)
export {
  registerAgent as registerAgentViaSubstrate,
  getAgent as getAgentViaSubstrate,
  getAllAgents as getAllAgentsViaSubstrate,
  getOffersByAgent as getOffersByAgentViaSubstrate,
  updateAgent as updateAgentViaSubstrate,
  deactivateAgent as deactivateAgentViaSubstrate,
  reactivateAgent as reactivateAgentViaSubstrate,
  removeAgent as removeAgentViaSubstrate,
  stakeInsurance as stakeInsuranceViaSubstrate,
  unstakeInsurance as unstakeInsuranceViaSubstrate,
} from "./agents";
export type { ContractAgent, RegisterAgentParams } from "./agents";

// Escrow / trades
export {
  lockTrade as lockTradeViaSubstrate,
  confirmTrade as confirmTradeViaSubstrate,
  confirmCashReceived as confirmCashReceivedViaSubstrate,
  confirmPickup as confirmPickupViaSubstrate,
  setEvidenceCID as setEvidenceCIDViaSubstrate,
  requestCancel as requestCancelViaSubstrate,
  refundTrade as refundTradeViaSubstrate,
  getTrade as getTradeViaSubstrate,
  getUserTrades as getUserTradesViaSubstrate,
} from "./escrow";
export type { ContractTrade } from "./escrow";

// ZKPassport
export {
  isZKPassportVerified,
  getZKPassportAttestation,
  isUniqueIdUsed,
  getWalletByUniqueId,
  submitZKPassportAttestation,
  revokeZKPassportAttestation,
} from "./zkpassport";
export type { ZKPassportAttestation } from "./zkpassport";

export {
  fetchFromHostStorage,
  fetchJsonFromHostStorage,
  uploadJsonToHostStorage,
  uploadToHostStorage,
} from "./storage";
export type { HostStorageUploadResult } from "./types";
export {
  requestRemotePermissions,
  getGeolocation,
  getCameraStream,
} from "./permissions";
