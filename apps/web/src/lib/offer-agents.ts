/**
 * Shared loader for the agents attached to an offer — resolves each agent's
 * on-chain record + Bulletin metadata (city, coords, today's closing time)
 * into the lightweight `OfferAgentInfo` the request-trade modal consumes.
 * Used by both the offer detail page and the offers list.
 */

import type { ContractAgent } from "../hooks/useP2PMarket";
import { fetchJSONFromIPFS } from "./ipfs";

export interface OfferAgentInfo {
  wallet: string;
  name: string;
  flatFee: string;
  city: string;
  lat?: number;
  lon?: number;
  closeTime?: string; // e.g. "18:00" — today's closing time
}

const DAY_KEYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function loadOfferAgents(
  agentAddresses: string[],
  getAllAgents: () => Promise<ContractAgent[]>,
): Promise<OfferAgentInfo[]> {
  if (agentAddresses.length === 0) return [];
  const allAgents = await getAllAgents();
  return await Promise.all(
    agentAddresses
      .map((addr) =>
        allAgents.find(
          (a: ContractAgent) => a.wallet.toLowerCase() === addr.toLowerCase(),
        ),
      )
      .filter((a): a is ContractAgent => a !== undefined)
      .map(async (agent) => {
        let city = "";
        let lat: number | undefined;
        let lon: number | undefined;
        let closeTime: string | undefined;
        try {
          const meta = await fetchJSONFromIPFS<{
            location?: { city?: string; lat?: number; lng?: number };
            workingHours?: {
              schedule?: Record<string, { open?: string; close?: string }>;
            };
          }>(agent.metadataCID);
          city = meta.location?.city ?? "";
          lat = meta.location?.lat;
          lon = meta.location?.lng;
          const dayKey = DAY_KEYS[new Date().getDay()];
          closeTime = meta.workingHours?.schedule?.[dayKey ?? ""]?.close;
        } catch {
          /* metadata unreachable — leave blanks */
        }
        return {
          wallet: agent.wallet,
          name: agent.name,
          flatFee: agent.flatFee.toString(),
          city,
          lat,
          lon,
          closeTime,
        };
      }),
  );
}
