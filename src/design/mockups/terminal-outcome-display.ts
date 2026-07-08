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

const hasUsableOrderbookDepth = (orderbook: MarketOrderbookResponse | null): boolean =>
  Boolean(orderbook && (orderbook.bids.length > 0 || orderbook.asks.length > 0 || orderbook.bestBid || orderbook.bestAsk));

export const isSelectedOutcomeBookReady = (input: SelectedOutcomeBookReadinessInput): boolean => {
  if (!input.orderbook || !input.orderbookMarketId) return false;
  if (!hasUsableOrderbookDepth(input.orderbook)) return false;
  if (input.orderbook.marketId !== input.orderbookMarketId) return false;
  const normalizedOrderbookOutcomeId = normalizeOutcomeId(input.orderbook.outcomeId);
  const normalizedSelectedOutcomeId = normalizeOutcomeId(input.orderbookOutcomeId);
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
  if (input.expanded) {
    const topAskVenue = input.orderbook?.asks[0]?.venue?.trim();
    if (topAskVenue) {
      return {
        yesVenue: topAskVenue,
        noVenue: topAskVenue,
      };
    }
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
      const ask = parseDisplayProbabilityValue(venue.bestAsk);
      if (ask === null || ask <= 0 || ask >= 1) return [];
      const bid = parseDisplayProbabilityValue(venue.bestBid);
      if (bid !== null && (ask < bid || ask - bid > LIVE_PRICE_VENUE_MAX_SPREAD)) return [];
      return [ask];
    });
  return asks.length > 0 ? Math.min(...asks) : null;
};

export const displayableLivePriceValue = (
  livePrice: MarketLivePriceItem | null | undefined,
  referencePrice?: string | number | null,
): number | null => {
  const bestAsk = livePrice?.bestAsk !== null && livePrice?.bestAsk !== undefined ? Number(livePrice.bestAsk) : NaN;
  if (isReasonableLivePriceValue(bestAsk, referencePrice) && isConsistentWithVenueBreakdown(bestAsk, livePrice)) return bestAsk;
  const venueBestAsk = bestVenueAskFromBreakdown(livePrice);
  if (venueBestAsk !== null && isReasonableLivePriceValue(venueBestAsk, referencePrice)) return venueBestAsk;
  const price = livePrice?.price !== null && livePrice?.price !== undefined ? Number(livePrice.price) : NaN;
  if (isReasonableLivePriceValue(price, referencePrice) && isConsistentWithVenueBreakdown(price, livePrice)) return price;
  const averagePrice = livePrice?.averagePrice !== null && livePrice?.averagePrice !== undefined ? Number(livePrice.averagePrice) : NaN;
  if (isReasonableLivePriceValue(averagePrice, referencePrice) && isConsistentWithVenueBreakdown(averagePrice, livePrice)) return averagePrice;
  const midpoint = livePrice?.midpoint !== null && livePrice?.midpoint !== undefined ? Number(livePrice.midpoint) : NaN;
  if (isReasonableLivePriceValue(midpoint, referencePrice) && isConsistentWithVenueBreakdown(midpoint, livePrice)) return midpoint;
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
