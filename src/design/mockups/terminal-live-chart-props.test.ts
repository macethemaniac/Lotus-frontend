import { describe, expect, it, vi } from 'vitest';

import { shouldReuseLiveCanonicalChart } from './terminal-live-chart-props';

describe('shouldReuseLiveCanonicalChart', () => {
  it('reuses the multi-outcome chart when only outcome rows change', () => {
    const onMarketTypeChange = vi.fn();

    expect(shouldReuseLiveCanonicalChart(
      {
        marketId: 'market-1',
        outcomeId: 'FRANCE',
        marketType: 'multi',
        onMarketTypeChange,
        outcomes: [{ id: 'FRANCE', prob: '36%' }],
      },
      {
        marketId: 'market-1',
        outcomeId: 'FRANCE',
        marketType: 'multi',
        onMarketTypeChange,
        outcomes: [{ id: 'ARGENTINA', prob: '17%' }],
      },
    )).toBe(true);
  });

  it('rerenders the binary chart when its outcome rows change', () => {
    const onMarketTypeChange = vi.fn();
    const previousOutcomes = [{ id: 'YES', prob: '64%' }];
    const nextOutcomes = [{ id: 'YES', prob: '65%' }];

    expect(shouldReuseLiveCanonicalChart(
      {
        marketId: 'market-1',
        outcomeId: 'YES',
        marketType: 'binary',
        onMarketTypeChange,
        outcomes: previousOutcomes,
      },
      {
        marketId: 'market-1',
        outcomeId: 'YES',
        marketType: 'binary',
        onMarketTypeChange,
        outcomes: nextOutcomes,
      },
    )).toBe(false);
  });
});
