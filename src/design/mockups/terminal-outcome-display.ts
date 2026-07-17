import type {
  MarketLivePriceItem,
  MarketOrderbookResponse,
  MarketOrderbookSnapshotStatus,
} from '@/features/markets/api/market-api';

export type TerminalOutcomeDisplayValues = {
  yesPrice: string | null;
  noPrice: string | null;
  probability: string | null;
};

export type TerminalVenueQuoteDisplay = {
  venue: string;
  yesPrice: string;
  noPrice: string;
  blocker: string | null;
};

type VenueBadgeResolution = {
  yesVenue: string | null;
  noVenue: string | null;
};

export type TerminalOutcomeRowDisplay = {
  platforms: number;
  prob: string;
  yesPrice: string;
  noPrice: string;
  primaryVenue: string | null;
  venueQuotes: TerminalVenueQuoteDisplay[];
  venues: string[];
  status: string;
  blocker: string | null;
  quoteReady?: boolean;
  quoteUpdatedAt?: string | null;
  quoteFreshnessMs?: number | null;
  quoteSource?: 'live' | 'catalog' | 'historical' | 'pending';
  yesAskPrice?: string | null;
  noAskPrice?: string | null;
};

type SelectedOutcomeBookReadinessInput = {
  orderbook: MarketOrderbookResponse | null;
  orderbookMarketId: string | null;
  orderbookOutcomeId: string | null;
  snapshotStatus: MarketOrderbookSnapshotStatus | undefined;
  liveVenueCount: number;
  syncingVenueCount: number;
};

const LIVE_PRICE_OUTLIER_DIFF_THRESHOLD = 0.12;
const LIVE_PRICE_EXTREME_THRESHOLD = 0.95;
const LIVE_PRICE_VENUE_MAX_SPREAD = 0.25;

const normalizeOutcomeId = (value: string | null | undefined): string | null => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed || trimmed === '_') return null;
  return trimmed.toUpperCase();
};

const normalizeVenueKey = (value: string | null | undefined): string => (
  typeof value === 'string'
    ? value.trim().replace(/[\s.-]+/g, '_').toUpperCase()
    : ''
);

const normalizeDisplayPriceLabel = (value: string | null | undefined): string | null => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed || trimmed === '-' || /^quote$/i.test(trimmed)) return null;
  return trimmed.toLowerCase();
};

const orderbookPriceValue = (value: string | number | null | undefined): number | null => {
  if (value === null || typeof value === 'undefined') return null;
  const parsed = typeof value === 'number'
    ? value
    : Number(String(value).replace(/[$,\s]/g, ''));
  return Number.isFinite(parsed) ? (parsed > 1 ? parsed / 100 : parsed) : null;
};

const hasUsableOrderbookDepth = (orderbook: MarketOrderbookResponse | null): boolean =>
  Boolean(orderbook && (orderbook.bids.length > 0 || orderbook.asks.length > 0 || orderbook.bestBid || orderbook.bestAsk));

export const isSelectedOutcomeBookReady = (input: SelectedOutcomeBookReadinessInput): boolean => {
  if (!input.orderbook || !input.orderbookMarketId) return false;
  if (!hasUsableOrderbookDepth(input.orderbook)) return false;
  if (input.orderbook.marketId !== input.orderbookMarketId) return false;
  const normalizedOrderbookOutcomeId = normalizeOutcomeId(input.orderbook.outcomeId);
  const normalizedSelectedOutcomeId = normalizeOutcomeId(input.orderbookOutcomeId);
  if (
    normalizedSelectedOutcomeId &&
    (normalizedSelectedOutcomeId === 'YES' || normalizedSelectedOutcomeId === 'NO') &&
    normalizedOrderbookOutcomeId !== normalizedSelectedOutcomeId
  ) {
    return false;
  }
  if (
    normalizedOrderbookOutcomeId &&
    normalizedSelectedOutcomeId &&
    normalizedOrderbookOutcomeId !== normalizedSelectedOutcomeId
  ) {
    return false;
  }
  if (input.orderbook.status !== 'live') return false;
  if (input.snapshotStatus === 'resyncing') return false;
  if (input.liveVenueCount <= 0) return false;
  if (input.syncingVenueCount > 0) return false;
  return true;
};

export const isSelectedOutcomeBookUsable = (input: SelectedOutcomeBookReadinessInput): boolean => {
  if (!input.orderbook || !input.orderbookMarketId) return false;
  if (!hasUsableOrderbookDepth(input.orderbook)) return false;
  if (input.orderbook.marketId !== input.orderbookMarketId) return false;
  const normalizedOrderbookOutcomeId = normalizeOutcomeId(input.orderbook.outcomeId);
  const normalizedSelectedOutcomeId = normalizeOutcomeId(input.orderbookOutcomeId);
  if (
    normalizedSelectedOutcomeId &&
    (normalizedSelectedOutcomeId === 'YES' || normalizedSelectedOutcomeId === 'NO') &&
    normalizedOrderbookOutcomeId !== normalizedSelectedOutcomeId
  ) {
    return false;
  }
  if (
    normalizedOrderbookOutcomeId &&
    normalizedSelectedOutcomeId &&
    normalizedOrderbookOutcomeId !== normalizedSelectedOutcomeId
  ) {
    return false;
  }
  if (input.snapshotStatus === 'resyncing') return false;
  if (input.orderbook.status === 'blocked' || input.orderbook.status === 'unavailable') return false;
  return true;
};

export const resolveSelectedOutcomeDisplayValues = (input: {
  current: TerminalOutcomeDisplayValues | null;
  fallback: TerminalOutcomeDisplayValues | null;
  live: TerminalOutcomeDisplayValues;
  liveReady: boolean;
}): TerminalOutcomeDisplayValues => {
  if (input.liveReady) return input.live;
  return input.current ?? input.fallback ?? input.live;
};

const hasCoherentOutcomeDisplayValues = (
  values: TerminalOutcomeDisplayValues | null,
  binary: boolean,
): values is TerminalOutcomeDisplayValues => Boolean(
  values?.yesPrice &&
  values.probability &&
  (!binary || values.noPrice),
);

export const resolveExpandedOutcomeDisplayValues = (input: {
  summary: TerminalOutcomeDisplayValues | null;
  orderbook: TerminalOutcomeDisplayValues | null;
  fallback: TerminalOutcomeDisplayValues | null;
  binary: boolean;
  selectedSide?: 'yes' | 'no';
}): TerminalOutcomeDisplayValues | null => {
  if (hasCoherentOutcomeDisplayValues(input.orderbook, input.binary)) {
    // A No-token order book has its own midpoint, but the card probability is
    // the underlying outcome's YES probability. Do not turn `1 - No midpoint`
    // into a transient-looking ~50% outcome probability.
    if (input.selectedSide === 'no' && input.binary && input.summary?.probability) {
      return {
        yesPrice: input.orderbook.yesPrice ?? input.summary.yesPrice,
        noPrice: input.orderbook.noPrice ?? input.summary.noPrice,
        probability: input.summary.probability,
      };
    }
    return input.orderbook;
  }
  if (hasCoherentOutcomeDisplayValues(input.summary, input.binary)) return input.summary;
  return input.fallback ?? input.summary ?? input.orderbook;
};

export const preferResolvedOutcomeOrderbookVenues = <T extends {
  venue: string;
  venueOutcomeId: string | null;
}>(venues: readonly T[]): T[] => {
  const venuesWithResolvedOutcome = new Set(
    venues
      .filter((venue) => Boolean(venue.venueOutcomeId?.trim()))
      .map((venue) => normalizeVenueKey(venue.venue)),
  );
  if (venuesWithResolvedOutcome.size === 0) return [...venues];
  return venues.filter((venue) => (
    !venuesWithResolvedOutcome.has(normalizeVenueKey(venue.venue)) ||
    Boolean(venue.venueOutcomeId?.trim())
  ));
};

const sameDisplayValues = (
  left: TerminalOutcomeDisplayValues | null,
  right: TerminalOutcomeDisplayValues | null,
): boolean => (
  left?.yesPrice === right?.yesPrice &&
  left?.noPrice === right?.noPrice &&
  left?.probability === right?.probability
);

const sameStringArray = (left: readonly string[], right: readonly string[]): boolean => (
  left.length === right.length && left.every((value, index) => value === right[index])
);

const sameVenueQuotes = (
  left: readonly TerminalVenueQuoteDisplay[],
  right: readonly TerminalVenueQuoteDisplay[],
): boolean => (
  left.length === right.length && left.every((quote, index) => (
    quote.venue === right[index]?.venue &&
    quote.yesPrice === right[index]?.yesPrice &&
    quote.noPrice === right[index]?.noPrice &&
    quote.blocker === right[index]?.blocker
  ))
);

export const shouldSyncSelectedOutcomeRowDisplay = (input: {
  current: TerminalOutcomeDisplayValues | null;
  next: TerminalOutcomeDisplayValues | null;
  outcomeExpanded: boolean;
  orderbookUsable: boolean;
}): boolean => {
  if (!input.next) return false;
  if (input.outcomeExpanded && input.orderbookUsable) return false;
  return !sameDisplayValues(input.current, input.next);
};

export const mergeTerminalOutcomeRowDisplay = <T extends TerminalOutcomeRowDisplay>(
  current: T,
  next: TerminalOutcomeRowDisplay,
): T => {
  if (
    current.platforms === next.platforms &&
    current.prob === next.prob &&
    current.yesPrice === next.yesPrice &&
    current.noPrice === next.noPrice &&
    current.primaryVenue === next.primaryVenue &&
    current.status === next.status &&
    current.blocker === next.blocker &&
    current.quoteReady === next.quoteReady &&
    current.quoteUpdatedAt === next.quoteUpdatedAt &&
    current.quoteFreshnessMs === next.quoteFreshnessMs &&
    current.quoteSource === next.quoteSource &&
    current.yesAskPrice === next.yesAskPrice &&
    current.noAskPrice === next.noAskPrice &&
    sameStringArray(current.venues, next.venues) &&
    sameVenueQuotes(current.venueQuotes, next.venueQuotes)
  ) {
    return current;
  }

  return {
    ...current,
    ...next,
  };
};

export const resolveVisibleSelectedOutcomeOrderbook = (input: {
  current: MarketOrderbookResponse | null;
  next: MarketOrderbookResponse | null;
  nextReady: boolean;
  nextUsable: boolean;
}): MarketOrderbookResponse | null => {
  if (input.nextReady && input.next) return input.next;
  if (!input.current && input.nextUsable && input.next) return input.next;
  return input.current;
};

export const resolveSelectedOutcomeOrderbookDisplaySource = (input: {
  live: MarketOrderbookResponse | null;
  visible: MarketOrderbookResponse | null;
}): MarketOrderbookResponse | null => {
  if (input.live && hasUsableOrderbookDepth(input.live)) return input.live;
  return input.visible ?? input.live;
};

export const resolveOutcomePriceVenues = (input: {
  primaryVenue: string | null;
  venueQuotes: readonly TerminalVenueQuoteDisplay[];
  yesPrice: string | null | undefined;
  noPrice: string | null | undefined;
  orderbook: MarketOrderbookResponse | null;
  expanded: boolean;
}): VenueBadgeResolution => {
  const bestAskVenue = input.orderbook?.asks
    .map((level, index) => ({
      venue: level.venue?.trim() ?? '',
      price: orderbookPriceValue(level.price),
      index,
    }))
    .filter((level) => level.venue && level.price !== null)
    .sort((left, right) => (left.price! - right.price!) || (left.index - right.index))[0]?.venue;
  if (bestAskVenue) {
    // The combined orderbook is the source of truth for executable pricing.
    // Its lowest ask may differ from the aggregate live-price venue or the
    // previously selected summary venue.
    return {
      yesVenue: bestAskVenue,
      noVenue: bestAskVenue,
    };
  }

  const normalizedYesPrice = normalizeDisplayPriceLabel(input.yesPrice);
  const normalizedNoPrice = normalizeDisplayPriceLabel(input.noPrice);
  const matchingYesVenue = normalizedYesPrice
    ? input.venueQuotes.find((quote) => normalizeDisplayPriceLabel(quote.yesPrice) === normalizedYesPrice)?.venue ?? null
    : null;
  const matchingNoVenue = normalizedNoPrice
    ? input.venueQuotes.find((quote) => normalizeDisplayPriceLabel(quote.noPrice) === normalizedNoPrice)?.venue ?? null
    : null;

  return {
    yesVenue: matchingYesVenue ?? input.primaryVenue,
    noVenue: matchingNoVenue ?? matchingYesVenue ?? input.primaryVenue,
  };
};

export const orderSelectedOutcomeVisibleVenues = (
  venues: readonly string[],
  preferredOrder: readonly string[] = [],
): string[] => {
  const preferredRank = new Map<string, number>();
  preferredOrder.forEach((venue, index) => {
    preferredRank.set(normalizeVenueKey(venue), index);
  });
  return [...venues].sort((left, right) => {
    const leftRank = preferredRank.get(normalizeVenueKey(left)) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = preferredRank.get(normalizeVenueKey(right)) ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.localeCompare(right);
  });
};

export const shouldResetOrderbookForRequestChange = (
  previousRequestKey: string | null,
  nextRequestKey: string,
): boolean => previousRequestKey !== nextRequestKey;

export const shouldReuseSelectedOutcomeState = (input: {
  currentOutcomeId: string | null;
  nextOutcomeId: string | null;
  currentRefreshKey: string | null;
  nextRefreshKey: string | null;
}): boolean => (
  input.currentOutcomeId === input.nextOutcomeId &&
  input.currentRefreshKey === input.nextRefreshKey
);

export const shouldResetExpandedOutcomeForMarketChange = (
  previousMarketResetKey: string | null,
  nextMarketResetKey: string,
): boolean => previousMarketResetKey !== nextMarketResetKey;

export const resolveOutcomeSeedMedia = (input: {
  imageUrl?: string | null;
  iconUrl?: string | null;
  fallbackImageUrl?: string | null;
  fallbackIconUrl?: string | null;
}): { imageUrl: string | null; iconUrl: string | null } => ({
  imageUrl: input.imageUrl ?? input.fallbackImageUrl ?? null,
  iconUrl: input.iconUrl ?? input.fallbackIconUrl ?? null,
});

export const resolveSelectedMarketSeedMedia = (input: {
  marketImageUrl?: string | null;
  marketIconUrl?: string | null;
  outcomeImageUrl?: string | null;
  outcomeIconUrl?: string | null;
}): { imageUrl: string | null; iconUrl: string | null } => ({
  imageUrl: input.marketImageUrl ?? input.outcomeImageUrl ?? null,
  iconUrl: input.marketIconUrl ?? input.outcomeIconUrl ?? null,
});

export const resolveSelectedMarketHydratedMedia = (input: {
  currentImageUrl?: string | null;
  currentIconUrl?: string | null;
  hydratedImageUrl?: string | null;
  hydratedIconUrl?: string | null;
}): { imageUrl: string | null; iconUrl: string | null } => ({
  imageUrl: input.currentImageUrl ?? input.hydratedImageUrl ?? null,
  iconUrl: input.currentIconUrl ?? input.hydratedIconUrl ?? null,
});

export const resolveInitialSelectedOutcomeId = <T extends { id: string }>(
  initialOutcomeId: string | null | undefined,
  rows: readonly T[],
): string | null => {
  if (initialOutcomeId && rows.some((row) => row.id === initialOutcomeId)) {
    return initialOutcomeId;
  }
  return rows[0]?.id ?? null;
};

export const resolveOutcomeSummaryVenues = (
  livePrice: MarketLivePriceItem | null | undefined,
  fallbackVenues: readonly string[] = [],
): string[] => {
  const source = livePrice
    ? livePrice.linkedVenues?.length
      ? livePrice.linkedVenues
      : livePrice.venueBreakdown?.length
        ? livePrice.venueBreakdown.map((venue) => venue.venue)
        : livePrice.venues?.length
          ? livePrice.venues
          : livePrice.liveVenues?.length
            ? livePrice.liveVenues
            : []
    : fallbackVenues;
  return [...new Set(source
    .map((venue) => typeof venue === 'string' ? venue.trim() : '')
    .filter(Boolean))];
};

export const resolveOutcomeSummaryVenueCount = (
  livePrice: MarketLivePriceItem | null | undefined,
  fallbackVenues: readonly string[] = [],
): number => {
  if (livePrice?.linkedVenueCount && livePrice.linkedVenueCount > 0) return livePrice.linkedVenueCount;
  return resolveOutcomeSummaryVenues(livePrice, fallbackVenues).length;
};

const parseDisplayProbabilityValue = (value: string | number | null | undefined): number | null => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    return value > 1 ? value / 100 : value;
  }
  if (!value || value === 'Quote') return null;
  const hasDisplayUnit = /[%c¢]/i.test(value) || value.includes('Â');
  const parsed = Number(value.replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return hasDisplayUnit || parsed > 1 ? parsed / 100 : parsed;
};

const isReasonableLivePriceValue = (
  price: number,
  referencePrice: string | number | null | undefined,
): boolean => {
  if (!Number.isFinite(price) || price <= 0) return false;
  const normalizedPrice = price > 1 ? price / 100 : price;
  const normalizedReference = parseDisplayProbabilityValue(referencePrice);
  if (normalizedReference === null) return normalizedPrice > 0 && normalizedPrice < LIVE_PRICE_EXTREME_THRESHOLD;
  if (normalizedPrice - normalizedReference > LIVE_PRICE_OUTLIER_DIFF_THRESHOLD) return false;
  if (normalizedPrice >= LIVE_PRICE_EXTREME_THRESHOLD && normalizedReference < 0.75) return false;
  return normalizedPrice <= 1;
};

const isConsistentWithVenueBreakdown = (
  price: number,
  livePrice: MarketLivePriceItem | null | undefined,
): boolean => {
  if (!Number.isFinite(price) || price <= 0) return false;
  const normalizedPrice = price > 1 ? price / 100 : price;
  const venuePrices = (livePrice?.venueBreakdown ?? [])
    .filter((venue) => {
      if (venue.status !== 'live') return false;
      const bid = parseDisplayProbabilityValue(venue.bestBid);
      const ask = parseDisplayProbabilityValue(venue.bestAsk);
      if (bid === null || ask === null) return true;
      return ask >= bid && ask - bid <= LIVE_PRICE_VENUE_MAX_SPREAD;
    })
    .map((venue) => parseDisplayProbabilityValue(venue.price))
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0)
    .sort((left, right) => left - right);
  if (venuePrices.length === 0) return true;
  const middleIndex = Math.floor(venuePrices.length / 2);
  const medianVenuePrice = venuePrices.length % 2 === 0
    ? (venuePrices[middleIndex - 1]! + venuePrices[middleIndex]!) / 2
    : venuePrices[middleIndex]!;
  const allowedDrift = Math.max(0.08, medianVenuePrice * 1.5);
  return Math.abs(normalizedPrice - medianVenuePrice) <= allowedDrift;
};

const bestVenueAskFromBreakdown = (livePrice: MarketLivePriceItem | null | undefined): number | null => {
  const asks = (livePrice?.venueBreakdown ?? [])
    .flatMap((venue) => {
      if (venue.status !== 'live') return [];
      const ask = parseDisplayProbabilityValue(venue.bestAsk);
      if (ask === null || ask <= 0 || ask >= 1) return [];
      const bid = parseDisplayProbabilityValue(venue.bestBid);
      if (bid !== null && (ask < bid || ask - bid > LIVE_PRICE_VENUE_MAX_SPREAD)) return [];
      return [ask];
    });
  return asks.length > 0 ? Math.min(...asks) : null;
};

export const bestVenueFromLivePrice = (livePrice: MarketLivePriceItem | null | undefined): string | null => {
  const candidates = (livePrice?.venueBreakdown ?? [])
    .filter((venue) => venue.status === 'live')
    .map((venue) => {
      const ask = parseDisplayProbabilityValue(venue.bestAsk) ?? parseDisplayProbabilityValue(venue.price);
      const bid = parseDisplayProbabilityValue(venue.bestBid);
      if (ask === null || ask <= 0 || ask >= 1) return null;
      if (bid !== null && (ask < bid || ask - bid > LIVE_PRICE_VENUE_MAX_SPREAD)) return null;
      return { venue: venue.venue, ask };
    })
    .filter((candidate): candidate is { venue: string; ask: number } => Boolean(candidate?.venue))
    .sort((left, right) => left.ask - right.ask);
  return candidates[0]?.venue ?? livePrice?.bestVenue ?? null;
};

export const hasCompleteLivePriceVenueBreakdown = (
  livePrice: MarketLivePriceItem | null | undefined,
  expectedVenues: readonly string[] = [],
): boolean => {
  const breakdown = livePrice?.venueBreakdown ?? [];
  if (breakdown.length === 0) return false;

  const expectedVenueKeys = new Set([
    ...expectedVenues,
    ...(livePrice?.linkedVenues ?? []),
    ...(livePrice?.venues ?? []),
  ].map(normalizeVenueKey).filter(Boolean));
  // A venue key can be present while its quote is still unavailable. Do not
  // treat that placeholder as a complete snapshot: otherwise a faster venue
  // can temporarily become the headline price before the canonical venue
  // arrives.
  const liveBreakdownVenueKeys = new Set(
    breakdown
      .filter((venue) => venue.status === 'live')
      .map((venue) => normalizeVenueKey(venue.venue))
      .filter(Boolean),
  );
  if (expectedVenueKeys.size > 0) {
    return [...expectedVenueKeys].every((venue) => liveBreakdownVenueKeys.has(venue));
  }

  const declaredVenueCount = Math.max(
    expectedVenueKeys.size,
    livePrice?.venueCount ?? 0,
    livePrice?.linkedVenueCount ?? 0,
  );
  return declaredVenueCount === 0 || liveBreakdownVenueKeys.size >= declaredVenueCount;
};

export const isLivePriceVenueSelectionProvisional = (
  livePrice: MarketLivePriceItem | null | undefined,
  expectedVenues: readonly string[] = [],
): boolean => {
  if (!livePrice) return false;
  // `linkedVenues` describes the full venue family, including venues that are
  // currently blocked or have no quote. When the backend reports an explicit
  // live venue count, a live mark from that subset is still the authoritative
  // consolidated quote and must not be replaced by the catalog fallback.
  if (livePrice.status === 'live' && typeof livePrice.liveVenueCount === 'number' && livePrice.liveVenueCount > 0) {
    return false;
  }
  const expectedVenueCount = Math.max(
    expectedVenues.length,
    livePrice.venueCount ?? 0,
    livePrice.linkedVenueCount ?? 0,
    livePrice.venueBreakdown?.length ?? 0,
  );
  return expectedVenueCount > 1 && !hasCompleteLivePriceVenueBreakdown(livePrice, expectedVenues);
};

export const displayableLivePriceValue = (
  livePrice: MarketLivePriceItem | null | undefined,
  referencePrice?: string | number | null,
): number | null => {
  // `price` is the backend's coherent live mark: normally the best-execution
  // venue midpoint, with best ask/bid only as an explicit fallback. Keep
  // executable asks separate so the probability does not silently become a
  // buy price again.
  const price = livePrice?.price !== null && livePrice?.price !== undefined ? Number(livePrice.price) : NaN;
  if (isReasonableLivePriceValue(price, referencePrice) && isConsistentWithVenueBreakdown(price, livePrice)) return price;
  const midpoint = livePrice?.midpoint !== null && livePrice?.midpoint !== undefined ? Number(livePrice.midpoint) : NaN;
  if (isReasonableLivePriceValue(midpoint, referencePrice) && isConsistentWithVenueBreakdown(midpoint, livePrice)) return midpoint;
  const averagePrice = livePrice?.averagePrice !== null && livePrice?.averagePrice !== undefined ? Number(livePrice.averagePrice) : NaN;
  if (isReasonableLivePriceValue(averagePrice, referencePrice) && isConsistentWithVenueBreakdown(averagePrice, livePrice)) return averagePrice;
  const venueBestAsk = bestVenueAskFromBreakdown(livePrice);
  if (venueBestAsk !== null && isReasonableLivePriceValue(venueBestAsk, referencePrice)) return venueBestAsk;
  const bestAsk = livePrice?.bestAsk !== null && livePrice?.bestAsk !== undefined ? Number(livePrice.bestAsk) : NaN;
  if (isReasonableLivePriceValue(bestAsk, referencePrice) && isConsistentWithVenueBreakdown(bestAsk, livePrice)) return bestAsk;
  return null;
};

export const resolveLivePriceForTerminalOutcome = (input: {
  prices: readonly MarketLivePriceItem[];
  marketId: string | null | undefined;
  canonicalMarketIds?: readonly string[] | null | undefined;
  outcomeId: string | null | undefined;
}): MarketLivePriceItem | null => {
  const candidateMarketIds = new Set<string>();
  if (input.marketId) candidateMarketIds.add(input.marketId);
  for (const canonicalMarketId of input.canonicalMarketIds ?? []) {
    if (canonicalMarketId) candidateMarketIds.add(canonicalMarketId);
  }

  if (candidateMarketIds.size === 0) return null;
  const normalizedOutcomeId = normalizeOutcomeId(input.outcomeId);
  const directMatch = input.prices.find((price) =>
    candidateMarketIds.has(price.marketId) &&
    normalizeOutcomeId(price.outcomeId) === normalizedOutcomeId
  );
  if (directMatch) return directMatch;

  if (normalizedOutcomeId !== null) return null;

  return input.prices.find((price) =>
    candidateMarketIds.has(price.marketId) &&
    normalizeOutcomeId(price.outcomeId) === normalizedOutcomeId
  ) ?? null;
};
