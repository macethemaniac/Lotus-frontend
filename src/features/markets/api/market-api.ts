import { apiRequest } from "@/lib/api/http-client";

export type MarketCatalogMedia = {
  imageUrl: string | null;
  iconUrl: string | null;
};

export type MarketCatalogMetrics = {
  volume: string | null;
  volume24h: string | null;
  liquidity: string | null;
  buyVolume: string | null;
  sellVolume: string | null;
  tradeCount: string | null;
  buyCount: string | null;
  sellCount: string | null;
};

export type MarketCatalogVenueMarket = MarketCatalogMedia & MarketCatalogMetrics & {
  canonicalMarketId: string;
  canonicalMarketTitle: string;
  venue: string;
  venueMarketProfileId: string;
  venueMarketId: string;
  venueTitle: string;
  marketClass: string;
  outcomes: Array<{ id: string; label: string }>;
  network: string | null;
  chain: string | null;
  expiresAt: string | null;
  resolvesAt: string | null;
};

export type MarketCatalogMarket = MarketCatalogMedia & MarketCatalogMetrics & {
  eventId?: string;
  eventTitle?: string;
  canonicalEventId: string;
  canonicalMarketIds: string[];
  title: string;
  normalizedTitle: string;
  category: string;
  marketClass: string;
  status: "OPEN" | "RESOLVING" | "RESOLVED_OR_EXPIRED";
  startsAt: string | null;
  expiresAt: string | null;
  resolvesAt: string | null;
  venues: string[];
  venueCount: number;
  venueMarketCount: number;
  outcomeCount: number;
  routeability: {
    hasSingleVenue: boolean;
    hasCrossVenue: boolean;
  };
  venueMarkets: MarketCatalogVenueMarket[];
  updatedAt: string;
};

export type MarketCatalogEvent = MarketCatalogMedia & MarketCatalogMetrics & {
  eventId: string;
  title: string;
  normalizedTitle: string;
  category: string;
  status: MarketCatalogMarket["status"];
  marketCount: number;
  featuredMarkets: MarketCatalogMarket[];
  markets: MarketCatalogMarket[];
  venues: string[];
  venueCount: number;
  venueMarketCount: number;
  outcomeCount: number;
  routeability: MarketCatalogMarket["routeability"];
  updatedAt: string;
};

export type MarketOutcome = {
  id: string;
  label: string;
  venues: string[];
};

export type MarketListInput = {
  category?: string;
  search?: string;
  limit?: number;
};

export function listMarketCategories() {
  return apiRequest<{ categories: Array<{ category: string; marketCount: number; eventCount?: number }> }>("/markets/categories");
}

export function listMarkets(input: MarketListInput = {}) {
  const params = buildMarketParams(input);
  return apiRequest<{ markets: MarketCatalogMarket[]; count: number }>(`/markets${params}`);
}

export function listEvents(input: MarketListInput = {}) {
  const params = buildMarketParams(input);
  return apiRequest<{ events: MarketCatalogEvent[]; count: number }>(`/events${params}`);
}

export function getEventMarkets(eventId: string) {
  return apiRequest<{ eventId: string; title: string; markets: MarketCatalogMarket[]; count: number }>(
    `/events/${encodeURIComponent(eventId)}/markets`
  );
}

export function getMarket(marketId: string) {
  return apiRequest<{ market: MarketCatalogMarket }>(`/markets/${encodeURIComponent(marketId)}`);
}

export function getMarketOutcomes(marketId: string) {
  return apiRequest<{ canonicalEventId: string; title: string; outcomes: MarketOutcome[] }>(
    `/markets/${encodeURIComponent(marketId)}/outcomes`
  );
}

function buildMarketParams(input: MarketListInput): string {
  const params = new URLSearchParams();
  if (input.category) params.set("category", input.category);
  if (input.search) params.set("search", input.search);
  if (input.limit) params.set("limit", String(input.limit));
  const query = params.toString();
  return query ? `?${query}` : "";
}
