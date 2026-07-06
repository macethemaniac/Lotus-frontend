import { describe, expect, it } from 'vitest';

import {
  isSelectedOutcomeBookUsable,
  isSelectedOutcomeBookReady,
  mergeTerminalOutcomeRowDisplay,
  orderSelectedOutcomeVisibleVenues,
  resolveLivePriceForTerminalOutcome,
  resolveOutcomeSummaryVenueCount,
  resolveOutcomeSummaryVenues,
  resolveOutcomeSeedMedia,
  resolveSelectedMarketHydratedMedia,
  resolveSelectedMarketSeedMedia,
  resolveInitialSelectedOutcomeId,
  resolveSelectedOutcomeOrderbookDisplaySource,
  resolveSelectedOutcomeDisplayValues,
  resolveVisibleSelectedOutcomeOrderbook,
  shouldApplyLatchedOutcomeDisplay,
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

  it('keeps the selected row quote synced even while a usable expanded orderbook is visible', () => {
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
    })).toBe(true);
  });

  it('does not keep re-latching collapsed selected rows on background price refreshes', () => {
    expect(shouldSyncSelectedOutcomeRowDisplay({
      current: {
        yesPrice: '18c',
        noPrice: '82c',
        probability: '18%',
      },
      next: {
        yesPrice: '19c',
        noPrice: '81c',
        probability: '19%',
      },
      outcomeExpanded: false,
      orderbookUsable: false,
    })).toBe(false);
  });
});

describe('shouldApplyLatchedOutcomeDisplay', () => {
  it('applies latched values only to the matching outcome row', () => {
    expect(shouldApplyLatchedOutcomeDisplay('france', 'france')).toBe(true);
    expect(shouldApplyLatchedOutcomeDisplay('argentina', 'france')).toBe(false);
    expect(shouldApplyLatchedOutcomeDisplay(null, 'france')).toBe(false);
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
