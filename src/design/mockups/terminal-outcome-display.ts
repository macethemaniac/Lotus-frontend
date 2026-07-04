import type { MarketOrderbookResponse, MarketOrderbookSnapshotStatus } from '@/features/markets/api/market-api';

export type TerminalOutcomeDisplayValues = {
  yesPrice: string | null;
  noPrice: string | null;
  probability: string | null;
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
