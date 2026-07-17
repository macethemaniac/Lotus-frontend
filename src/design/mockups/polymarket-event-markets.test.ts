import { describe, expect, it } from 'vitest';

import { selectActiveOpenPolymarketEventMarkets } from './polymarket-event-markets';

describe('selectActiveOpenPolymarketEventMarkets', () => {
  it('ignores inactive duplicate labels when choosing event markets', () => {
    const activeSlug = 'will-robert-f-kennedy-jr-win-the-2028-republican-presidential-nomination';
    const inactiveDuplicateSlug = `${activeSlug}-626`;

    const markets = selectActiveOpenPolymarketEventMarkets([
      {
        slug: activeSlug,
        question: 'Will Robert F. Kennedy Jr. win the 2028 Republican presidential nomination?',
        groupItemTitle: 'Robert F. Kennedy Jr.',
        outcomePrices: '["0.0075","0.9925"]',
        active: true,
        closed: false,
      },
      {
        slug: inactiveDuplicateSlug,
        question: 'Will Robert F. Kennedy Jr. win the 2028 Republican presidential nomination?',
        groupItemTitle: 'Robert F. Kennedy Jr.',
        outcomePrices: '["0.49","0.51"]',
        active: false,
        closed: false,
      },
    ]);

    expect(markets).toHaveLength(1);
    expect(markets[0]?.slug).toBe(activeSlug);
    expect(markets[0]?.outcomePrices).toBe('["0.0075","0.9925"]');
  });
});
