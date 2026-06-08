import { useCallback } from "react";

import {
  getSignerAndAddress,
  useWalletContext,
} from "../context/WalletContext";
import { ZERO_ADDRESS } from "../lib/format";
import type { ContractTrade } from "../lib/host";
import {
  confirmCashReceivedViaSubstrate,
  confirmPickupViaSubstrate,
  confirmTradeViaSubstrate,
  getTradeViaSubstrate,
  getUserTradesViaSubstrate,
  lockTradeViaSubstrate,
  refundTradeViaSubstrate,
  requestCancelViaSubstrate,
  setEvidenceCIDViaSubstrate,
} from "../lib/host";

export type { ContractTrade } from "../lib/host";

export interface LockTradeParams {
  counterparty: string;
  offerId: bigint;
  agent: string; // address(0) for direct
  amount: string; // human-readable (e.g. "10.5")
}

export function useEscrow() {
  const { nativeCurrency } = useWalletContext();

  const lockTrade = useCallback(
    async (params: LockTradeParams): Promise<{ txHash: string }> => {
      const substrateSigner = getSignerAndAddress();
      if (!substrateSigner) {
        throw new Error("Wallet not connected or read-only.");
      }

      const { parseUnits } = await import("ethers");
      const amountWei = parseUnits(params.amount, nativeCurrency.decimals);
      if (amountWei <= 0n) throw new Error("Amount must be > 0");

      return await lockTradeViaSubstrate(
        substrateSigner.address,
        substrateSigner.signer,
        params.counterparty,
        params.offerId,
        params.agent || ZERO_ADDRESS,
        amountWei,
      );
    },
    [nativeCurrency.decimals],
  );

  const confirmTrade = useCallback(
    async (tradeId: bigint): Promise<{ txHash: string }> => {
      const substrateSigner = getSignerAndAddress();
      if (!substrateSigner)
        throw new Error("Wallet not connected or read-only.");
      return await confirmTradeViaSubstrate(
        substrateSigner.address,
        substrateSigner.signer,
        tradeId,
      );
    },
    [],
  );

  const requestCancel = useCallback(
    async (tradeId: bigint): Promise<{ txHash: string }> => {
      const substrateSigner = getSignerAndAddress();
      if (!substrateSigner)
        throw new Error("Wallet not connected or read-only.");
      return await requestCancelViaSubstrate(
        substrateSigner.address,
        substrateSigner.signer,
        tradeId,
      );
    },
    [],
  );

  const refundTrade = useCallback(
    async (tradeId: bigint): Promise<{ txHash: string }> => {
      const substrateSigner = getSignerAndAddress();
      if (!substrateSigner)
        throw new Error("Wallet not connected or read-only.");
      return await refundTradeViaSubstrate(
        substrateSigner.address,
        substrateSigner.signer,
        tradeId,
      );
    },
    [],
  );

  const confirmCashReceived = useCallback(
    async (tradeId: bigint): Promise<{ txHash: string }> => {
      const substrateSigner = getSignerAndAddress();
      if (!substrateSigner)
        throw new Error("Wallet not connected or read-only.");
      return await confirmCashReceivedViaSubstrate(
        substrateSigner.address,
        substrateSigner.signer,
        tradeId,
      );
    },
    [],
  );

  const confirmPickup = useCallback(
    async (tradeId: bigint): Promise<{ txHash: string }> => {
      const substrateSigner = getSignerAndAddress();
      if (!substrateSigner)
        throw new Error("Wallet not connected or read-only.");
      return await confirmPickupViaSubstrate(
        substrateSigner.address,
        substrateSigner.signer,
        tradeId,
      );
    },
    [],
  );

  const setEvidenceCID = useCallback(
    async (tradeId: bigint, cid: string): Promise<{ txHash: string }> => {
      const substrateSigner = getSignerAndAddress();
      if (!substrateSigner)
        throw new Error("Wallet not connected or read-only.");
      return await setEvidenceCIDViaSubstrate(
        substrateSigner.address,
        substrateSigner.signer,
        tradeId,
        cid,
      );
    },
    [],
  );

  const getTrade = useCallback(
    async (tradeId: bigint): Promise<ContractTrade> =>
      await getTradeViaSubstrate(tradeId),
    [],
  );

  const getUserTrades = useCallback(
    async (userAddress: string): Promise<bigint[]> =>
      await getUserTradesViaSubstrate(userAddress),
    [],
  );

  return {
    lockTrade,
    confirmTrade,
    confirmCashReceived,
    confirmPickup,
    setEvidenceCID,
    requestCancel,
    refundTrade,
    getTrade,
    getUserTrades,
  };
}
