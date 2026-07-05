import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MarketCatalogMarket, MarketCatalogVenueMarket } from './api/market-api';
import { getPolymarketEventBySlug, getPolymarketMarketBySlug } from './api/market-api';
import { hydrateCatalogMarketsWithAggregateVolumes } from './catalog-volume';

vi.mock('./api/market-api', async () => {
  const actual = await vi.importActual<typeof import('./api/market-api')>('./api/market-api');
  return {
    ...actual,
    getPolymarketMarketBySlug: vi.fn(),
    getPolymarketEventBySlug: vi.fn(),
  };
});

const getPolymarketMarketBySlugMock = vi.mocked(getPolymarketMarketBySlug);
const getPolymarketEventBySlugMock = vi.mocked(getPolymarketEventBySlug);

const buildVenueMarket = (
  venue: string,
  volume: string | null,
  volume24h: string | null,
  marketSlug?: string | null,
): MarketCatalogVenueMarket => ({
  imageUrl: null,
  iconUrl: null,
  volume,
  volume24h,
  liquidity: null,
  buyVolume: null,
  sellVolume: null,
  tradeCount: null,
  buyCount: null,
  sellCount: null,
  canonicalMarketId: `${venue}-canonical`,
  canonicalMarketTitle: `${venue} title`,
  venue,
  venueMarketProfileId: `${venue}-profile`,
  venueMarketId: `${venue}-market`,
  marketSlug: marketSlug ?? null,
  eventSlug: null,
  sourceUrl: null,
  venueTitle: `${venue} title`,
  marketClass: 'BINARY',
  outcomes: [],
  resolutionSource: null,
  resolutionTitle: null,
  resolutionRulesText: null,
  network: null,
  chain: null,
  change24h: null,
  changePercent24h: null,
  expiresAt: null,
  resolvesAt: null,
});

const buildMarket = (
  title: string,
  venueMarkets: MarketCatalogVenueMarket[],
): MarketCatalogMarket => ({
  imageUrl: null,
  iconUrl: null,
  volume: null,
  volume24h: null,
  liquidity: null,
  buyVolume: null,
  sellVolume: null,
  tradeCount: null,
  buyCount: null,
  sellCount: null,
  canonicalEventId: 'event-1',
  canonicalMarketIds: [`${title.toLowerCase()}-id`],
  title,
  normalizedTitle: title.toLowerCase(),
  category: 'Sports',
  marketClass: 'BINARY',
  status: 'OPEN',
  startsAt: null,
  expiresAt: null,
  resolvesAt: null,
  venues: venueMarkets.map((venueMarket) => venueMarket.venue),
  venueCount: venueMarkets.length,
  venueMarketCount: venueMarkets.length,
  outcomeCount: 2,
  routeability: {
    hasSingleVenue: false,
    hasCrossVenue: true,
  },
  venueMarkets,
  updatedAt: '2026-07-06T00:00:00Z',
});

describe('hydrateCatalogMarketsWithAggregateVolumes', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('aggregates venue volumes and hydrates polymarket from the live event snapshot', async () => {
    const franceSlug = 'will-france-win-the-2026-fifa-world-cup-924';
    const spainSlug = 'will-spain-win-the-2026-fifa-world-cup-413';
    const markets = [
      buildMarket('France', [
        buildVenueMarket('POLYMARKET', '13670000', '125000', franceSlug),
        buildVenueMarket('KALSHI', '10000000', '220000'),
        buildVenueMarket('MYRIAD', '4000000', '45000'),
      ]),
      buildMarket('Spain', [
        buildVenueMarket('POLYMARKET', '8200000', '88000', spainSlug),
        buildVenueMarket('KALSHI', '2000000', '33000'),
      ]),
    ];

    getPolymarketMarketBySlugMock.mockResolvedValue({
      slug: franceSlug,
      question: 'Will France win the 2026 FIFA World Cup?',
      volumeClob: '13670000',
      volume24hrClob: '125000',
      events: [{ slug: 'world-cup-winner', title: 'World Cup Winner' }],
    });
    getPolymarketEventBySlugMock.mockResolvedValue({
      slug: 'world-cup-winner',
      title: 'World Cup Winner',
      markets: [
        { slug: franceSlug, question: 'France', volumeClob: '95000000', volume24hrClob: '510000' },
        { slug: spainSlug, question: 'Spain', volumeClob: '24000000', volume24hrClob: '145000' },
      ],
    });

    const hydrated = await hydrateCatalogMarketsWithAggregateVolumes(markets);

    expect(getPolymarketMarketBySlugMock).toHaveBeenCalledTimes(1);
    expect(getPolymarketMarketBySlugMock).toHaveBeenCalledWith(franceSlug);
    expect(getPolymarketEventBySlugMock).toHaveBeenCalledTimes(1);
    expect(getPolymarketEventBySlugMock).toHaveBeenCalledWith('world-cup-winner');
    expect(hydrated[0]?.volume).toBe('109000000');
    expect(hydrated[0]?.volume24h).toBe('775000');
    expect(hydrated[1]?.volume).toBe('26000000');
    expect(hydrated[1]?.volume24h).toBe('178000');
  });

  it('falls back to the direct market snapshot when the event hydration fails', async () => {
    const franceSlug = 'will-france-win-the-2026-fifa-world-cup-924';
    const markets = [
      buildMarket('France', [
        buildVenueMarket('POLYMARKET', '13670000', '125000', franceSlug),
        buildVenueMarket('KALSHI', '10000000', '220000'),
      ]),
    ];

    getPolymarketMarketBySlugMock.mockResolvedValue({
      slug: franceSlug,
      question: 'Will France win the 2026 FIFA World Cup?',
      volumeClob: '95000000',
      volume24hrClob: '510000',
      events: [{ slug: 'world-cup-winner', title: 'World Cup Winner' }],
    });
    getPolymarketEventBySlugMock.mockRejectedValue(new Error('boom'));

    const hydrated = await hydrateCatalogMarketsWithAggregateVolumes(markets);

    expect(hydrated[0]?.volume).toBe('105000000');
    expect(hydrated[0]?.volume24h).toBe('730000');
  });
});
