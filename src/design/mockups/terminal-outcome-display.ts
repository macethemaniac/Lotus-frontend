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
  if (!input.outcomeExpanded && input.current !== null) return false;
  return !sameDisplayValues(input.current, input.next);
};

export const shouldApplyLatchedOutcomeDisplay = (
  displayOutcomeId: string | null | undefined,
  outcomeId: string | null | undefined,
): boolean => (
  typeof displayOutcomeId === 'string'
  && displayOutcomeId.length > 0
  && typeof outcomeId === 'string'
  && outcomeId.length > 0
  && displayOutcomeId === outcomeId
);

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

  return input.prices.find((price) =>
    candidateMarketIds.has(price.marketId) &&
    (normalizedOutcomeId === null || normalizeOutcomeId(price.outcomeId) === normalizedOutcomeId)
  ) ?? null;
};
