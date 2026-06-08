import { ethers } from "ethers";
import { useCallback } from "react";

import {
  getSignerAndAddress,
  useWalletContext,
} from "../context/WalletContext";
import { env } from "../env";
import type { ContractAgent } from "../lib/host";
import {
  addAgentToOfferViaSubstrate,
  createOfferViaSubstrate,
  deactivateAgentViaSubstrate,
  getAllAgentsViaSubstrate,
  getAllOffersViaSubstrate,
  getExpiredOfferIdsViaSubstrate,
  getOffersByAgentViaSubstrate,
  pruneExpiredOffersViaSubstrate,
  reactivateAgentViaSubstrate,
  registerAgentViaSubstrate,
  removeAgentViaSubstrate,
  removeOfferViaSubstrate,
  stakeInsuranceViaSubstrate,
  unstakeInsuranceViaSubstrate,
  updateAgentViaSubstrate,
} from "../lib/host";

const MAX_FLAT_FEE = 1000;

export type OfferType = 0 | 1; // 0 = SELL, 1 = BUY

export interface CreateOfferParams {
  offerType: OfferType;
  amountAvailable: string;
  minAmount: string;
  fiatCurrency: string;
  flatFee: string;
  metadataCID: string;
  agentAddresses: string[];
}

export interface RegisterAgentParams {
  name: string;
  metadataCID: string;
  flatFee: string;
  /** Hours agent will hold cash before late fees apply (whole hours, >= 2). */
  holdHours: string;
  /** Flat per-hour fee charged in cash for hours past holdHours. */
  extraHourFee: string;
  stakeAmount?: string;
}

const MIN_HOLD_HOURS = 2;
const MAX_HOLD_HOURS = 72;

function parsePositiveInt(value: string, field: string): number {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
  return parsed;
}

export interface ContractOffer {
  id: bigint;
  owner: string;
  offerType: OfferType;
  amountAvailable: bigint;
  minAmount: bigint;
  pricePerToken: bigint;
  fiatCurrency: string;
  flatFee: bigint;
  active: boolean;
  metadataCID: string;
  createdAt: bigint;
  agentAddresses: string[];
}

export type { ContractAgent } from "../lib/host";

export function useP2PMarket() {
  const { nativeCurrency, evmDecimals } = useWalletContext();

  const createOffer = useCallback(
    async (
      params: CreateOfferParams,
    ): Promise<{ offerId: number; txHash: string }> => {
      if (!env.VITE_P2PMARKET_ADDRESS) {
        throw new Error("VITE_P2PMARKET_ADDRESS not configured");
      }

      const amountAvailableWei = ethers.parseUnits(
        params.amountAvailable,
        evmDecimals,
      );
      const minAmountWei = ethers.parseUnits(params.minAmount, evmDecimals);
      if (amountAvailableWei <= 0n)
        throw new Error("amountAvailable must be > 0");
      if (minAmountWei <= 0n) throw new Error("minAmount must be > 0");
      if (minAmountWei > amountAvailableWei)
        throw new Error("minAmount must be <= amountAvailable");

      if (!params.fiatCurrency?.trim())
        throw new Error("fiatCurrency is required");

      const flatFeeRaw = BigInt(parsePositiveInt(params.flatFee, "flatFee"));
      if (flatFeeRaw > BigInt(MAX_FLAT_FEE))
        throw new Error(`flatFee must be <= ${MAX_FLAT_FEE}`);

      if (!params.metadataCID?.trim())
        throw new Error("metadataCID is required");

      const substrateSigner = getSignerAndAddress();
      if (!substrateSigner) {
        throw new Error(
          "Wallet not connected. Sign in to Triangle to continue.",
        );
      }

      const result = await createOfferViaSubstrate(
        substrateSigner.address,
        substrateSigner.signer,
        {
          offerType: params.offerType,
          amountAvailable: amountAvailableWei,
          minAmount: minAmountWei,
          flatFee: flatFeeRaw,
          fiatCurrency: params.fiatCurrency,
          metadataCID: params.metadataCID,
          agentAddresses: params.agentAddresses,
        },
      );

      return {
        offerId: Number(result.offerId),
        txHash: "",
      };
    },
    [evmDecimals],
  );

  const getAllOffers = useCallback(async (): Promise<ContractOffer[]> => {
    if (!env.VITE_P2PMARKET_ADDRESS) {
      throw new Error("VITE_P2PMARKET_ADDRESS not configured");
    }

    const offers = await getAllOffersViaSubstrate();
    return offers.map((o) => {
      return {
        ...o,
        offerType: o.offerType as OfferType,
      };
    });
  }, []);

  const registerAgent = useCallback(
    async (params: RegisterAgentParams): Promise<{ txHash: string }> => {
      if (!env.VITE_P2PMARKET_ADDRESS) {
        throw new Error("VITE_P2PMARKET_ADDRESS not configured");
      }

      const decimals = nativeCurrency.decimals;

      const flatFeeRaw = BigInt(parsePositiveInt(params.flatFee, "flatFee"));
      if (flatFeeRaw > BigInt(MAX_FLAT_FEE))
        throw new Error(`flatFee must be <= ${MAX_FLAT_FEE}`);

      const holdHoursRaw = parsePositiveInt(params.holdHours, "holdHours");
      if (holdHoursRaw < MIN_HOLD_HOURS || holdHoursRaw > MAX_HOLD_HOURS)
        throw new Error(
          `holdHours must be between ${MIN_HOLD_HOURS} and ${MAX_HOLD_HOURS}`,
        );

      const extraHourFeeRaw = BigInt(
        parsePositiveInt(params.extraHourFee, "extraHourFee"),
      );
      if (extraHourFeeRaw > BigInt(MAX_FLAT_FEE))
        throw new Error(`extraHourFee must be <= ${MAX_FLAT_FEE}`);

      if (!params.name?.trim()) throw new Error("name is required");
      if (!params.metadataCID?.trim())
        throw new Error("metadataCID is required");

      const stakeAmountWei =
        params.stakeAmount && params.stakeAmount !== "0"
          ? ethers.parseUnits(params.stakeAmount, decimals)
          : 0n;

      const substrateSigner = getSignerAndAddress();
      if (!substrateSigner) {
        throw new Error("Wallet not connected or read-only.");
      }

      return await registerAgentViaSubstrate(
        substrateSigner.address,
        substrateSigner.signer,
        {
          name: params.name,
          metadataCID: params.metadataCID,
          flatFee: flatFeeRaw,
          holdHours: holdHoursRaw,
          extraHourFee: extraHourFeeRaw,
        },
        stakeAmountWei,
      );
    },
    [nativeCurrency.decimals],
  );

  const getAllAgents = useCallback(async (): Promise<ContractAgent[]> => {
    if (!env.VITE_P2PMARKET_ADDRESS) {
      throw new Error("VITE_P2PMARKET_ADDRESS not configured");
    }
    return await getAllAgentsViaSubstrate();
  }, []);

  const getOffersByAgent = useCallback(
    async (agentAddress: string): Promise<bigint[]> => {
      if (!env.VITE_P2PMARKET_ADDRESS) {
        throw new Error("VITE_P2PMARKET_ADDRESS not configured");
      }
      return await getOffersByAgentViaSubstrate(agentAddress);
    },
    [],
  );

  const removeOffer = useCallback(
    async (offerId: bigint): Promise<{ txHash: string }> => {
      const substrateSigner = getSignerAndAddress();
      if (!substrateSigner)
        throw new Error("Wallet not connected or read-only.");
      return await removeOfferViaSubstrate(
        substrateSigner.address,
        substrateSigner.signer,
        offerId,
      );
    },
    [],
  );

  const addAgentToOffer = useCallback(
    async (offerId: bigint, agent: string): Promise<{ txHash: string }> => {
      const substrateSigner = getSignerAndAddress();
      if (!substrateSigner)
        throw new Error("Wallet not connected or read-only.");
      return await addAgentToOfferViaSubstrate(
        substrateSigner.address,
        substrateSigner.signer,
        offerId,
        agent,
      );
    },
    [],
  );

  const getExpiredOfferIds = useCallback(async (): Promise<bigint[]> => {
    if (!env.VITE_P2PMARKET_ADDRESS) return [];
    return await getExpiredOfferIdsViaSubstrate();
  }, []);

  const pruneExpiredOffers = useCallback(
    async (offerIds: bigint[]): Promise<{ txHash: string } | null> => {
      if (offerIds.length === 0) return null;
      const substrateSigner = getSignerAndAddress();
      if (!substrateSigner) return null;
      return await pruneExpiredOffersViaSubstrate(
        substrateSigner.address,
        substrateSigner.signer,
        offerIds,
      );
    },
    [],
  );

  const updateAgent = useCallback(
    async (params: RegisterAgentParams): Promise<{ txHash: string }> => {
      const flatFeeRaw = BigInt(parsePositiveInt(params.flatFee, "flatFee"));
      if (flatFeeRaw > BigInt(MAX_FLAT_FEE))
        throw new Error(`flatFee must be <= ${MAX_FLAT_FEE}`);

      const holdHoursRaw = parsePositiveInt(params.holdHours, "holdHours");
      if (holdHoursRaw < MIN_HOLD_HOURS || holdHoursRaw > MAX_HOLD_HOURS)
        throw new Error(
          `holdHours must be between ${MIN_HOLD_HOURS} and ${MAX_HOLD_HOURS}`,
        );

      const extraHourFeeRaw = BigInt(
        parsePositiveInt(params.extraHourFee, "extraHourFee"),
      );
      if (extraHourFeeRaw > BigInt(MAX_FLAT_FEE))
        throw new Error(`extraHourFee must be <= ${MAX_FLAT_FEE}`);

      if (!params.name?.trim()) throw new Error("name is required");
      if (!params.metadataCID?.trim())
        throw new Error("metadataCID is required");

      const substrateSigner = getSignerAndAddress();
      if (!substrateSigner)
        throw new Error("Wallet not connected or read-only.");
      return await updateAgentViaSubstrate(
        substrateSigner.address,
        substrateSigner.signer,
        {
          name: params.name,
          metadataCID: params.metadataCID,
          flatFee: flatFeeRaw,
          holdHours: holdHoursRaw,
          extraHourFee: extraHourFeeRaw,
        },
      );
    },
    [],
  );

  const deactivateAgent = useCallback(async (): Promise<{ txHash: string }> => {
    const substrateSigner = getSignerAndAddress();
    if (!substrateSigner) throw new Error("Wallet not connected or read-only.");
    return await deactivateAgentViaSubstrate(
      substrateSigner.address,
      substrateSigner.signer,
    );
  }, []);

  const reactivateAgent = useCallback(async (): Promise<{ txHash: string }> => {
    const substrateSigner = getSignerAndAddress();
    if (!substrateSigner) throw new Error("Wallet not connected or read-only.");
    return await reactivateAgentViaSubstrate(
      substrateSigner.address,
      substrateSigner.signer,
    );
  }, []);

  const removeAgentFn = useCallback(async (): Promise<{ txHash: string }> => {
    const substrateSigner = getSignerAndAddress();
    if (!substrateSigner) throw new Error("Wallet not connected or read-only.");
    return await removeAgentViaSubstrate(
      substrateSigner.address,
      substrateSigner.signer,
    );
  }, []);

  const stakeInsurance = useCallback(
    async (amount: string): Promise<{ txHash: string }> => {
      const decimals = nativeCurrency.decimals;
      const amountWei = ethers.parseUnits(amount, decimals);
      if (amountWei <= 0n) throw new Error("Amount must be > 0");

      const substrateSigner = getSignerAndAddress();
      if (!substrateSigner)
        throw new Error("Wallet not connected or read-only.");
      return await stakeInsuranceViaSubstrate(
        substrateSigner.address,
        substrateSigner.signer,
        amountWei,
      );
    },
    [nativeCurrency.decimals],
  );

  const unstakeInsurance = useCallback(
    async (amount: string): Promise<{ txHash: string }> => {
      const amountWei = ethers.parseUnits(amount, evmDecimals);
      if (amountWei <= 0n) throw new Error("Amount must be > 0");

      const substrateSigner = getSignerAndAddress();
      if (!substrateSigner)
        throw new Error("Wallet not connected or read-only.");
      return await unstakeInsuranceViaSubstrate(
        substrateSigner.address,
        substrateSigner.signer,
        amountWei,
      );
    },
    [evmDecimals],
  );

  return {
    createOffer,
    getAllOffers,
    removeOffer,
    addAgentToOffer,
    getExpiredOfferIds,
    pruneExpiredOffers,
    registerAgent,
    getAllAgents,
    getOffersByAgent,
    updateAgent,
    deactivateAgent,
    reactivateAgent,
    removeAgent: removeAgentFn,
    stakeInsurance,
    unstakeInsurance,
  };
}
