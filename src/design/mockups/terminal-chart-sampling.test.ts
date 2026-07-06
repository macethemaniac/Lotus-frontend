import { describe, expect, it } from 'vitest';

import { downsampleChartRows, maxChartPointsForTimeframe } from './terminal-chart-sampling';

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
