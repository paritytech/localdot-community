import { ethers } from "ethers";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useReducer,
} from "react";

import { useAutoRefresh } from "../hooks/useAutoRefresh";
import { type ContractOffer, useP2PMarket } from "../hooks/useP2PMarket";
import { OFFER_TTL_MS } from "../lib/constants";
import { fetchJSONFromIPFS } from "../lib/ipfs";
import type { Offer, OfferMetadata } from "../types/offers";
import { useWalletContext } from "./WalletContext";

type OffersAction =
  | { type: "ADD_OFFER"; offer: Offer }
  | { type: "SET_OFFERS"; offers: Offer[] }
  | { type: "SET_LOADING"; loading: boolean };

interface OffersContextValue {
  offers: Offer[];
  loading: boolean;
  addOffer: (offer: Offer) => void;
  getOffer: (id: string) => Offer | undefined;
  refreshOffers: () => Promise<void>;
}

interface OffersState {
  offers: Offer[];
  loading: boolean;
}

const OffersContext = createContext<OffersContextValue | null>(null);

function offersReducer(state: OffersState, action: OffersAction): OffersState {
  switch (action.type) {
    case "ADD_OFFER":
      return { ...state, offers: [action.offer, ...state.offers] };
    case "SET_OFFERS":
      return { ...state, offers: action.offers };
    case "SET_LOADING":
      return { ...state, loading: action.loading };
    default:
      return state;
  }
}

/**
 * Helper function to map contract offer to frontend offer type
 * Fetches and parses metadata JSON from Bulletin Chain (IPFS gateway)
 * @param decimals Chain-specific token decimals (18 local, 10 Paseo)
 */
const OFFER_TYPE_BUY = 1;

async function mapContractOfferToFrontendOffer(
  contractOffer: ContractOffer,
  decimals: number,
): Promise<Offer | null> {
  // Both SELL and BUY: amounts in token wei
  const formatWhole = (wei: bigint) =>
    parseFloat(ethers.formatUnits(wei, decimals)).toString();
  const amountAvailable = formatWhole(contractOffer.amountAvailable);
  const minAmount = formatWhole(contractOffer.minAmount);

  // Format fee: flatFee is in whole USD units (e.g., 12 = $12). V1 supports USD only.
  const fee =
    contractOffer.flatFee > 0n ? `$${contractOffer.flatFee.toString()}` : null;

  // Use owner address as alias (truncated for display)
  const alias = `${contractOffer.owner.slice(0, 6)}...${contractOffer.owner.slice(-4)}`;

  // Format created date
  const createdAt = new Date(
    Number(contractOffer.createdAt) * 1000,
  ).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });

  // Fetch metadata from Bulletin Chain (IPFS gateway)
  let metadata: OfferMetadata | null = null;
  let city = "Unknown";
  let country = "Unknown";
  let lat: number | undefined;
  let lon: number | undefined;
  let radiusKm: number | undefined;
  let availability: Offer["availability"] | undefined;

  try {
    metadata = await fetchJSONFromIPFS<OfferMetadata>(
      contractOffer.metadataCID,
    );
  } catch (error) {
    // Bulletin CID is gone (TTL expired or pin lost) — the offer's metadata is
    // no longer reachable. Drop the offer rather than rendering it half-blind.
    console.warn(
      `[Offers] Dropping offer ${contractOffer.id}: metadata CID ${contractOffer.metadataCID} unavailable`,
      error,
    );
    return null;
  }

  // Parse location data
  if (metadata.location) {
    city = metadata.location.city || "Unknown";
    country = metadata.location.country || "Unknown";
    lat = metadata.location.lat;
    lon = metadata.location.lng;
    radiusKm = metadata.location.radius;
  }

  // Parse availability data (per-day schedule format)
  if (metadata.availability?.schedule) {
    const schedule = metadata.availability.schedule;
    const days = Object.keys(schedule);
    const firstDay = days[0];
    const firstEntry = firstDay ? schedule[firstDay] : undefined;
    const hours = firstEntry ? `${firstEntry.open}–${firstEntry.close}` : "";
    availability = {
      days,
      hours,
      timezone: metadata.availability.timezone,
    };
  }

  return {
    id: contractOffer.id.toString(),
    alias,
    owner: contractOffer.owner,
    role:
      Number(contractOffer.offerType) === OFFER_TYPE_BUY ? "buyer" : "seller",
    fiatCurrency: contractOffer.fiatCurrency,
    fee,
    minAmount,
    maxAmount: amountAvailable,
    metadataCID: contractOffer.metadataCID,
    city,
    country,
    lat,
    lon,
    radiusKm,
    availability,
    rating: 4.0, // Temporary hardcode until reputation system
    createdAt,
    agentAddresses: contractOffer.agentAddresses,
  };
}

export function OffersProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const [state, dispatch] = useReducer(offersReducer, {
    offers: [],
    loading: false,
  });

  const { evmDecimals } = useWalletContext();
  const { getAllOffers } = useP2PMarket();
  const decimals = evmDecimals;

  // `silent` skips the loading flag so background polls don't flash a spinner;
  // on a silent failure we keep the last good list instead of clearing it.
  const refreshOffers = useCallback(
    async (silent = false) => {
      if (!silent) dispatch({ type: "SET_LOADING", loading: true });

      try {
        const contractOffers = await getAllOffers();
        // Belt-and-braces filter: getAllOffers already drops expired offers,
        // but recheck against the Bulletin TTL in case a fresh deploy is missing
        // the on-chain filter or the client cached a stale list.
        const now = Date.now();
        const activeOffers = contractOffers.filter(
          (o) => o.active && Number(o.createdAt) * 1000 + OFFER_TTL_MS > now,
        );

        // Fetch metadata for all offers in parallel; null entries (CID gone) are dropped.
        const mapped = await Promise.all(
          activeOffers.map((offer) =>
            mapContractOfferToFrontendOffer(offer, decimals),
          ),
        );
        const frontendOffers = mapped.filter((o): o is Offer => o !== null);

        dispatch({ type: "SET_OFFERS", offers: frontendOffers });
      } catch (error) {
        console.error("Failed to fetch offers:", error);
        if (!silent) dispatch({ type: "SET_OFFERS", offers: [] });
      } finally {
        if (!silent) dispatch({ type: "SET_LOADING", loading: false });
      }
    },
    [getAllOffers, decimals],
  );

  // Load offers on mount
  useEffect(() => {
    void refreshOffers();
  }, [refreshOffers]);

  // Keep the list fresh without a manual reload: poll while the tab is visible
  // and refetch when the user returns to the app.
  useAutoRefresh(() => refreshOffers(true), { intervalMs: 30_000 });

  const addOffer = useCallback((offer: Offer) => {
    dispatch({ type: "ADD_OFFER", offer });
  }, []);

  const getOffer = useCallback(
    (id: string) => state.offers.find((o) => o.id === id),
    [state.offers],
  );

  return (
    <OffersContext.Provider
      value={{
        offers: state.offers,
        loading: state.loading,
        addOffer,
        getOffer,
        refreshOffers,
      }}
    >
      {children}
    </OffersContext.Provider>
  );
}

export function useOffersContext(): OffersContextValue {
  const context = useContext(OffersContext);
  if (!context)
    throw new Error("useOffersContext must be within OffersProvider");
  return context;
}
