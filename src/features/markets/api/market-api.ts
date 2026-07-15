import { apiRequest } from "@/lib/api/http-client";
import { staleWhileRevalidate } from "@/lib/api/stale-cache";

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
  marketSlug?: string | null;
  eventSlug?: string | null;
  sourceUrl?: string | null;
  venueTitle: string;
  marketClass: string;
  outcomes: Array<{ id: string; label: string }>;
  resolutionSource?: string | null;
  resolutionTitle?: string | null;
  resolutionRulesText?: string | null;
  network: string | null;
  chain: string | null;
  change24h: string | null;
  changePercent24h: string | null;
  expiresAt: string | null;
  resolvesAt: string | null;
};

export type MarketCatalogMarket = MarketCatalogMedia & MarketCatalogMetrics & {
  eventId?: string;
  eventTitle?: string;
  canonicalEventId: string;
  canonicalMarketIds: string[];
  displayTopic?: string;
  displayOutcome?: string;
  displayOutcomeKey?: string;
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
  quoteStatus?: "live" | "partial" | "stale" | "unavailable";
  quoteReadyVenueCount?: number;
  quoteReadyVenues?: string[];
  quoteBlockers?: unknown[];
  lastQuoteAt?: string | null;
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
  venueMarkets?: MarketCatalogVenueMarket[];
  canonicalMarketIds?: string[];
  volume?: string | null;
  volume24h?: string | null;
};

export type MarketOrderbookLevel = {
  venue: string;
  venueMarketId: string;
  venueOutcomeId: string | null;
  price: string;
  size: string;
  cumulativeSize: string;
  cumulativeNotional: string;
};

export type MarketOrderbookVenue = {
  venue: string;
  venueMarketId: string;
  venueOutcomeId: string | null;
  source: "STREAM" | "REST";
  quoteQuality: string;
  sourceTimestamp: string | null;
  receivedAt: string;
  bestBid: string | null;
  bestAsk: string | null;
  midpoint: string | null;
  spread: string | null;
  bidDepth: string;
  askDepth: string;
  blockers: string[];
  bids: MarketOrderbookLevel[];
  asks: MarketOrderbookLevel[];
};

export type MarketOrderbookResponse = {
  marketId: string;
  outcomeId: string | null;
  generatedAt: string;
  depth: number;
  venues: MarketOrderbookVenue[];
  bids: MarketOrderbookLevel[];
  asks: MarketOrderbookLevel[];
  bestBid: string | null;
  bestAsk: string | null;
  midpoint: string | null;
  spread: string | null;
  status: "live" | "partial" | "stale" | "blocked" | "unavailable";
  blockers: Array<{ venue: string; reason: string; venueMarketId?: string; venueOutcomeId?: string; detailsCode?: string }>;
  stream?: {
    primaryTopic?: string | null;
    topics?: string[];
  } | null;
};

export type MarketOrderbookSnapshotStatus = "live" | "stale" | "blocked" | "resyncing";

export type MarketOrderbookStreamLevel = {
  venue?: string;
  venueMarketId?: string;
  venueOutcomeId?: string | null;
  price: string | number;
  size: string | number;
  cumulativeSize?: string | number | null;
  cumulativeNotional?: string | number | null;
};

export type MarketOrderbookStreamPayload = {
  schemaVersion?: string;
  updateType?: "snapshot" | "delta";
  seq?: number;
  checksum?: string;
  canonicalMarketId?: string;
  marketId?: string;
  canonicalOutcomeId?: string | null;
  outcomeId?: string | null;
  venue?: string;
  venueMarketId?: string | null;
  venueOutcomeId?: string | null;
  source?: string | null;
  quoteQuality?: string | null;
  bestBid?: string | number | null;
  bestAsk?: string | number | null;
  midpoint?: string | number | null;
  spread?: string | number | null;
  bidSize?: string | number | null;
  askSize?: string | number | null;
  freshnessMs?: number | null;
  snapshotStatus?: MarketOrderbookSnapshotStatus;
  venueCount?: number | null;
  liveVenueCount?: number | null;
  blockers?: unknown[];
  bids?: MarketOrderbookStreamLevel[];
  asks?: MarketOrderbookStreamLevel[];
  bidDeltas?: MarketOrderbookStreamLevel[];
  askDeltas?: MarketOrderbookStreamLevel[];
};

export type MarketChartTimeframe = "1H" | "6H" | "1D" | "1W" | "1M" | "ALL";

export type MarketChartResponse = {
  marketId: string;
  outcomeId: string | null;
  timeframe: MarketChartTimeframe;
  generatedAt: string;
  historyStatus: "live" | "accumulating" | "unavailable";
  series: Array<{
    id: string;
    label: string;
    color: string;
    kind?: "unified" | "venue" | string;
    hasData?: boolean;
  }>;
  points: Array<{
    timestamp: string;
    label: string;
    unified: string | null;
    venues: Record<string, string | null>;
  }>;
  blockers: MarketOrderbookResponse["blockers"];
};

export type MarketBatchQuoteRequestItem = {
  marketId: string;
  outcomeId: string;
  side?: "buy" | "sell";
  amount?: string | number;
};

export type MarketBatchQuoteDisplayMode = "debug" | "user";

export type MarketBatchQuoteVenueEvidence = {
  venue: string;
  venueMarketId: string;
  venueOutcomeId: string | null;
  price: string | null;
  bid: string | null;
  ask: string | null;
  availableSize: string;
  liquidity: string;
  spread: string | null;
  source: "STREAM" | "REST";
  quoteQuality: string;
  freshnessMs: number | null;
  blockers: string[];
};

export type MarketBatchQuoteItem = {
  marketId: string;
  outcomeId: string;
  side: "buy" | "sell";
  generatedAt: string;
  status: "live" | "partial" | "stale" | "unavailable";
  bestVenue: string | null;
  bestVenuePrice: string | null;
  unifiedAveragePrice: string | null;
  liquidity: string;
  spread: string | null;
  freshnessMs: number | null;
  venues: MarketBatchQuoteVenueEvidence[];
  blockers: MarketOrderbookResponse["blockers"];
};

export type MarketBatchQuoteResponse = {
  generatedAt: string;
  quotes: MarketBatchQuoteItem[];
};

export type MarketLivePriceRequestItem = {
  marketId: string;
  canonicalMarketIds?: string[];
  outcomeId?: string | null;
};

export type MarketLivePriceVenueBreakdown = {
  venue: string;
  price: string | null;
  bestBid: string | null;
  bestAsk: string | null;
  status: "live" | "no_live_price" | "price_outlier";
};

export type MarketLivePriceItem = {
  marketId: string;
  outcomeId: string | null;
  generatedAt: string;
  status: "live" | "no_live_price";
  price: string | null;
  bestBid: string | null;
  bestAsk: string | null;
  midpoint: string | null;
  spread: string | null;
  bestVenue: string | null;
  venueCount: number;
  venues: string[];
  liveVenueCount?: number;
  liveVenues?: string[];
  linkedVenueCount?: number;
  linkedVenues?: string[];
  averagePrice?: string | null;
  freshnessMs: number | null;
  venueBreakdown?: MarketLivePriceVenueBreakdown[];
};

export type MarketLivePricesResponse = {
  generatedAt: string;
  prices: MarketLivePriceItem[];
};

export type PolymarketMarketSnapshot = {
  slug: string;
  question: string;
  groupItemTitle?: string | null;
  image?: string | null;
  icon?: string | null;
  clobTokenIds?: string | null;
  outcomes?: string | null;
  outcomePrices?: string | null;
  active?: boolean;
  closed?: boolean;
  volume?: string | number | null;
  volumeClob?: string | number | null;
  volume24hr?: string | number | null;
  volume24hrClob?: string | number | null;
  liquidity?: string | number | null;
  liquidityClob?: string | number | null;
  events?: Array<{
    slug?: string | null;
    title?: string | null;
  }>;
};

export type PolymarketEventMarketSnapshot = {
  slug: string;
  question: string;
  groupItemTitle?: string | null;
  image?: string | null;
  icon?: string | null;
  clobTokenIds?: string | null;
  outcomes?: string | null;
  outcomePrices?: string | null;
  active?: boolean;
  closed?: boolean;
  volume?: string | number | null;
  volumeClob?: string | number | null;
  volume24hr?: string | number | null;
  volume24hrClob?: string | number | null;
};

export type PolymarketEventSnapshot = {
  slug: string;
  title: string;
  startDate?: string | null;
  endDate?: string | null;
  markets: PolymarketEventMarketSnapshot[];
};

export type PolymarketPriceHistoryInterval = "max" | "all" | "1m" | "1w" | "1d" | "6h" | "1h";

export type PolymarketPriceHistoryResponse = {
  history: Array<{
    t: number;
    p: number;
  }>;
};

export type PolymarketOrderbookResponse = {
  market?: string | null;
  asset_id?: string | null;
  timestamp?: string | number | null;
  bids?: Array<{ price?: string | number | null; size?: string | number | null }>;
  asks?: Array<{ price?: string | number | null; size?: string | number | null }>;
};

export type ResolutionRiskAssessment = {
  label: string;
  riskScore: string;
  confidenceScore: string;
  equivalenceClass: "SAFE_EQUIVALENT" | "EQUIVALENT_WITH_LAG" | "CAUTION" | "HIGH_RISK" | "DO_NOT_POOL";
  shortReasons: string[];
  factorBreakdown: Record<string, unknown>;
  recommendedAction: "Poolable" | "Pool with caution" | "Pool with caution (lag)" | "Isolate execution" | "Do not pool";
};

export type ResolutionRiskProfile = {
  id: string;
  venue: string;
  venueMarketId: string;
  canonicalEventId: string;
  oracleType?: string | null;
  oracleName?: string | null;
  resolutionAuthorityType?: string | null;
  primaryResolutionText?: string | null;
  supplementalRulesText?: string | null;
  disputeWindowHours?: string | null;
  settlementLagHours?: string | null;
  marketType?: string | null;
  outcomeSchema?: Record<string, unknown> | null;
  hasAmbiguousTimeBoundary: boolean;
  hasAmbiguousJurisdictionBoundary: boolean;
  hasAmbiguousSourceReference: boolean;
  historicalDivergenceRate?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type MarketListInput = {
  category?: string;
  cursor?: string;
  search?: string;
  limit?: number;
  quoteReadyOnly?: boolean;
  routeCoverage?: "all" | "single" | "pair" | "tri" | "strict_all";
  view?: "full" | "compact";
};

export type MarketListResponse = {
  markets: MarketCatalogMarket[];
  count: number;
  view?: "compact";
  pageSize?: number;
  nextCursor?: string | null;
  hasMore?: boolean;
};

export type MarketEventListResponse = {
  events: MarketCatalogEvent[];
  count: number;
  pageSize?: number;
  nextCursor?: string | null;
  hasMore?: boolean;
};

export function listMarketCategories() {
  return apiRequest<{ categories: Array<{ category: string; marketCount: number; eventCount?: number }> }>("/markets/categories");
}

export function listMarkets(input: MarketListInput = {}) {
  const params = buildMarketParams(input);
  return staleWhileRevalidate(`markets:${params}`, () =>
    apiRequest<MarketListResponse>(`/markets${params}`)
      .then((response) => ({
        ...response,
        markets: response.markets.map(normalizeMarketCatalogMarket),
      })),
    { ttlMs: 20_000, maxStaleMs: 5 * 60_000 }
  );
}

export function listEvents(input: MarketListInput = {}) {
  const params = buildMarketParams(input);
  return staleWhileRevalidate(`events:${params}`, () =>
    apiRequest<MarketEventListResponse>(`/events${params}`),
    { ttlMs: 20_000, maxStaleMs: 5 * 60_000 }
  );
}

export function getEventMarkets(eventId: string) {
  const path = `/events/${encodeURIComponent(eventId)}/markets`;
  return staleWhileRevalidate(`event-markets:${path}`, () =>
    apiRequest<{
      eventId: string;
      title: string;
      imageUrl: string | null;
      iconUrl: string | null;
      markets: MarketCatalogMarket[];
      count: number;
    }>(path),
    { ttlMs: 20_000, maxStaleMs: 5 * 60_000 }
  );
}

export function getMarket(marketId: string) {
  return apiRequest<{ market: MarketCatalogMarket }>(`/markets/${encodeURIComponent(marketId)}`);
}

export function getMarketOutcomes(marketId: string) {
  const path = `/markets/${encodeURIComponent(marketId)}/outcomes`;
  return staleWhileRevalidate(`outcomes:${path}`, () =>
    apiRequest<{ canonicalEventId: string; title: string; outcomes: MarketOutcome[] }>(path),
    { ttlMs: 30_000, maxStaleMs: 5 * 60_000 }
  );
}

export function getMarketOrderbook(
  marketId: string,
  input: { outcomeId?: string | null; depth?: number; venue?: string | null; snapshotOnly?: boolean; canonicalMarketIds?: string[] } = {}
) {
  const params = new URLSearchParams();
  if (input.outcomeId) params.set("outcomeId", input.outcomeId);
  if (input.depth) params.set("depth", String(input.depth));
  if (input.venue) params.set("venue", input.venue);
  if (input.snapshotOnly) params.set("snapshotOnly", "true");
  if (input.canonicalMarketIds?.length) {
    params.set("canonicalMarketIds", input.canonicalMarketIds.join(","));
  }
  const query = params.toString();
  const path = `/markets/${encodeURIComponent(marketId)}/orderbook${query ? `?${query}` : ""}`;
  // Orderbooks are executable pricing data. Never paint a previous snapshot
  // while the live request is revalidating: that briefly showed an old venue
  // as the best price before the current Polymarket book arrived.
  return apiRequest<MarketOrderbookResponse>(path);
}

export function getMarketChart(
  marketId: string,
  input: { outcomeId?: string | null; timeframe?: MarketChartTimeframe } = {}
) {
  const params = new URLSearchParams();
  if (input.outcomeId) params.set("outcomeId", input.outcomeId);
  if (input.timeframe) params.set("timeframe", input.timeframe);
  const query = params.toString();
  const path = `/markets/${encodeURIComponent(marketId)}/chart${query ? `?${query}` : ""}`;
  return staleWhileRevalidate(`chart:${path}`, () =>
    apiRequest<MarketChartResponse>(path),
    {
      ttlMs: 10_000,
      maxStaleMs: 5 * 60_000,
      // An empty response is a transient “history unavailable” state. It
      // must not mask a later successful fetch when the user revisits a
      // market in the same SPA session.
      allowStale: (response) => response.points.length > 0,
      shouldCache: (response) => response.points.length > 0,
    }
  );
}

export function getMarketBatchQuotes(input: { items: MarketBatchQuoteRequestItem[]; displayMode?: MarketBatchQuoteDisplayMode }) {
  const key = `market-quotes:${input.displayMode ?? "debug"}:${JSON.stringify(input.items)}`;
  return staleWhileRevalidate(key, () =>
    apiRequest<MarketBatchQuoteResponse>("/markets/quotes/batch", {
      method: "POST",
      body: input,
    }),
    { ttlMs: 3_000, maxStaleMs: 30_000 }
  );
}

export function getMarketLivePrices(input: { items: MarketLivePriceRequestItem[] }) {
  const body = {
    items: input.items.map((item) => ({
      marketId: item.marketId,
      ...(item.canonicalMarketIds?.length ? { canonicalMarketIds: item.canonicalMarketIds } : {}),
      ...(item.outcomeId ? { outcomeId: item.outcomeId } : {}),
    })),
  };
  return staleWhileRevalidate(`market-live-prices:${JSON.stringify(body.items)}`, () =>
    apiRequest<MarketLivePricesResponse>("/markets/live-prices", {
      method: "POST",
      body,
    }),
    { ttlMs: 0, maxStaleMs: 0 }
  );
}

export function getPolymarketMarketBySlug(slug: string) {
  return staleWhileRevalidate(`polymarket-market:${slug}`, async () => {
    const response = await fetch(`https://gamma-api.polymarket.com/markets/slug/${encodeURIComponent(slug)}`, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Unable to load Polymarket market ${slug}`);
    }
    return response.json() as Promise<PolymarketMarketSnapshot>;
  }, { ttlMs: 60_000, maxStaleMs: 15 * 60_000 });
}

export function getPolymarketEventBySlug(slug: string, input: { fresh?: boolean } = {}) {
  const cacheKey = input.fresh ? `polymarket-event-fresh:${slug}` : `polymarket-event:${slug}`;
  const requestUrl = input.fresh
    ? `https://gamma-api.polymarket.com/events/slug/${encodeURIComponent(slug)}?lotus_refresh=${Date.now()}`
    : `https://gamma-api.polymarket.com/events/slug/${encodeURIComponent(slug)}`;
  return staleWhileRevalidate(cacheKey, async () => {
    const response = await fetch(requestUrl, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Unable to load Polymarket event ${slug}`);
    }
    const event = await response.json() as PolymarketEventSnapshot;
    // Gamma has occasionally returned a short/partial event snapshot from
    // the slug endpoint. That response is not safe for outcome membership:
    // accepting it makes the terminal silently shrink to the few markets in
    // the partial payload. Re-read the same event through the collection
    // endpoint and keep the richer snapshot when it is available.
    if ((event.markets?.length ?? 0) >= 5) return event;
    const fallbackParams = new URLSearchParams({
      slug,
      limit: "1",
      lotus_refresh: String(Date.now()),
    });
    const fallbackResponse = await fetch(`https://gamma-api.polymarket.com/events?${fallbackParams.toString()}`, {
      cache: "no-store",
    }).catch(() => null);
    if (!fallbackResponse?.ok) return event;
    const fallbackPayload = await fallbackResponse.json() as unknown;
    const fallbackEvent = Array.isArray(fallbackPayload)
      ? fallbackPayload[0] as PolymarketEventSnapshot | undefined
      : null;
    return (fallbackEvent?.markets?.length ?? 0) > (event.markets?.length ?? 0)
      ? fallbackEvent!
      : event;
  }, {
    ttlMs: input.fresh ? 0 : 60_000,
    maxStaleMs: input.fresh ? 0 : 15 * 60_000,
    // Event membership is authoritative data, not a presentation cache. A
    // stale snapshot can contain only a previous page/subset of outcomes and
    // would make valid platform outcomes disappear from the terminal.
    ...(input.fresh ? { allowStale: () => false } : {}),
  });
}

export function getPolymarketMarketsByEventSlug(eventSlug: string, input: { limit?: number } = {}) {
  const params = new URLSearchParams({
    eventSlug,
    limit: String(input.limit ?? 100),
  });
  const url = `https://gamma-api.polymarket.com/markets?${params.toString()}`;
  return staleWhileRevalidate(`polymarket-event-markets:${params.toString()}`, async () => {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Unable to load Polymarket event markets for ${eventSlug}`);
    }
    return response.json() as Promise<PolymarketMarketSnapshot[]>;
  }, { ttlMs: 60_000, maxStaleMs: 15 * 60_000 });
}

export function getPolymarketPricesHistory(
  assetId: string,
  input: { interval: PolymarketPriceHistoryInterval; fidelity?: number; startTs?: number; endTs?: number }
) {
  const params = new URLSearchParams({
    market: assetId,
    interval: input.interval,
  });
  if (typeof input.fidelity === "number" && Number.isFinite(input.fidelity)) {
    params.set("fidelity", String(input.fidelity));
  }
  if (typeof input.startTs === "number" && Number.isFinite(input.startTs)) {
    params.set("startTs", String(Math.floor(input.startTs)));
  }
  if (typeof input.endTs === "number" && Number.isFinite(input.endTs)) {
    params.set("endTs", String(Math.floor(input.endTs)));
  }
  const url = `https://clob.polymarket.com/prices-history?${params.toString()}`;
  return staleWhileRevalidate(`polymarket-price-history:${params.toString()}`, async () => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Unable to load Polymarket price history for asset ${assetId}`);
    }
    return response.json() as Promise<PolymarketPriceHistoryResponse>;
  }, { ttlMs: 60_000, maxStaleMs: 15 * 60_000 });
}

export function getPolymarketOrderbook(tokenId: string, input: { depth?: number } = {}) {
  const params = new URLSearchParams({ token_id: tokenId });
  const url = `https://clob.polymarket.com/book?${params.toString()}`;
  return fetch(url).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Unable to load Polymarket order book for token ${tokenId}`);
    }
        const snapshot = await response.json() as PolymarketOrderbookResponse;
        const depth = Math.max(1, Math.floor(input.depth ?? 8));
        const trimLevels = (
          levels: Array<{ price?: string | number | null; size?: string | number | null }>,
          direction: 'asc' | 'desc',
        ) => levels
          .filter((level) => {
            const price = Number(level.price);
            const size = Number(level.size);
            return Number.isFinite(price) && Number.isFinite(size) && size > 0;
          })
          .sort((left, right) => {
            const difference = Number(left.price) - Number(right.price);
            return direction === 'asc' ? difference : -difference;
          })
          .slice(0, depth);
        return {
          ...snapshot,
          // CLOB responses are not guaranteed to be sorted. In particular,
          // asks may arrive from the highest level down, so slicing first can
          // hide the executable quote and leave the UI showing a bad level.
          bids: trimLevels(snapshot.bids ?? [], 'desc'),
          asks: trimLevels(snapshot.asks ?? [], 'asc'),
        };
  });
}

export function getCanonicalResolutionRisk(eventId: string) {
  return apiRequest<{ canonicalEventId: string; assessmentCount: number; assessments: ResolutionRiskAssessment[] }>(
    `/resolution-risk/canonical/${encodeURIComponent(eventId)}`
  );
}

export function getVenueMarketResolutionRisk(venue: string, marketId: string) {
  return apiRequest<{ profile: ResolutionRiskProfile; assessmentCount: number; assessments: ResolutionRiskAssessment[] }>(
    `/resolution-risk/market/${encodeURIComponent(venue)}/${encodeURIComponent(marketId)}`
  );
}

function buildMarketParams(input: MarketListInput): string {
  const params = new URLSearchParams();
  if (input.category) params.set("category", input.category);
  if (input.cursor) params.set("cursor", input.cursor);
  if (input.search) params.set("search", input.search);
  if (input.limit) params.set("limit", String(input.limit));
  if (typeof input.quoteReadyOnly === "boolean") params.set("quoteReadyOnly", String(input.quoteReadyOnly));
  if (input.routeCoverage) params.set("routeCoverage", input.routeCoverage);
  if (input.view === "compact") params.set("view", "compact");
  const query = params.toString();
  return query ? `?${query}` : "";
}

function normalizeMarketCatalogMarket(market: MarketCatalogMarket): MarketCatalogMarket {
  return {
    ...market,
    venueMarkets: Array.isArray(market.venueMarkets) ? market.venueMarkets : [],
  };
}
