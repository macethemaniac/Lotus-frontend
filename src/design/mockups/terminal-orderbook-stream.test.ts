import { describe, expect, it } from 'vitest';

import {
  readableQuoteBlocker,
  sameOrderbookStreamRenderMeta,
  summarizeOrderbookStreamPayload,
} from './terminal-orderbook-stream';

describe('readableQuoteBlocker', () => {
  it('maps backend orderbook codes to short user-facing copy', () => {
    expect(readableQuoteBlocker('QUOTE_PROVIDER_TIMEOUT')).toBe('Provider timeout');
    expect(readableQuoteBlocker('LIVE_ORDERBOOK_REQUIRED')).toBe('Live orderbook syncing');
  });
});

describe('summarizeOrderbookStreamPayload', () => {
  it('keeps only render metadata and drops live depth arrays', () => {
    const summary = summarizeOrderbookStreamPayload({
      venue: 'POLYMARKET',
      snapshotStatus: 'blocked',
      freshnessMs: 1_250,
      blockers: [{ reason: 'QUOTE_PROVIDER_TIMEOUT' }],
      bids: [{ venue: 'POLYMARKET', price: '0.17', size: '100' }],
      asks: [{ venue: 'POLYMARKET', price: '0.18', size: '120' }],
      bidDeltas: [{ venue: 'POLYMARKET', price: '0.17', size: '15' }],
      askDeltas: [{ venue: 'POLYMARKET', price: '0.18', size: '10' }],
    });

    expect(summary).toEqual({
      venue: 'POLYMARKET',
      snapshotStatus: 'blocked',
      freshnessMs: 1_250,
      blockers: ['Provider timeout'],
    });
  });

  it('returns null when the payload carries no diagnostic metadata', () => {
    expect(summarizeOrderbookStreamPayload({
      marketId: 'market-1',
      outcomeId: 'YES',
      bids: [{ venue: 'POLYMARKET', price: '0.17', size: '100' }],
    })).toBeNull();
  });
});

describe('sameOrderbookStreamRenderMeta', () => {
  it('compares summaries by the values rendered in the terminal', () => {
    expect(sameOrderbookStreamRenderMeta(
      {
        venue: 'POLYMARKET',
        snapshotStatus: 'resyncing',
        freshnessMs: 2_000,
        blockers: ['Provider timeout'],
      },
      {
        venue: 'POLYMARKET',
        snapshotStatus: 'resyncing',
        freshnessMs: 2_000,
        blockers: ['Provider timeout'],
      },
    )).toBe(true);

    expect(sameOrderbookStreamRenderMeta(
      {
        venue: 'POLYMARKET',
        snapshotStatus: 'resyncing',
        freshnessMs: 2_000,
        blockers: ['Provider timeout'],
      },
      {
        venue: 'LIMITLESS',
        snapshotStatus: 'resyncing',
        freshnessMs: 2_000,
        blockers: ['Provider timeout'],
      },
    )).toBe(false);
  });
});
