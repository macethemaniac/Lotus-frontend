import { describe, expect, it } from 'vitest';

import {
  isSelectedOutcomeBookReady,
  resolveSelectedOutcomeDisplayValues,
  resolveVisibleSelectedOutcomeOrderbook,
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
    })).toBeNull();
  });

  it('keeps the current visible orderbook during a temporary resync', () => {
    expect(resolveVisibleSelectedOutcomeOrderbook({
      current: readyOrderbook,
      next: {
        ...readyOrderbook,
        bestAsk: '0.19',
      },
      nextReady: false,
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
    })).toEqual(nextReadyOrderbook);
  });
});
