import type { MarketChartResponse, MarketChartTimeframe } from '@/features/markets/api/market-api';

type ChartRow = {
  timestamp?: number;
};

const MAX_CHART_POINTS_BY_TIMEFRAME: Record<MarketChartTimeframe, number> = {
  '1H': 90,
  '6H': 120,
  '1D': 180,
  '1W': 180,
  '1M': 200,
  'ALL': 240,
};

export const maxChartPointsForTimeframe = (timeframe: MarketChartTimeframe): number =>
  MAX_CHART_POINTS_BY_TIMEFRAME[timeframe];

const downsampleItems = <TItem>(
  items: TItem[],
  maxPoints: number,
): TItem[] => {
  if (maxPoints <= 1 || items.length <= maxPoints) return items;

  const lastIndex = items.length - 1;
  const step = lastIndex / (maxPoints - 1);
  const sampledIndices = new Set<number>([0, lastIndex]);

  for (let index = 1; index < maxPoints - 1; index += 1) {
    sampledIndices.add(Math.round(index * step));
  }

  return [...sampledIndices]
    .sort((left, right) => left - right)
    .map((index) => items[index]!)
    .filter(Boolean);
};

export const downsampleChartRows = <TRow extends ChartRow>(
  rows: TRow[],
  maxPoints: number,
): TRow[] => downsampleItems(rows, maxPoints);

const PRODUCTION_TERMINAL_CHART_POINT_LIMIT = 20;

const chartSeriesKind = (item: MarketChartResponse['series'][number]) =>
  item.kind ?? (item.id === 'unified' ? 'unified' : 'venue');

export const sanitizeTerminalChartResponse = (
  chart: MarketChartResponse,
  input: {
    marketType: 'binary' | 'multi';
    productionSafeMode: boolean;
  },
): MarketChartResponse => {
  if (!input.productionSafeMode) return chart;

  const sampledPoints = downsampleItems(
    chart.points,
    PRODUCTION_TERMINAL_CHART_POINT_LIMIT,
  );

  if (input.marketType !== 'binary') {
    return {
      ...chart,
      points: sampledPoints,
    };
  }

  const unifiedSeries = chart.series.filter((item) => item.id === 'unified' || chartSeriesKind(item) === 'unified').slice(0, 1);
  return {
    ...chart,
    series: unifiedSeries.length > 0 ? unifiedSeries : chart.series.slice(0, 1),
    points: sampledPoints.map((point) => ({
      timestamp: point.timestamp,
      label: point.label,
      unified: point.unified,
      venues: {},
    })),
  };
};
