import { describe, expect, it } from 'vitest';

import { downsampleChartRows, maxChartPointsForTimeframe, removeIsolatedChartSpikes } from './terminal-chart-sampling';

describe('maxChartPointsForTimeframe', () => {
  it('keeps more points for longer timeframes while still capping all-time charts', () => {
    expect(maxChartPointsForTimeframe('1D')).toBe(360);
    expect(maxChartPointsForTimeframe('ALL')).toBe(720);
  });
});

describe('downsampleChartRows', () => {
  it('returns the original rows when they are already under the limit', () => {
    const rows = [{ timestamp: 1 }, { timestamp: 2 }, { timestamp: 3 }];
    expect(downsampleChartRows(rows, 5)).toBe(rows);
  });

  it('preserves the first and last row while reducing point count', () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({ timestamp: index }));
    const sampled = downsampleChartRows(rows, 4);
    expect(sampled).toEqual([
      { timestamp: 0 },
      { timestamp: 3 },
      { timestamp: 6 },
      { timestamp: 9 },
    ]);
  });
});

describe('removeIsolatedChartSpikes', () => {
  it('removes a venue spike that returns to the surrounding probability', () => {
    const points = [
      { timestamp: 1, value: 3.1 },
      { timestamp: 2, value: 96 },
      { timestamp: 3, value: 3.1 },
    ];

    expect(removeIsolatedChartSpikes(points)).toEqual([
      { timestamp: 1, value: 3.1 },
      { timestamp: 3, value: 3.1 },
    ]);
  });

  it('removes a short run of repeated outlier quotes', () => {
    const points = [
      { timestamp: 1, value: 3.1 },
      { timestamp: 2, value: 3.1 },
      { timestamp: 3, value: 96 },
      { timestamp: 4, value: 96 },
      { timestamp: 5, value: 3.1 },
      { timestamp: 6, value: 3.1 },
    ];

    expect(removeIsolatedChartSpikes(points)).toEqual([
      { timestamp: 1, value: 3.1 },
      { timestamp: 2, value: 3.1 },
      { timestamp: 5, value: 3.1 },
      { timestamp: 6, value: 3.1 },
    ]);
  });

  it('keeps a genuine sustained change', () => {
    const points = [
      { timestamp: 1, value: 3.1 },
      { timestamp: 2, value: 18 },
      { timestamp: 3, value: 20 },
      { timestamp: 4, value: 21 },
    ];

    expect(removeIsolatedChartSpikes(points)).toEqual(points);
  });
});
