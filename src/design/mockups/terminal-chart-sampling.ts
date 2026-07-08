import type { MarketChartTimeframe } from '@/features/markets/api/market-api';

type ChartRow = {
  timestamp?: number;
};

const MAX_CHART_POINTS_BY_TIMEFRAME: Record<MarketChartTimeframe, number> = {
  '1H': 180,
  '6H': 240,
  '1D': 360,
  '1W': 480,
  '1M': 600,
  'ALL': 720,
};

export const maxChartPointsForTimeframe = (timeframe: MarketChartTimeframe): number =>
  MAX_CHART_POINTS_BY_TIMEFRAME[timeframe];

export const downsampleChartRows = <TRow extends ChartRow>(
  rows: TRow[],
  maxPoints: number,
): TRow[] => {
  if (maxPoints <= 1 || rows.length <= maxPoints) return rows;

  const lastIndex = rows.length - 1;
  const step = lastIndex / (maxPoints - 1);
  const sampledIndices = new Set<number>([0, lastIndex]);

  for (let index = 1; index < maxPoints - 1; index += 1) {
    sampledIndices.add(Math.round(index * step));
  }

  return [...sampledIndices]
    .sort((left, right) => left - right)
    .map((index) => rows[index]!)
    .filter(Boolean);
};
