import type { Offer, OfferRole } from "../types/offers";
import { timeToMinutes } from "./format";
import { calculateDistance } from "./geo";

type Urgency = "today" | "tomorrow" | "next-few-days";

interface RecommendationParams {
  offers: Offer[];
  userRole: "buyer" | "seller"; // What user wants to do
  amount: number;
  urgency: Urgency;
  userLocation: { lat: number; lon: number };
  maxDistance?: number; // Default 10km
}

interface ScoredOffer extends Offer {
  distance: number;
  score: number;
}

export interface RecommendationResult {
  topRecommendations: ScoredOffer[];
  otherOptions: ScoredOffer[];
  expandedRadius: boolean;
  noResultsReason?: string;
}

// Re-export for consumers that need distance without full recommendations
export { calculateDistance } from "./geo";

// Check if offer is available on specific urgency
function isAvailableForUrgency(offer: Offer, urgency: Urgency): boolean {
  if (!offer.availability) return false;

  const now = new Date();
  const today = now.toLocaleDateString("en-US", { weekday: "short" });
  const tomorrow = new Date(now.getTime() + 86400000).toLocaleDateString(
    "en-US",
    {
      weekday: "short",
    },
  );

  // Get next 7 days
  const nextWeek = Array.from({ length: 7 }, (_, i) =>
    new Date(now.getTime() + i * 86400000).toLocaleDateString("en-US", {
      weekday: "short",
    }),
  );

  switch (urgency) {
    case "today":
      return offer.availability.days.includes(today);

    case "tomorrow":
      return (
        offer.availability.days.includes(today) ||
        offer.availability.days.includes(tomorrow)
      );

    case "next-few-days":
      return offer.availability.days.some((day) => nextWeek.includes(day));

    default:
      return false;
  }
}

// Parse fee string to number (strips the leading "$" symbol)
function parseFee(feeString: string | null): number {
  if (!feeString) return 0;
  return parseFloat(feeString.replace(/\$/g, "")) || 0;
}

// Check if user and provider circles overlap (can they meet?)
function canMeet(
  userLocation: { lat: number; lon: number },
  userRadius: number,
  providerLocation: { lat: number; lon: number },
  providerRadius: number,
): boolean {
  const distance = calculateDistance(
    userLocation.lat,
    userLocation.lon,
    providerLocation.lat,
    providerLocation.lon,
  );

  // Two circles overlap if distance between centers <= sum of radii
  return distance <= userRadius + providerRadius;
}

/**
 * Filter offers by circle overlap and attach distance. Returns ScoredOffer[] with score=0 (to be computed later).
 */
function scoreOffersInRadius(
  offers: Offer[],
  userLocation: { lat: number; lon: number },
  userRadius: number,
): ScoredOffer[] {
  return offers
    .map((offer) => {
      if (!offer.lat || !offer.lon) return null;

      const distance = calculateDistance(
        userLocation.lat,
        userLocation.lon,
        offer.lat,
        offer.lon,
      );
      const providerRadius = offer.radiusKm ?? 2;

      if (
        !canMeet(
          userLocation,
          userRadius,
          { lat: offer.lat, lon: offer.lon },
          providerRadius,
        )
      ) {
        return null;
      }

      return { ...offer, distance, score: 0 };
    })
    .filter((offer): offer is ScoredOffer => offer !== null);
}

// Calculate score for an offer (0-1 range)
// Uses distance between pins, not theoretical meetup point
// maxFeeInSet: relative fee scoring - cheapest gets 1, most expensive gets 0
function calculateScore(
  offer: ScoredOffer,
  userRadius: number,
  maxFeeInSet: number,
): number {
  // Rating score (0-1)
  const ratingScore = (offer.rating ?? 4.0) / 5;

  // Distance score (0-1, inverted - closer pin is better)
  const maxSearchDistance = userRadius * 2;
  const distanceScore = Math.max(0, 1 - offer.distance / maxSearchDistance);

  // Fee score (0-1): relative to max fee in current set. Cheapest = 1, most expensive = 0
  const fee = parseFee(offer.fee);
  const feeScore = maxFeeInSet === 0 ? 1 : Math.max(0, 1 - fee / maxFeeInSet);

  // Weighted combination: 50% rating, 30% distance, 20% fee
  return ratingScore * 0.5 + distanceScore * 0.3 + feeScore * 0.2;
}

/**
 * Get personalized recommendations for user
 */
export function getRecommendations(
  params: RecommendationParams,
): RecommendationResult {
  const {
    offers,
    userRole,
    amount,
    urgency,
    userLocation,
    maxDistance = 10,
  } = params;

  // Step 1: Filter by role (buyer wants providers, seller wants buyers)
  const targetRole: OfferRole = userRole === "buyer" ? "seller" : "buyer";
  let filtered = offers.filter((offer) => offer.role === targetRole);

  // Step 2: Filter by amount
  filtered = filtered.filter((offer) => {
    const min = parseFloat(offer.minAmount);
    const max = parseFloat(offer.maxAmount);
    return amount >= min && amount <= max;
  });

  // Step 3: Filter by availability
  const availableOffers = filtered.filter((offer) =>
    isAvailableForUrgency(offer, urgency),
  );

  // If no available offers, return early with reason
  if (availableOffers.length === 0) {
    return {
      topRecommendations: [],
      otherOptions: [],
      expandedRadius: false,
      noResultsReason: urgency,
    };
  }

  // Step 4: Filter by circle overlap and attach distance
  const scored = scoreOffersInRadius(
    availableOffers,
    userLocation,
    maxDistance,
  );

  // Step 5: If < 3 results, try expanding radius to 20km. Only use expanded set if it finds MORE offers.
  // (If expanded returns same count, e.g. 2, we keep scored and expandedRadius stays false.)
  let expandedRadius = false;
  let finalOffers = scored;

  if (scored.length < 3) {
    const expandedScored = scoreOffersInRadius(
      availableOffers,
      userLocation,
      maxDistance * 2,
    );
    if (expandedScored.length > scored.length) {
      finalOffers = expandedScored;
      expandedRadius = true;
    }
  }

  // Step 6: Calculate scores with appropriate user radius
  const effectiveUserRadius = expandedRadius ? maxDistance * 2 : maxDistance;
  const maxFeeInSet = finalOffers.reduce(
    (max, o) => Math.max(max, parseFee(o.fee)),
    0,
  );
  finalOffers.forEach((offer) => {
    offer.score = calculateScore(offer, effectiveUserRadius, maxFeeInSet);
  });

  // Step 7: Sort by score (highest first)
  finalOffers.sort((a, b) => b.score - a.score);

  // Step 8: Split into top 3 and others
  const topRecommendations = finalOffers.slice(0, 3);
  const otherOptions = finalOffers.slice(3);

  return {
    topRecommendations,
    otherOptions,
    expandedRadius,
  };
}

// ═══════════════════════════════════════════
// ═══ AGENT-BASED RECOMMENDATIONS ═══
// ═══════════════════════════════════════════

export interface AgentInfo {
  wallet: string;
  name: string;
  address: string;
  city: string;
  flatFee: number;
  lat: number;
  lon: number;
  rating: number;
}

export interface AgentMatchedOffer {
  offer: Offer;
  agent: AgentInfo;
  distance: number;
  totalFee: number;
  score: number;
}

interface AgentRecommendationParams {
  offers: Offer[];
  agents: AgentInfo[];
  userRole: "buyer" | "seller";
  amount: number;
  userLocation: { lat: number; lon: number };
  maxDistance?: number;
  /** Day key (e.g. "Mon") for provider availability check */
  userDay?: string;
  /** Time range for provider availability check */
  userTimeRange?: { from: string; to: string };
}

export interface AgentRecommendationResult {
  results: AgentMatchedOffer[];
  allMatched: AgentMatchedOffer[];
  noResultsReason?: string;
}

/**
 * For each offer, find the best agent (closest to user + cheapest).
 * Deduplicates: same offer shown only with best agent.
 */
function matchOffersToAgents(
  offers: Offer[],
  agents: AgentInfo[],
  userLocation: { lat: number; lon: number },
  maxDistance: number,
): AgentMatchedOffer[] {
  const results: AgentMatchedOffer[] = [];

  for (const offer of offers) {
    if (offer.agentAddresses.length === 0) continue;

    let bestMatch: AgentMatchedOffer | null = null;

    for (const agentAddr of offer.agentAddresses) {
      const agent = agents.find(
        (a) => a.wallet.toLowerCase() === agentAddr.toLowerCase(),
      );
      if (!agent || agent.lat === 0) continue;

      const distance = calculateDistance(
        userLocation.lat,
        userLocation.lon,
        agent.lat,
        agent.lon,
      );

      if (distance > maxDistance) continue;

      const providerFee = parseFee(offer.fee);
      const totalFee = providerFee + agent.flatFee;

      const match: AgentMatchedOffer = {
        offer,
        agent,
        distance,
        totalFee,
        score: 0,
      };

      if (
        !bestMatch ||
        totalFee < bestMatch.totalFee ||
        (totalFee === bestMatch.totalFee && distance < bestMatch.distance)
      ) {
        bestMatch = match;
      }
    }

    if (bestMatch) {
      results.push(bestMatch);
    }
  }

  return results;
}

function calculateMatchScore(
  match: AgentMatchedOffer,
  maxFee: number,
  maxDist: number,
  weights: { fee: number; distance: number; rating: number },
): number {
  const feeScore = maxFee === 0 ? 1 : Math.max(0, 1 - match.totalFee / maxFee);
  const distScore =
    maxDist === 0 ? 1 : Math.max(0, 1 - match.distance / maxDist);
  const ratingScore = match.agent.rating / 5;

  return (
    feeScore * weights.fee +
    distScore * weights.distance +
    ratingScore * weights.rating
  );
}

/**
 * Pick top 3 with different weight profiles:
 * 1. Best price (fee-heavy)
 * 2. Closest (distance-heavy)
 * 3. Balanced
 *
 * Same offer CAN win multiple categories — it gets multiple labels.
 * Duplicates are merged (shown once with combined label).
 * Remaining slots filled with next best unique offers.
 */
function pickTop3(matched: AgentMatchedOffer[]): AgentMatchedOffer[] {
  if (matched.length === 0) return [];
  if (matched.length <= 3) return matched;

  const maxFee = Math.max(...matched.map((m) => m.totalFee));
  const maxDist = Math.max(...matched.map((m) => m.distance));

  const weightProfiles = [
    { fee: 0.6, distance: 0.25, rating: 0.15 }, // best price
    { fee: 0.25, distance: 0.6, rating: 0.15 }, // closest
    { fee: 0.4, distance: 0.35, rating: 0.25 }, // balanced
  ];

  // Find winner for each category (allow same offer to win multiple)
  const winners: AgentMatchedOffer[] = [];
  for (const weights of weightProfiles) {
    let best: AgentMatchedOffer | null = null;
    let bestScore = -1;
    for (const m of matched) {
      const score = calculateMatchScore(m, maxFee, maxDist, weights);
      if (score > bestScore) {
        bestScore = score;
        best = { ...m, score };
      }
    }
    if (best) winners.push(best);
  }

  // Deduplicate — keep first occurrence, merge labels later in UI
  const results: AgentMatchedOffer[] = [];
  const usedOfferIds = new Set<string>();

  for (const w of winners) {
    if (!usedOfferIds.has(w.offer.id)) {
      results.push(w);
      usedOfferIds.add(w.offer.id);
    }
  }

  // Fill remaining slots (up to 3) with best balanced offers not yet picked
  if (results.length < 3) {
    const balancedWeights = { fee: 0.4, distance: 0.35, rating: 0.25 };
    const remaining = matched
      .filter((m) => !usedOfferIds.has(m.offer.id))
      .map((m) => {
        return {
          ...m,
          score: calculateMatchScore(m, maxFee, maxDist, balancedWeights),
        };
      })
      .sort((a, b) => b.score - a.score);

    for (const r of remaining) {
      if (results.length >= 3) break;
      results.push(r);
      usedOfferIds.add(r.offer.id);
    }
  }

  return results;
}

/**
 * Assign labels based on which categories each result won.
 * Call this from the UI — pass the matched array and the results from pickTop3.
 */
export function getResultLabels(
  matched: AgentMatchedOffer[],
  results: AgentMatchedOffer[],
): Map<string, string[]> {
  if (matched.length === 0 || results.length === 0) return new Map();

  const maxFee = Math.max(...matched.map((m) => m.totalFee));
  const maxDist = Math.max(...matched.map((m) => m.distance));

  const categories: {
    name: string;
    weights: { fee: number; distance: number; rating: number };
  }[] = [
    { name: "Best price", weights: { fee: 0.6, distance: 0.25, rating: 0.15 } },
    {
      name: "Closest to you",
      weights: { fee: 0.25, distance: 0.6, rating: 0.15 },
    },
    {
      name: "Best overall",
      weights: { fee: 0.4, distance: 0.35, rating: 0.25 },
    },
  ];

  const labels = new Map<string, string[]>();

  for (const cat of categories) {
    let bestId = "";
    let bestScore = -1;
    for (const m of matched) {
      const score = calculateMatchScore(m, maxFee, maxDist, cat.weights);
      if (score > bestScore) {
        bestScore = score;
        bestId = m.offer.id;
      }
    }
    // Only label if this offer is in results
    if (results.some((r) => r.offer.id === bestId)) {
      const existing = labels.get(bestId) || [];
      existing.push(cat.name);
      labels.set(bestId, existing);
    }
  }

  return labels;
}

function parseTimeRange(hours: string): { from: number; to: number } | null {
  // Parse "10:00–18:00" or "10:00-18:00"
  const parts = hours.split(/[–-]/);
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const from = timeToMinutes(parts[0].trim());
  const to = timeToMinutes(parts[1].trim());
  return { from, to };
}

/** Check if offer provider is available on user's day and time */
function isProviderAvailable(
  offer: Offer,
  userDay?: string,
  userTimeRange?: { from: string; to: string },
): boolean {
  if (!userDay || !userTimeRange) return true; // no filter = all pass
  if (!offer.availability) return true; // no schedule info = assume available

  // Check if provider works on that day
  if (!offer.availability.days.includes(userDay)) return false;

  // Check time overlap if we have hours info
  if (offer.availability.hours) {
    const provTime = parseTimeRange(offer.availability.hours);
    if (provTime) {
      const userFrom = timeToMinutes(userTimeRange.from);
      const userTo = timeToMinutes(userTimeRange.to);
      const overlap =
        Math.min(provTime.to, userTo) - Math.max(provTime.from, userFrom);
      if (overlap <= 0) return false;
    }
  }

  return true;
}

function filterByRoleAndAmount(
  offers: Offer[],
  userRole: "buyer" | "seller",
  amount: number,
  userDay?: string,
  userTimeRange?: { from: string; to: string },
): Offer[] {
  const targetRole: OfferRole = userRole === "buyer" ? "seller" : "buyer";
  return offers
    .filter((o) => o.role === targetRole)
    .filter((o) => {
      const min = parseFloat(o.minAmount);
      const max = parseFloat(o.maxAmount);
      return amount >= min && amount <= max;
    })
    .filter((o) => isProviderAvailable(o, userDay, userTimeRange));
}

/**
 * Get agent-based recommendations.
 * Returns top 3 offers matched with their best agent.
 */
export function getAgentRecommendations(
  params: AgentRecommendationParams,
): AgentRecommendationResult {
  const {
    offers,
    agents,
    userRole,
    amount,
    userLocation,
    maxDistance = 5,
    userDay,
    userTimeRange,
  } = params;

  const filtered = filterByRoleAndAmount(
    offers,
    userRole,
    amount,
    userDay,
    userTimeRange,
  );
  if (filtered.length === 0) {
    return {
      results: [],
      allMatched: [],
      noResultsReason: "No offers match your amount",
    };
  }

  let matched = matchOffersToAgents(
    filtered,
    agents,
    userLocation,
    maxDistance,
  );

  if (matched.length < 3) {
    const expanded = matchOffersToAgents(
      filtered,
      agents,
      userLocation,
      maxDistance * 3,
    );
    if (expanded.length > matched.length) {
      matched = expanded;
    }
  }

  if (matched.length === 0) {
    return {
      results: [],
      allMatched: [],
      noResultsReason: "No exchange locations nearby",
    };
  }

  return { results: pickTop3(matched), allMatched: matched };
}

/**
 * Get direct P2P recommendations (no agent).
 */
export function getDirectRecommendations(
  params: Omit<AgentRecommendationParams, "agents">,
): AgentRecommendationResult {
  const {
    offers,
    userRole,
    amount,
    userLocation,
    maxDistance = 5,
    userDay,
    userTimeRange,
  } = params;

  const filtered = filterByRoleAndAmount(
    offers,
    userRole,
    amount,
    userDay,
    userTimeRange,
  );
  if (filtered.length === 0) {
    return {
      results: [],
      allMatched: [],
      noResultsReason: "No offers match your criteria",
    };
  }

  const scored: AgentMatchedOffer[] = [];

  for (const offer of filtered) {
    if (!offer.lat || !offer.lon) continue;

    const distance = calculateDistance(
      userLocation.lat,
      userLocation.lon,
      offer.lat,
      offer.lon,
    );

    if (distance > maxDistance * 3) continue;

    scored.push({
      offer,
      agent: {
        wallet: "",
        name: "",
        address: "",
        city: "",
        flatFee: 0,
        lat: offer.lat,
        lon: offer.lon,
        rating: 4.0,
      },
      distance,
      totalFee: parseFee(offer.fee),
      score: 0,
    });
  }

  if (scored.length === 0) {
    return { results: [], allMatched: [], noResultsReason: "No offers nearby" };
  }

  return { results: pickTop3(scored), allMatched: scored };
}
