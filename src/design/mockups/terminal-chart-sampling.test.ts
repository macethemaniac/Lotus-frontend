import { describe, expect, it } from 'vitest';

import type { MarketChartResponse } from '@/features/markets/api/market-api';

import { downsampleChartRows, maxChartPointsForTimeframe, sanitizeTerminalChartResponse } from './terminal-chart-sampling';

describe('maxChartPointsForTimeframe', () => {
  it('caps dense one-day charts more aggressively than all-time charts', () => {
    expect(maxChartPointsForTimeframe('1D')).toBe(180);
    expect(maxChartPointsForTimeframe('ALL')).toBe(240);
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

describe('sanitizeTerminalChartResponse', () => {
  const buildChart = (): MarketChartResponse => ({
    marketId: 'market-1',
    outcomeId: 'YES',
    timeframe: '1D',
    generatedAt: '2026-07-06T00:00:00.000Z',
    historyStatus: 'live',
    series: [
      { id: 'unified', label: 'Unified', color: '#22C55E', kind: 'unified', hasData: true },
      { id: 'POLYMARKET', label: 'Polymarket', color: '#3B82F6', kind: 'venue', hasData: true },
    ],
    points: Array.from({ length: 100 }, (_, index) => ({
      timestamp: new Date(Date.UTC(2026, 6, 6, 0, index, 0)).toISOString(),
      label: `pt-${index}`,
      unified: (0.3 + index / 1000).toFixed(4),
      venues: {
        POLYMARKET: (0.31 + index / 1000).toFixed(4),
      },
    })),
    blockers: [],
  });

  it('preserves the full response outside production-safe mode', () => {
    const chart = buildChart();
    expect(sanitizeTerminalChartResponse(chart, {
      marketType: 'binary',
      productionSafeMode: false,
    })).toBe(chart);
  });

  it('caps production binary charts and strips unused venue payloads', () => {
    const sanitized = sanitizeTerminalChartResponse(buildChart(), {
      marketType: 'binary',
      productionSafeMode: true,
    });

    expect(sanitized.series).toEqual([
      { id: 'unified', label: 'Unified', color: '#22C55E', kind: 'unified', hasData: true },
    ]);
    expect(sanitized.points).toHaveLength(20);
    expect(sanitized.points.every((point) => Object.keys(point.venues).length === 0)).toBe(true);
  });

  it('caps production multi charts without removing venue data', () => {
    const sanitized = sanitizeTerminalChartResponse(buildChart(), {
      marketType: 'multi',
      productionSafeMode: true,
    });

    expect(sanitized.points).toHaveLength(20);
    expect(sanitized.points[0]?.venues).toEqual({
      POLYMARKET: '0.3100',
    });
    expect(sanitized.series).toHaveLength(2);
  });
});
