import {
  getPolymarketMarketBySlug,
  type MarketCatalogMarket,
  type PolymarketMarketSnapshot,
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

const polymarketSnapshotVolume = (snapshot: PolymarketMarketSnapshot): number | null =>
  parsePositiveMetric(snapshot.volumeClob ?? snapshot.volume);

const polymarketSnapshotVolume24h = (snapshot: PolymarketMarketSnapshot): number | null =>
  parsePositiveMetric(snapshot.volume24hrClob ?? snapshot.volume24hr);

const aggregateVenueMetric = async (
  market: MarketCatalogMarket,
  selector: (market: MarketCatalogMarket['venueMarkets'][number]) => string | number | null | undefined,
  polymarketSelector?: ((snapshot: PolymarketMarketSnapshot) => number | null) | null,
): Promise<string | null> => {
  const metricByVenue = new Map<string, number>();
  for (const venueMarket of market.venueMarkets) {
    const venueKey = normalizeVenueKey(venueMarket.venue);
    if (!venueKey) continue;
    const parsed = parsePositiveMetric(selector(venueMarket));
    if (parsed === null) continue;
    metricByVenue.set(venueKey, Math.max(metricByVenue.get(venueKey) ?? 0, parsed));
  }

  if (polymarketSelector && !metricByVenue.has('POLYMARKET')) {
    const slug = polymarketSlugForCatalogMarket(market);
    if (slug) {
      try {
        const snapshot = await getPolymarketMarketBySlug(slug);
        const parsed = polymarketSelector(snapshot);
        if (parsed !== null) {
          metricByVenue.set('POLYMARKET', parsed);
        }
      } catch {
        // Fall back to backend catalog metrics when the venue API is unavailable.
      }
    }
  }

  const total = [...metricByVenue.values()].reduce((sum, value) => sum + value, 0);
  return total > 0 ? String(total) : null;
};

export const hydrateCatalogMarketsWithAggregateVolumes = async (
  markets: MarketCatalogMarket[],
): Promise<MarketCatalogMarket[]> => {
  return Promise.all(markets.map(async (market) => {
    const [volume, volume24h] = await Promise.all([
      aggregateVenueMetric(market, (venueMarket) => venueMarket.volume, polymarketSnapshotVolume),
      aggregateVenueMetric(market, (venueMarket) => venueMarket.volume24h, polymarketSnapshotVolume24h),
    ]);

    if (!volume && !volume24h) return market;

    return {
      ...market,
      volume: volume ?? market.volume,
      volume24h: volume24h ?? market.volume24h,
    };
  }));
};
