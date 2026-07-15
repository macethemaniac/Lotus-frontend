import { describe, expect, it } from 'vitest';

import {
  bestVenueFromLivePrice,
  hasCompleteLivePriceVenueBreakdown,
  isLivePriceVenueSelectionProvisional,
  displayableLivePriceValue,
  isSelectedOutcomeBookUsable,
  isSelectedOutcomeBookReady,
  mergeTerminalOutcomeRowDisplay,
  orderSelectedOutcomeVisibleVenues,
  resolveLivePriceForTerminalOutcome,
  resolveOutcomeSummaryVenueCount,
  resolveOutcomeSummaryVenues,
  resolveOutcomePriceVenues,
  resolveOutcomeSeedMedia,
  resolveExpandedOutcomeDisplayValues,
  preferResolvedOutcomeOrderbookVenues,
  resolveSelectedMarketHydratedMedia,
  resolveSelectedMarketSeedMedia,
  resolveInitialSelectedOutcomeId,
  resolveSelectedOutcomeOrderbookDisplaySource,
  resolveSelectedOutcomeDisplayValues,
  resolveVisibleSelectedOutcomeOrderbook,
  shouldSyncSelectedOutcomeRowDisplay,
  shouldResetOrderbookForRequestChange,
  shouldReuseSelectedOutcomeState,
  shouldResetExpandedOutcomeForMarketChange,
  type TerminalOutcomeDisplayValues,
} from './terminal-outcome-display';

const fallback: TerminalOutcomeDisplayValues = {
  yesPrice: '17c',
  noPrice: '83c',
  probability: '17%',
};

const live: TerminalOutcomeDisplayValues = {
  yesPrice: '18c',
  noPrice: '82c',
  probability: '18%',
};

describe('displayableLivePriceValue', () => {
  it('prefers the coherent live mark over an executable venue ask', () => {
    expect(displayableLivePriceValue({
      marketId: 'world-cup-winner',
      outcomeId: 'SPAIN',
      generatedAt: new Date().toISOString(),
      status: 'live',
      price: '0.19',
      bestBid: '0.171',
      bestAsk: '0.19',
      midpoint: '0.1805',
      spread: '0.019',
      bestVenue: 'POLYMARKET',
      venueCount: 2,
      venues: ['OPINION', 'POLYMARKET'],
      liveVenueCount: 2,
      liveVenues: ['OPINION', 'POLYMARKET'],
      linkedVenueCount: 2,
      linkedVenues: ['OPINION', 'POLYMARKET'],
      venueBreakdown: [
        { venue: 'OPINION', price: '0.172', bestBid: '0.171', bestAsk: '0.172', status: 'live' },
        { venue: 'POLYMARKET', price: '0.19', bestBid: '0.184', bestAsk: '0.19', status: 'live' },
      ],
      averagePrice: '0.181',
      freshnessMs: 1000,
    }, '19%')).toBe(0.19);
  });

  it('falls back to midpoint when the live mark is unavailable', () => {
    expect(displayableLivePriceValue({
      marketId: 'world-cup-winner',
      outcomeId: 'ARGENTINA',
      generatedAt: new Date().toISOString(),
      status: 'live',
      price: null,
      bestBid: '0.172',
      bestAsk: null,
      midpoint: '0.175',
      spread: null,
      bestVenue: 'POLYMARKET',
      venueCount: 2,
      venues: ['POLYMARKET', 'LIMITLESS'],
      liveVenueCount: 2,
      liveVenues: ['POLYMARKET', 'LIMITLESS'],
      linkedVenueCount: 2,
      linkedVenues: ['POLYMARKET', 'LIMITLESS'],
      venueBreakdown: [
        { venue: 'LIMITLESS', price: '0.185', bestBid: '0.176', bestAsk: '0.185', status: 'live' },
        { venue: 'POLYMARKET', price: '0.178', bestBid: '0.172', bestAsk: '0.178', status: 'live' },
      ],
      averagePrice: '0.1815',
      freshnessMs: 1000,
    }, '18.5%')).toBe(0.175);
  });
});

describe('bestVenueFromLivePrice', () => {
  it('uses the lowest valid live ask instead of the backend venue hint', () => {
    expect(bestVenueFromLivePrice({
      marketId: 'world-cup-winner',
      outcomeId: 'FRANCE',
      generatedAt: new Date().toISOString(),
      status: 'live',
      price: '0.40',
      bestBid: '0.38',
      bestAsk: '0.40',
      midpoint: '0.39',
      spread: '0.02',
      bestVenue: 'LIMITLESS',
      venueCount: 2,
      venues: ['LIMITLESS', 'POLYMARKET'],
      venueBreakdown: [
        { venue: 'LIMITLESS', price: '0.40', bestBid: '0.39', bestAsk: '0.40', status: 'live' },
        { venue: 'POLYMARKET', price: '0.398', bestBid: '0.39', bestAsk: '0.398', status: 'live' },
      ],
      freshnessMs: 1000,
    })).toBe('POLYMARKET');
  });

  it('does not treat a partial venue breakdown as settled', () => {
    const livePrice = {
      marketId: 'world-cup-winner',
      outcomeId: 'FRANCE',
      generatedAt: new Date().toISOString(),
      status: 'live' as const,
      price: '0.40',
      bestBid: '0.38',
      bestAsk: '0.40',
      midpoint: '0.39',
      spread: '0.02',
      bestVenue: 'LIMITLESS',
      venueCount: 4,
      venues: ['LIMITLESS', 'OPINION', 'POLYMARKET', 'PREDICT_FUN'],
      venueBreakdown: [
        { venue: 'LIMITLESS', price: '0.40', bestBid: '0.39', bestAsk: '0.40', status: 'live' as const },
      ],
      freshnessMs: 1000,
    };

    expect(hasCompleteLivePriceVenueBreakdown(livePrice, livePrice.venues)).toBe(false);
    expect(isLivePriceVenueSelectionProvisional(livePrice, livePrice.venues)).toBe(true);
  });

  it('treats a missing breakdown as provisional when multiple venues are expected', () => {
    expect(isLivePriceVenueSelectionProvisional({
      marketId: 'world-cup-winner',
      outcomeId: 'FRANCE',
      generatedAt: new Date().toISOString(),
      status: 'live',
      price: '0.40',
      bestBid: '0.38',
      bestAsk: '0.40',
      midpoint: '0.39',
      spread: '0.02',
      bestVenue: 'LIMITLESS',
      venueCount: 4,
      venues: ['LIMITLESS', 'OPINION', 'POLYMARKET', 'PREDICT_FUN'],
      venueBreakdown: [],
      freshnessMs: 1000,
    }, ['LIMITLESS', 'OPINION', 'POLYMARKET', 'PREDICT_FUN'])).toBe(true);
  });

  it('keeps a venue-placeholder response provisional until every expected venue is live', () => {
    const livePrice = {
      marketId: 'world-cup-winner',
      outcomeId: 'ENGLAND',
      generatedAt: new Date().toISOString(),
      status: 'live' as const,
      price: '0.221',
      bestBid: '0.21',
      bestAsk: '0.221',
      midpoint: '0.221',
      spread: '0.011',
      bestVenue: 'PREDICT_FUN',
      venueCount: 3,
      venues: ['LIMITLESS', 'POLYMARKET', 'PREDICT_FUN'],
      linkedVenues: ['LIMITLESS', 'POLYMARKET', 'PREDICT_FUN'],
      linkedVenueCount: 3,
      venueBreakdown: [
        { venue: 'LIMITLESS', price: '0.22', bestBid: '0.21', bestAsk: '0.22', status: 'live' as const },
        { venue: 'POLYMARKET', price: null, bestBid: null, bestAsk: null, status: 'no_live_price' as const },
        { venue: 'PREDICT_FUN', price: '0.221', bestBid: '0.21', bestAsk: '0.221', status: 'live' as const },
      ],
      freshnessMs: 1000,
    };

    expect(hasCompleteLivePriceVenueBreakdown(livePrice, livePrice.venues)).toBe(false);
    expect(isLivePriceVenueSelectionProvisional(livePrice, livePrice.venues)).toBe(true);
  });

  it('uses a live mark when linked venues include unavailable venues', () => {
    expect(isLivePriceVenueSelectionProvisional({
      marketId: 'world-cup-winner',
      outcomeId: 'FRANCE',
      generatedAt: new Date().toISOString(),
      status: 'live',
      price: '0.373',
      bestBid: '0.372',
      bestAsk: '0.374',
      midpoint: '0.373',
      spread: '0.002',
      bestVenue: 'PREDICT_FUN',
      venueCount: 1,
      venues: ['PREDICT_FUN'],
      liveVenueCount: 1,
      liveVenues: ['PREDICT_FUN'],
      linkedVenueCount: 4,
      linkedVenues: ['LIMITLESS', 'OPINION', 'POLYMARKET', 'PREDICT_FUN'],
      venueBreakdown: [
        { venue: 'LIMITLESS', price: null, bestBid: null, bestAsk: null, status: 'no_live_price' },
        { venue: 'OPINION', price: null, bestBid: null, bestAsk: null, status: 'no_live_price' },
        { venue: 'POLYMARKET', price: null, bestBid: null, bestAsk: null, status: 'no_live_price' },
        { venue: 'PREDICT_FUN', price: '0.373', bestBid: '0.372', bestAsk: '0.374', status: 'live' },
      ],
      freshnessMs: 1200,
    }, ['LIMITLESS', 'OPINION', 'POLYMARKET', 'PREDICT_FUN'])).toBe(false);
  });
});

describe('isSelectedOutcomeBookReady', () => {
  it('returns false when the orderbook is missing', () => {
    expect(isSelectedOutcomeBookReady({
      orderbook: null,
      orderbookMarketId: 'market-1',
      orderbookOutcomeId: 'YES',
      snapshotStatus: undefined,
      liveVenueCount: 0,
      syncingVenueCount: 0,
    })).toBe(false);
  });

  it('returns false while the matching orderbook is still syncing', () => {
    expect(isSelectedOutcomeBookReady({
      orderbook: {
        marketId: 'market-1',
        outcomeId: 'YES',
        generatedAt: new Date().toISOString(),
        depth: 20,
        venues: [],
        bids: [],
        asks: [{ venue: 'POLYMARKET', price: '0.18', size: '100' }],
        bestBid: null,
        bestAsk: '0.18',
        midpoint: '0.18',
        spread: null,
        status: 'partial',
        blockers: [],
        stream: null,
      },
      orderbookMarketId: 'market-1',
      orderbookOutcomeId: 'YES',
      snapshotStatus: 'resyncing',
      liveVenueCount: 1,
      syncingVenueCount: 1,
    })).toBe(false);
  });

  it('returns false when the orderbook still belongs to the previously selected outcome', () => {
    expect(isSelectedOutcomeBookReady({
      orderbook: {
        marketId: 'market-previous',
        outcomeId: 'NO',
        generatedAt: new Date().toISOString(),
        depth: 20,
        venues: [],
        bids: [{ venue: 'LIMITLESS', price: '0.82', size: '100' }],
        asks: [{ venue: 'POLYMARKET', price: '0.83', size: '100' }],
        bestBid: '0.82',
        bestAsk: '0.83',
        midpoint: '0.825',
        spread: '0.01',
        status: 'live',
        blockers: [],
        stream: null,
      },
      orderbookMarketId: 'market-next',
      orderbookOutcomeId: 'YES',
      snapshotStatus: 'live',
      liveVenueCount: 2,
      syncingVenueCount: 0,
    })).toBe(false);
  });

  it('returns true only when the live orderbook matches the selected outcome and is no longer syncing', () => {
    expect(isSelectedOutcomeBookReady({
      orderbook: {
        marketId: 'market-1',
        outcomeId: 'YES',
        generatedAt: new Date().toISOString(),
        depth: 20,
        venues: [],
        bids: [{ venue: 'LIMITLESS', price: '0.17', size: '100' }],
        asks: [{ venue: 'POLYMARKET', price: '0.18', size: '100' }],
        bestBid: '0.17',
        bestAsk: '0.18',
        midpoint: '0.175',
        spread: '0.01',
        status: 'live',
        blockers: [],
        stream: null,
      },
      orderbookMarketId: 'market-1',
      orderbookOutcomeId: 'YES',
      snapshotStatus: 'live',
      liveVenueCount: 2,
      syncingVenueCount: 0,
    })).toBe(true);
  });
});

describe('isSelectedOutcomeBookUsable', () => {
  it('accepts the first matching partial orderbook with usable depth', () => {
    expect(isSelectedOutcomeBookUsable({
      orderbook: {
        marketId: 'market-1',
        outcomeId: 'YES',
        generatedAt: new Date().toISOString(),
        depth: 20,
        venues: [],
        bids: [],
        asks: [{ venue: 'POLYMARKET', price: '0.18', size: '100' }],
        bestBid: null,
        bestAsk: '0.18',
        midpoint: '0.18',
        spread: null,
        status: 'partial',
        blockers: [],
        stream: null,
      },
      orderbookMarketId: 'market-1',
      orderbookOutcomeId: 'YES',
      snapshotStatus: 'stale',
      liveVenueCount: 0,
      syncingVenueCount: 1,
    })).toBe(true);
  });

  it('rejects a resyncing book even if it has depth', () => {
    expect(isSelectedOutcomeBookUsable({
      orderbook: {
        marketId: 'market-1',
        outcomeId: 'YES',
        generatedAt: new Date().toISOString(),
        depth: 20,
        venues: [],
        bids: [{ venue: 'LIMITLESS', price: '0.17', size: '100' }],
        asks: [{ venue: 'POLYMARKET', price: '0.18', size: '100' }],
        bestBid: '0.17',
        bestAsk: '0.18',
        midpoint: '0.175',
        spread: '0.01',
        status: 'partial',
        blockers: [],
        stream: null,
      },
      orderbookMarketId: 'market-1',
      orderbookOutcomeId: 'YES',
      snapshotStatus: 'resyncing',
      liveVenueCount: 0,
      syncingVenueCount: 1,
    })).toBe(false);
  });
});

describe('resolveSelectedOutcomeDisplayValues', () => {
  it('keeps the latched fallback values while the selected orderbook is warming up', () => {
    expect(resolveSelectedOutcomeDisplayValues({
      current: null,
      fallback,
      live,
      liveReady: false,
    })).toEqual(fallback);
  });

  it('switches to the selected outcome live orderbook values once they are ready', () => {
    expect(resolveSelectedOutcomeDisplayValues({
      current: fallback,
      fallback,
      live,
      liveReady: true,
    })).toEqual(live);
  });

  it('keeps the current stable display during a later resync instead of falling back again', () => {
    expect(resolveSelectedOutcomeDisplayValues({
      current: live,
      fallback,
      live: {
        yesPrice: '19c',
        noPrice: '81c',
        probability: '19%',
      },
      liveReady: false,
    })).toEqual(live);
  });
});

describe('resolveExpandedOutcomeDisplayValues', () => {
  it('uses the best executable ask when the expanded order book is available', () => {
    expect(resolveExpandedOutcomeDisplayValues({
      summary: { yesPrice: '41.5¢', noPrice: '58.5¢', probability: '41.5%' },
      orderbook: { yesPrice: '47.0¢', noPrice: '53.0¢', probability: '47.0%' },
      fallback: null,
      binary: true,
    })).toEqual({ yesPrice: '47.0¢', noPrice: '53.0¢', probability: '47.0%' });
  });

  it('uses one complete order-book snapshot when the summary is incomplete', () => {
    expect(resolveExpandedOutcomeDisplayValues({
      summary: { yesPrice: null, noPrice: null, probability: null },
      orderbook: { yesPrice: '47.0¢', noPrice: '53.0¢', probability: '47.0%' },
      fallback: { yesPrice: '41.5¢', noPrice: '58.5¢', probability: '41.5%' },
      binary: true,
    })).toEqual({ yesPrice: '47.0¢', noPrice: '53.0¢', probability: '47.0%' });
  });
});

describe('preferResolvedOutcomeOrderbookVenues', () => {
  it('drops an unmapped duplicate venue book when a token-scoped book exists', () => {
    const venues = [
      { venue: 'POLYMARKET', venueOutcomeId: null },
      { venue: 'POLYMARKET', venueOutcomeId: 'yes-token' },
      { venue: 'LIMITLESS', venueOutcomeId: null },
    ];
    expect(preferResolvedOutcomeOrderbookVenues(venues)).toEqual([
      { venue: 'POLYMARKET', venueOutcomeId: 'yes-token' },
      { venue: 'LIMITLESS', venueOutcomeId: null },
    ]);
  });

  it('keeps venues that only provide an unmapped book', () => {
    const venues = [{ venue: 'LIMITLESS', venueOutcomeId: null }];
    expect(preferResolvedOutcomeOrderbookVenues(venues)).toEqual(venues);
  });
});

describe('shouldSyncSelectedOutcomeRowDisplay', () => {
  it('syncs the selected row quote when the expanded orderbook is not usable yet', () => {
    expect(shouldSyncSelectedOutcomeRowDisplay({
      current: {
        yesPrice: '18c',
        noPrice: '82c',
        probability: '18%',
      },
      next: {
        yesPrice: '35c',
        noPrice: '65c',
        probability: '35%',
      },
      outcomeExpanded: true,
      orderbookUsable: false,
    })).toBe(true);
  });

  it('preserves the live selected quote while a usable expanded orderbook is visible', () => {
    expect(shouldSyncSelectedOutcomeRowDisplay({
      current: {
        yesPrice: '35c',
        noPrice: '65c',
        probability: '35%',
      },
      next: {
        yesPrice: '34c',
        noPrice: '66c',
        probability: '34%',
      },
      outcomeExpanded: true,
      orderbookUsable: true,
    })).toBe(false);
  });
});

describe('mergeTerminalOutcomeRowDisplay', () => {
  it('reuses the current row object when the visible display is unchanged', () => {
    const current = {
      platforms: 4,
      prob: '35%',
      yesPrice: '35c',
      noPrice: '65c',
      primaryVenue: 'POLYMARKET',
      venueQuotes: [
        { venue: 'POLYMARKET', yesPrice: '35c', noPrice: '65c', blocker: null },
      ],
      venues: ['POLYMARKET'],
      status: 'live',
      blocker: null,
    };

    expect(mergeTerminalOutcomeRowDisplay(current, {
      platforms: 4,
      prob: '35%',
      yesPrice: '35c',
      noPrice: '65c',
      primaryVenue: 'POLYMARKET',
      venueQuotes: [
        { venue: 'POLYMARKET', yesPrice: '35c', noPrice: '65c', blocker: null },
      ],
      venues: ['POLYMARKET'],
      status: 'live',
      blocker: null,
    })).toBe(current);
  });

  it('returns a new row object when any visible quote changes', () => {
    const current = {
      platforms: 4,
      prob: '35%',
      yesPrice: '35c',
      noPrice: '65c',
      primaryVenue: 'POLYMARKET',
      venueQuotes: [
        { venue: 'POLYMARKET', yesPrice: '35c', noPrice: '65c', blocker: null },
      ],
      venues: ['POLYMARKET'],
      status: 'live',
      blocker: null,
      marker: 'keep-me',
    };

    expect(mergeTerminalOutcomeRowDisplay(current, {
      platforms: 4,
      prob: '36%',
      yesPrice: '36c',
      noPrice: '64c',
      primaryVenue: 'POLYMARKET',
      venueQuotes: [
        { venue: 'POLYMARKET', yesPrice: '36c', noPrice: '64c', blocker: null },
      ],
      venues: ['POLYMARKET'],
      status: 'live',
      blocker: null,
    })).toEqual({
      ...current,
      prob: '36%',
      yesPrice: '36c',
      noPrice: '64c',
      venueQuotes: [
        { venue: 'POLYMARKET', yesPrice: '36c', noPrice: '64c', blocker: null },
      ],
    });
  });
});

describe('resolveOutcomeSeedMedia', () => {
  it('prefers outcome-specific media but falls back to market media when missing', () => {
    expect(resolveOutcomeSeedMedia({
      imageUrl: 'https://cdn.example.com/outcomes/france.png',
      iconUrl: 'https://cdn.example.com/outcomes/france-icon.png',
      fallbackImageUrl: 'https://cdn.example.com/events/world-cup.png',
      fallbackIconUrl: 'https://cdn.example.com/events/world-cup-icon.png',
    })).toEqual({
      imageUrl: 'https://cdn.example.com/outcomes/france.png',
      iconUrl: 'https://cdn.example.com/outcomes/france-icon.png',
    });

    expect(resolveOutcomeSeedMedia({
      imageUrl: null,
      iconUrl: null,
      fallbackImageUrl: 'https://cdn.example.com/events/world-cup.png',
      fallbackIconUrl: 'https://cdn.example.com/events/world-cup-icon.png',
    })).toEqual({
      imageUrl: 'https://cdn.example.com/events/world-cup.png',
      iconUrl: 'https://cdn.example.com/events/world-cup-icon.png',
    });
  });
});

describe('resolveLivePriceForTerminalOutcome', () => {
  it('matches a live price directly by market id and outcome id', () => {
    expect(resolveLivePriceForTerminalOutcome({
      prices: [{
        marketId: 'market-1',
        outcomeId: 'ARGENTINA',
        generatedAt: new Date().toISOString(),
        status: 'live',
        price: '0.18',
        bestBid: '0.17',
        bestAsk: '0.19',
        midpoint: '0.18',
        spread: '0.02',
        bestVenue: 'POLYMARKET',
        venueCount: 1,
        venues: ['POLYMARKET'],
        freshnessMs: 1000,
      }],
      marketId: 'market-1',
      canonicalMarketIds: ['market-1'],
      outcomeId: 'ARGENTINA',
    })?.price).toBe('0.18');
  });

  it('falls back to outcome-specific canonical market ids when the response market id differs from the row market id', () => {
    expect(resolveLivePriceForTerminalOutcome({
      prices: [{
        marketId: 'market-argentina',
        outcomeId: 'ARGENTINA',
        generatedAt: new Date().toISOString(),
        status: 'live',
        price: '0.18',
        bestBid: '0.17',
        bestAsk: '0.19',
        midpoint: '0.18',
        spread: '0.02',
        bestVenue: 'POLYMARKET',
        venueCount: 1,
        venues: ['POLYMARKET'],
        freshnessMs: 1000,
      }],
      marketId: 'event-world-cup',
      canonicalMarketIds: ['market-argentina'],
      outcomeId: 'ARGENTINA',
    })?.marketId).toBe('market-argentina');
  });

  it('does not borrow another outcome price from the same market when the requested outcome is missing', () => {
    expect(resolveLivePriceForTerminalOutcome({
      prices: [{
        marketId: 'event-world-cup',
        outcomeId: 'BELGIUM',
        generatedAt: new Date().toISOString(),
        status: 'live',
        price: '0.98',
        bestBid: '0.97',
        bestAsk: '0.99',
        midpoint: '0.98',
        spread: '0.02',
        bestVenue: 'POLYMARKET',
        venueCount: 1,
        venues: ['POLYMARKET'],
        freshnessMs: 1000,
      }],
      marketId: 'event-world-cup',
      canonicalMarketIds: ['event-world-cup'],
      outcomeId: 'FRANCE',
    })).toBeNull();
  });
});

describe('resolveSelectedMarketSeedMedia', () => {
  it('prefers event or market media for the terminal header seed', () => {
    expect(resolveSelectedMarketSeedMedia({
      marketImageUrl: 'https://cdn.example.com/events/world-cup.png',
      marketIconUrl: 'https://cdn.example.com/events/world-cup-icon.png',
      outcomeImageUrl: 'https://cdn.example.com/outcomes/argentina.png',
      outcomeIconUrl: 'https://cdn.example.com/outcomes/argentina-icon.png',
    })).toEqual({
      imageUrl: 'https://cdn.example.com/events/world-cup.png',
      iconUrl: 'https://cdn.example.com/events/world-cup-icon.png',
    });
  });

  it('falls back to outcome media when no event or market media exists', () => {
    expect(resolveSelectedMarketSeedMedia({
      marketImageUrl: null,
      marketIconUrl: null,
      outcomeImageUrl: 'https://cdn.example.com/outcomes/argentina.png',
      outcomeIconUrl: 'https://cdn.example.com/outcomes/argentina-icon.png',
    })).toEqual({
      imageUrl: 'https://cdn.example.com/outcomes/argentina.png',
      iconUrl: 'https://cdn.example.com/outcomes/argentina-icon.png',
    });
  });
});

describe('resolveSelectedMarketHydratedMedia', () => {
  it('preserves an existing event header image during market hydration', () => {
    expect(resolveSelectedMarketHydratedMedia({
      currentImageUrl: 'https://cdn.example.com/events/world-cup.png',
      currentIconUrl: 'https://cdn.example.com/events/world-cup-icon.png',
      hydratedImageUrl: 'https://cdn.example.com/outcomes/argentina.png',
      hydratedIconUrl: 'https://cdn.example.com/outcomes/argentina-icon.png',
    })).toEqual({
      imageUrl: 'https://cdn.example.com/events/world-cup.png',
      iconUrl: 'https://cdn.example.com/events/world-cup-icon.png',
    });
  });

  it('fills missing media from the hydrated market when needed', () => {
    expect(resolveSelectedMarketHydratedMedia({
      currentImageUrl: null,
      currentIconUrl: null,
      hydratedImageUrl: 'https://cdn.example.com/outcomes/argentina.png',
      hydratedIconUrl: 'https://cdn.example.com/outcomes/argentina-icon.png',
    })).toEqual({
      imageUrl: 'https://cdn.example.com/outcomes/argentina.png',
      iconUrl: 'https://cdn.example.com/outcomes/argentina-icon.png',
    });
  });
});

describe('resolveInitialSelectedOutcomeId', () => {
  it('pins the requested outcome when it exists in the next seed rows', () => {
    expect(resolveInitialSelectedOutcomeId('france', [
      { id: 'argentina' },
      { id: 'france' },
    ])).toBe('france');
  });

  it('falls back to the first current-market outcome when the requested row is unavailable', () => {
    expect(resolveInitialSelectedOutcomeId('france', [
      { id: 'argentina' },
      { id: 'brazil' },
    ])).toBe('argentina');
    expect(resolveInitialSelectedOutcomeId(null, [])).toBeNull();
  });
});

describe('resolveVisibleSelectedOutcomeOrderbook', () => {
  const readyOrderbook = {
    marketId: 'market-1',
    outcomeId: 'YES',
    generatedAt: new Date().toISOString(),
    depth: 20,
    venues: [],
    bids: [{ venue: 'LIMITLESS', price: '0.17', size: '100' }],
    asks: [{ venue: 'POLYMARKET', price: '0.18', size: '100' }],
    bestBid: '0.17',
    bestAsk: '0.18',
    midpoint: '0.175',
    spread: '0.01',
    status: 'live' as const,
    blockers: [],
    stream: null,
  };

  it('does not publish a new selected orderbook while it is still warming up', () => {
    expect(resolveVisibleSelectedOutcomeOrderbook({
      current: null,
      next: readyOrderbook,
      nextReady: false,
      nextUsable: false,
    })).toBeNull();
  });

  it('publishes the first usable selected orderbook immediately', () => {
    expect(resolveVisibleSelectedOutcomeOrderbook({
      current: null,
      next: readyOrderbook,
      nextReady: false,
      nextUsable: true,
    })).toEqual(readyOrderbook);
  });

  it('keeps the current visible orderbook during a temporary resync', () => {
    expect(resolveVisibleSelectedOutcomeOrderbook({
      current: readyOrderbook,
      next: {
        ...readyOrderbook,
        bestAsk: '0.19',
      },
      nextReady: false,
      nextUsable: false,
    })).toEqual(readyOrderbook);
  });

  it('publishes the next orderbook once it is ready', () => {
    const nextReadyOrderbook = {
      ...readyOrderbook,
      bestAsk: '0.19',
      midpoint: '0.18',
    };
    expect(resolveVisibleSelectedOutcomeOrderbook({
      current: readyOrderbook,
      next: nextReadyOrderbook,
      nextReady: true,
      nextUsable: true,
    })).toEqual(nextReadyOrderbook);
  });
});

describe('resolveSelectedOutcomeOrderbookDisplaySource', () => {
  const visibleOrderbook = {
    marketId: 'market-1',
    outcomeId: 'YES',
    generatedAt: new Date().toISOString(),
    depth: 20,
    venues: [],
    bids: [{ venue: 'LIMITLESS', price: '0.17', size: '100' }],
    asks: [{ venue: 'POLYMARKET', price: '0.18', size: '100' }],
    bestBid: '0.17',
    bestAsk: '0.18',
    midpoint: '0.175',
    spread: '0.01',
    status: 'live' as const,
    blockers: [],
    stream: null,
  };

  it('prefers the latest live orderbook over the last visible snapshot', () => {
    const liveOrderbook = {
      ...visibleOrderbook,
      bestBid: '0.18',
      bestAsk: '0.19',
      midpoint: '0.185',
    };
    expect(resolveSelectedOutcomeOrderbookDisplaySource({
      live: liveOrderbook,
      visible: visibleOrderbook,
    })).toEqual(liveOrderbook);
  });

  it('falls back to the visible snapshot while the live orderbook is unavailable', () => {
    expect(resolveSelectedOutcomeOrderbookDisplaySource({
      live: null,
      visible: visibleOrderbook,
    })).toEqual(visibleOrderbook);
  });

  it('keeps the visible snapshot when the newest live orderbook has no usable depth yet', () => {
    expect(resolveSelectedOutcomeOrderbookDisplaySource({
      live: {
        ...visibleOrderbook,
        bids: [],
        asks: [],
        bestBid: null,
        bestAsk: null,
        midpoint: null,
        spread: null,
        status: 'partial',
      },
      visible: visibleOrderbook,
    })).toEqual(visibleOrderbook);
  });
});

describe('resolveOutcomePriceVenues', () => {
  it('uses the lowest executable ask venue for expanded row badges', () => {
    expect(resolveOutcomePriceVenues({
      primaryVenue: 'LIMITLESS',
      venueQuotes: [
        { venue: 'LIMITLESS', yesPrice: '34.1c', noPrice: '65.9c', blocker: null },
        { venue: 'PREDICT_FUN', yesPrice: '33.2c', noPrice: '66.8c', blocker: null },
      ],
      yesPrice: '33.2c',
      noPrice: '66.8c',
      orderbook: {
        marketId: 'market-1',
        outcomeId: 'FRANCE',
        generatedAt: new Date().toISOString(),
        depth: 20,
        venues: [],
        bids: [{ venue: 'LIMITLESS', price: '0.331', size: '100' }],
        asks: [
          { venue: 'PREDICT_FUN', price: '0.4', size: '100', cumulativeSize: '100', cumulativeNotional: '40', venueMarketId: 'predict-1', venueOutcomeId: 'yes' },
          { venue: 'POLYMARKET', price: '0.39', size: '100', cumulativeSize: '100', cumulativeNotional: '39', venueMarketId: 'poly-1', venueOutcomeId: 'yes' },
        ],
        bestBid: '0.331',
        bestAsk: '0.332',
        midpoint: '0.3315',
        spread: '0.001',
        status: 'live',
        blockers: [],
        stream: null,
      },
      expanded: true,
    })).toEqual({ yesVenue: 'POLYMARKET', noVenue: 'POLYMARKET' });
  });

  it('uses the orderbook venue after a row has been expanded and then collapsed', () => {
    expect(resolveOutcomePriceVenues({
      primaryVenue: 'PREDICT_FUN',
      venueQuotes: [{ venue: 'PREDICT_FUN', yesPrice: '40c', noPrice: '60c', blocker: null }],
      yesPrice: '39c',
      noPrice: '61c',
      orderbook: {
        marketId: 'market-1',
        outcomeId: 'FRANCE',
        generatedAt: new Date().toISOString(),
        depth: 20,
        venues: [],
        bids: [],
        asks: [{ venue: 'POLYMARKET', price: '0.39', size: '100' }],
        bestBid: null,
        bestAsk: '0.39',
        midpoint: '0.39',
        spread: null,
        status: 'live',
        blockers: [],
        stream: null,
      },
      expanded: false,
    })).toEqual({ yesVenue: 'POLYMARKET', noVenue: 'POLYMARKET' });
  });

  it('matches collapsed row badges to the visible quote breakdown before falling back to the primary venue', () => {
    expect(resolveOutcomePriceVenues({
      primaryVenue: 'LIMITLESS',
      venueQuotes: [
        { venue: 'LIMITLESS', yesPrice: '34.1c', noPrice: '65.9c', blocker: null },
        { venue: 'PREDICT_FUN', yesPrice: '33.2c', noPrice: '66.8c', blocker: null },
      ],
      yesPrice: '33.2c',
      noPrice: '66.8c',
      orderbook: null,
      expanded: false,
    })).toEqual({
      yesVenue: 'PREDICT_FUN',
      noVenue: 'PREDICT_FUN',
    });
  });
});

describe('orderSelectedOutcomeVisibleVenues', () => {
  it('keeps the expanded outcome venue order stable according to the market venue list', () => {
    expect(orderSelectedOutcomeVisibleVenues(
      ['KALSHI', 'POLYMARKET', 'MANIFOLD'],
      ['POLYMARKET', 'KALSHI', 'MANIFOLD'],
    )).toEqual(['POLYMARKET', 'KALSHI', 'MANIFOLD']);
  });

  it('falls back to alphabetical ordering for venues outside the preferred list', () => {
    expect(orderSelectedOutcomeVisibleVenues(
      ['ZETA', 'ALPHA', 'POLYMARKET'],
      ['POLYMARKET'],
    )).toEqual(['POLYMARKET', 'ALPHA', 'ZETA']);
  });
});

describe('shouldResetOrderbookForRequestChange', () => {
  it('resets the visible orderbook when the selected market or outcome changes', () => {
    expect(shouldResetOrderbookForRequestChange('market-1:YES:alias-a', 'market-2:YES:alias-b')).toBe(true);
  });

  it('keeps the current orderbook visible when the request effect reruns for the same selection', () => {
    expect(shouldResetOrderbookForRequestChange('market-1:YES:alias-a|alias-b', 'market-1:YES:alias-a|alias-b')).toBe(false);
  });
});

describe('shouldReuseSelectedOutcomeState', () => {
  it('reuses the current state when the same outcome is reselected with the same refresh key', () => {
    expect(shouldReuseSelectedOutcomeState({
      currentOutcomeId: 'france',
      nextOutcomeId: 'france',
      currentRefreshKey: 'france:market-1:YES',
      nextRefreshKey: 'france:market-1:YES',
    })).toBe(true);
  });

  it('does not reuse the current state when the cache key changes', () => {
    expect(shouldReuseSelectedOutcomeState({
      currentOutcomeId: 'france',
      nextOutcomeId: 'france',
      currentRefreshKey: 'france:market-1:YES',
      nextRefreshKey: 'france:market-1:NO',
    })).toBe(false);
  });
});

describe('shouldResetExpandedOutcomeForMarketChange', () => {
  it('resets the expanded outcome on the first market load', () => {
    expect(shouldResetExpandedOutcomeForMarketChange(null, 'world-cup:multi')).toBe(true);
  });

  it('keeps the expanded outcome open when only the selected outcome seed changes inside the same market', () => {
    expect(shouldResetExpandedOutcomeForMarketChange('world-cup:multi', 'world-cup:multi')).toBe(false);
  });

  it('resets the expanded outcome when the terminal switches to a different market context', () => {
    expect(shouldResetExpandedOutcomeForMarketChange('world-cup:multi', 'france-election:binary')).toBe(true);
  });
});

describe('resolveOutcomeSummaryVenues', () => {
  it('prefers linked venues over the narrower live venue subset', () => {
    expect(resolveOutcomeSummaryVenues({
      marketId: 'market-1',
      outcomeId: 'YES',
      generatedAt: new Date().toISOString(),
      status: 'live',
      price: '0.13',
      bestBid: '0.12',
      bestAsk: '0.14',
      midpoint: '0.13',
      spread: '0.02',
      bestVenue: 'PREDICT_FUN',
      venueCount: 3,
      venues: ['LIMITLESS', 'OPINION', 'PREDICT_FUN'],
      liveVenueCount: 3,
      liveVenues: ['LIMITLESS', 'OPINION', 'PREDICT_FUN'],
      linkedVenueCount: 4,
      linkedVenues: ['LIMITLESS', 'OPINION', 'POLYMARKET', 'PREDICT_FUN'],
      venueBreakdown: [
        { venue: 'LIMITLESS', price: '0.125', bestBid: '0.11', bestAsk: '0.14', status: 'live' },
        { venue: 'OPINION', price: '0.1335', bestBid: '0.119', bestAsk: '0.148', status: 'live' },
        { venue: 'POLYMARKET', price: null, bestBid: null, bestAsk: null, status: 'no_live_price' },
        { venue: 'PREDICT_FUN', price: '0.1245', bestBid: '0.124', bestAsk: '0.125', status: 'live' },
      ],
      averagePrice: '0.127666666667',
      freshnessMs: 2511,
    }, ['LIMITLESS'])).toEqual(['LIMITLESS', 'OPINION', 'POLYMARKET', 'PREDICT_FUN']);
  });

  it('uses the linked venue count for row summaries when available', () => {
    expect(resolveOutcomeSummaryVenueCount({
      marketId: 'market-1',
      outcomeId: 'YES',
      generatedAt: new Date().toISOString(),
      status: 'live',
      price: '0.13',
      bestBid: '0.12',
      bestAsk: '0.14',
      midpoint: '0.13',
      spread: '0.02',
      bestVenue: 'PREDICT_FUN',
      venueCount: 3,
      venues: ['LIMITLESS', 'OPINION', 'PREDICT_FUN'],
      liveVenueCount: 3,
      liveVenues: ['LIMITLESS', 'OPINION', 'PREDICT_FUN'],
      linkedVenueCount: 4,
      linkedVenues: ['LIMITLESS', 'OPINION', 'POLYMARKET', 'PREDICT_FUN'],
      venueBreakdown: [],
      averagePrice: '0.127666666667',
      freshnessMs: 2511,
    }, ['LIMITLESS'])).toBe(4);
  });
});
