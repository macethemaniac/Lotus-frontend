import type {
  MarketOrderbookResponse,
  MarketOrderbookSnapshotStatus,
  MarketOrderbookStreamPayload,
} from '@/features/markets/api/market-api';

const isIsoTimestampLike = (value: string): boolean => Number.isFinite(Date.parse(value));

export const readableQuoteBlocker = (reason: string | null | undefined): string | null => {
  if (!reason) return null;
  if (isIsoTimestampLike(reason)) return null;
  const normalized = reason.toUpperCase();
  if (normalized.includes('LAST_GOOD_ORDERBOOK_USED')) return 'Using last good orderbook';
  if (normalized.includes('LIVE_ORDERBOOK_REQUIRED')) return 'Live orderbook syncing';
  if (normalized.includes('OPINION_TOKEN_ID_MISSING')) return 'Opinion token mapping missing';
  if (normalized.includes('VENUE_OUTCOME_ID_MISSING')) return 'Outcome token mapping missing';
  if (normalized.includes('QUOTE_PROVIDER_TIMEOUT')) return 'Provider timeout';
  if (normalized.includes('QUOTE_PROVIDER_EMPTY_BOOK')) return 'No live depth';
  if (normalized.includes('QUOTE_PROVIDER_BAD_PAYLOAD')) return 'Provider payload unavailable';
  const http = normalized.match(/QUOTE_PROVIDER_HTTP_(\d{3})/);
  if (http?.[1] === '429') return 'Venue quote provider rate limited';
  if (http) return `Provider unavailable (${http[1]})`;
  if (normalized.includes('QUOTE_READER_UNSUPPORTED')) return 'Venue quote reader unsupported';
  if (normalized.includes('QUOTE_SNAPSHOT_STALE')) return 'Stale quote';
  if (normalized.includes('QUOTE_SNAPSHOT')) return 'Quote snapshot syncing';
  if (normalized.includes('QUOTE_READER_FAILED')) return 'Venue quote unavailable';
  return reason.replace(/[_-]+/g, ' ').toLowerCase();
};

export const normalizeStreamBlocker = (blocker: unknown): string | null => {
  if (typeof blocker === 'string') return readableQuoteBlocker(blocker) ?? blocker;
  if (!blocker || typeof blocker !== 'object') return null;
  const record = blocker as Record<string, unknown>;
  const reason = [
    record.reason,
    record.message,
    typeof record.detailsCode === 'string' && !isIsoTimestampLike(record.detailsCode) ? record.detailsCode : null,
    record.code,
  ].find((value) => typeof value === 'string');
  return typeof reason === 'string' ? readableQuoteBlocker(reason) ?? reason : null;
};

export const normalizeStreamResponseBlockers = (
  payload: MarketOrderbookStreamPayload
): MarketOrderbookResponse['blockers'] => (payload.blockers ?? [])
  .reduce<MarketOrderbookResponse['blockers']>((items, blocker) => {
    const reason = normalizeStreamBlocker(blocker);
    if (!reason) return items;
    const record = blocker && typeof blocker === 'object' ? blocker as Record<string, unknown> : {};
    items.push({
      venue: typeof record.venue === 'string' ? record.venue : payload.venue ?? 'UNKNOWN',
      reason,
      venueMarketId: typeof record.venueMarketId === 'string' ? record.venueMarketId : payload.venueMarketId ?? undefined,
      venueOutcomeId: typeof record.venueOutcomeId === 'string' ? record.venueOutcomeId : payload.venueOutcomeId ?? undefined,
      detailsCode: typeof record.detailsCode === 'string' ? record.detailsCode : undefined,
    });
    return items;
  }, []);

export type OrderbookStreamRenderMeta = {
  venue: string | null;
  snapshotStatus?: MarketOrderbookSnapshotStatus;
  freshnessMs: number | null;
  blockers: string[];
};

export const summarizeOrderbookStreamPayload = (
  payload: MarketOrderbookStreamPayload | null | undefined,
): OrderbookStreamRenderMeta | null => {
  if (!payload) return null;
  const blockers = (payload.blockers ?? [])
    .map(normalizeStreamBlocker)
    .filter((blocker): blocker is string => Boolean(blocker));
  if (
    typeof payload.snapshotStatus === 'undefined'
    && payload.freshnessMs == null
    && !payload.venue
    && blockers.length === 0
  ) {
    return null;
  }
  return {
    venue: payload.venue ?? null,
    snapshotStatus: payload.snapshotStatus,
    freshnessMs: payload.freshnessMs ?? null,
    blockers,
  };
};

export const sameOrderbookStreamRenderMeta = (
  left: OrderbookStreamRenderMeta | null,
  right: OrderbookStreamRenderMeta | null,
): boolean => {
  if (left === right) return true;
  if (!left || !right) return false;
  if (
    left.venue !== right.venue
    || left.snapshotStatus !== right.snapshotStatus
    || left.freshnessMs !== right.freshnessMs
    || left.blockers.length !== right.blockers.length
  ) {
    return false;
  }
  return left.blockers.every((blocker, index) => blocker === right.blockers[index]);
};
