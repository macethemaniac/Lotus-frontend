import { describe, expect, it } from 'vitest';

import {
  buildRelatedEventOutcomeFallbackSeeds,
  type TerminalFallbackMarketLike,
} from './terminal-outcome-fallback';

const buildSelection = (overrides: Partial<TerminalFallbackMarketLike> = {}): TerminalFallbackMarketLike => ({
  title: 'FIFA World Cup 2026 Winner',
  venues: ['POLYMARKET', 'PREDICT_FUN'],
  ...overrides,
});

describe('buildRelatedEventOutcomeFallbackSeeds', () => {
  it('builds grouped event fallback rows from each related market instead of a single selected row', () => {
    const relatedEventMarkets = [
      buildSelection({
        id: 'FRONTEND_CURATED:FRANCE',
        canonicalMarketIds: ['FRONTEND_CURATED:FRANCE'],
        title: 'FIFA World Cup 2026 Winner: France',
        priceLabel: '34%',
        imageUrl: 'https://cdn.example.com/france.png',
        iconUrl: 'https://cdn.example.com/france.png',
        outcomes: [{
          id: 'FRONTEND_CURATED:FRANCE',
          prob: '34%',
          imageUrl: 'https://cdn.example.com/france.png',
          iconUrl: 'https://cdn.example.com/france.png',
        }],
      }),
      buildSelection({
        id: 'FRONTEND_CURATED:BRAZIL',
        canonicalMarketIds: ['FRONTEND_CURATED:BRAZIL'],
        title: 'FIFA World Cup 2026 Winner: Brazil',
        priceLabel: '<1%',
        imageUrl: 'https://cdn.example.com/brazil.png',
        iconUrl: 'https://cdn.example.com/brazil.png',
        outcomes: [{
          id: 'FRONTEND_CURATED:BRAZIL',
          prob: '<1%',
          imageUrl: 'https://cdn.example.com/brazil.png',
          iconUrl: 'https://cdn.example.com/brazil.png',
        }],
      }),
    ];

    const rows = buildRelatedEventOutcomeFallbackSeeds({
      hasCompoundEventOutcomes: true,
      relatedEventMarkets,
      resolveMarketId: (market) => market.canonicalMarketIds?.[0] ?? market.id ?? market.title,
    });

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.name)).toEqual(['France', 'Brazil']);
    expect(rows.map((row) => row.marketId)).toEqual([
      'FRONTEND_CURATED:FRANCE',
      'FRONTEND_CURATED:BRAZIL',
    ]);
    expect(rows[1]?.prob).toBe('<1%');
  });
});
