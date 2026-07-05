import {
  getPolymarketEventBySlug,
  getPolymarketMarketBySlug,
  type MarketCatalogMarket,
  type PolymarketEventSnapshot,
} from '@/features/markets/api/market-api';

const parsePositiveMetric = (value: string | number | null | undefined): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[$,%\s,]/g, '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const normalizeVenueKey = (value: string | null | undefined): string => (
  typeof value === 'string'
    ? value.trim().replace(/[\s.-]+/g, '_').toUpperCase()
    : ''
);

const polymarketSlugForCatalogMarket = (market: MarketCatalogMarket): string | null => (
  market.venueMarkets.find((venueMarket) =>
    normalizeVenueKey(venueMarket.venue) === 'POLYMARKET' &&
    typeof venueMarket.marketSlug === 'string' &&
    venueMarket.marketSlug.trim().length > 0
  )?.marketSlug?.trim() ?? null
);

const polymarketSnapshotMetrics = (snapshot: {
  volume?: string | number | null;
  volumeClob?: string | number | null;
  volume24hr?: string | number | null;
  volume24hrClob?: string | number | null;
}) => ({
  volume: parsePositiveMetric(snapshot.volumeClob ?? snapshot.volume),
  volume24h: parsePositiveMetric(snapshot.volume24hrClob ?? snapshot.volume24hr),
});

const buildPolymarketVolumeMap = (snapshot: PolymarketEventSnapshot): Map<string, { volume: number | null; volume24h: number | null }> => {
  const bySlug = new Map<string, { volume: number | null; volume24h: number | null }>();
  for (const market of snapshot.markets) {
    if (!market.slug) continue;
    bySlug.set(market.slug, polymarketSnapshotMetrics(market));
  }
  return bySlug;
};

const resolvePolymarketVolumeMap = async (markets: MarketCatalogMarket[]): Promise<Map<string, { volume: number | null; volume24h: number | null }>> => {
  const firstSlug = markets.map(polymarketSlugForCatalogMarket).find((slug): slug is string => Boolean(slug));
  if (!firstSlug) return new Map();

  let firstMarket;
  try {
    firstMarket = await getPolymarketMarketBySlug(firstSlug);
  } catch {
    return new Map();
  }

  const fallback = new Map([[firstSlug, polymarketSnapshotMetrics(firstMarket)]]);
  const eventSlug = firstMarket.events?.find((event) => typeof event.slug === 'string' && event.slug.trim().length > 0)?.slug?.trim();
  if (!eventSlug) {
    return fallback;
  }

  try {
    const eventSnapshot = await getPolymarketEventBySlug(eventSlug);
    const bySlug = buildPolymarketVolumeMap(eventSnapshot);
    return bySlug.size > 0 ? bySlug : fallback;
  } catch {
    return fallback;
  }
};

const aggregateVenueMetric = (
  market: MarketCatalogMarket,
  selector: (venueMarket: MarketCatalogMarket['venueMarkets'][number]) => string | number | null | undefined,
  polymarketMetricsBySlug: Map<string, { volume: number | null; volume24h: number | null }>,
  polymarketMetricKey: 'volume' | 'volume24h',
): string | null => {
  const metricByVenue = new Map<string, number>();
  for (const venueMarket of market.venueMarkets) {
    const venueKey = normalizeVenueKey(venueMarket.venue);
    if (!venueKey) continue;
    const parsed = parsePositiveMetric(selector(venueMarket));
    if (parsed === null) continue;
    metricByVenue.set(venueKey, Math.max(metricByVenue.get(venueKey) ?? 0, parsed));
  }

  const polymarketSlug = polymarketSlugForCatalogMarket(market);
  const polymarketMetric = polymarketSlug ? polymarketMetricsBySlug.get(polymarketSlug)?.[polymarketMetricKey] ?? null : null;
  if (polymarketMetric !== null) {
    metricByVenue.set('POLYMARKET', Math.max(metricByVenue.get('POLYMARKET') ?? 0, polymarketMetric));
  }

  const total = [...metricByVenue.values()].reduce((sum, value) => sum + value, 0);
  return total > 0 ? String(total) : null;
};

export const hydrateCatalogMarketsWithAggregateVolumes = async (
  markets: MarketCatalogMarket[],
): Promise<MarketCatalogMarket[]> => {
  const polymarketMetricsBySlug = await resolvePolymarketVolumeMap(markets);

  return markets.map((market) => {
    const volume = aggregateVenueMetric(
      market,
      (venueMarket) => venueMarket.volume,
      polymarketMetricsBySlug,
      'volume',
    );
    const volume24h = aggregateVenueMetric(
      market,
      (venueMarket) => venueMarket.volume24h,
      polymarketMetricsBySlug,
      'volume24h',
    );

    if (!volume && !volume24h) return market;

    return {
      ...market,
      volume: volume ?? market.volume,
      volume24h: volume24h ?? market.volume24h,
    };
  });
};
