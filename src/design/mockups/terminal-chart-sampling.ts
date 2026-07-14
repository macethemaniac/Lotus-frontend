import type { MarketChartTimeframe } from '@/features/markets/api/market-api';

type ChartRow = {
  timestamp?: number;
};

export type ChartPoint = {
  timestamp: number;
  value: number;
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

/**
 * Removes isolated bad quotes from a historical series.
 *
 * A unified market history can briefly contain a venue quote that is far away
 * from the surrounding values. Rendering that point as-is creates a false
 * vertical spike, even though the live canonical quote is correct. Keep real
 * moves, but drop a point when its nearby values form a stable local plateau.
 */
export const removeIsolatedChartSpikes = <TPoint extends ChartPoint>(points: TPoint[]): TPoint[] => {
  if (points.length < 3) return points;

  const sortedSeriesValues = points.map((point) => point.value).sort((left, right) => left - right);
  const seriesMidpoint = Math.floor(sortedSeriesValues.length / 2);
  const seriesMedian = sortedSeriesValues.length % 2 === 0
    ? ((sortedSeriesValues[seriesMidpoint - 1] ?? 0) + (sortedSeriesValues[seriesMidpoint] ?? 0)) / 2
    : sortedSeriesValues[seriesMidpoint] ?? 0;
  const globalSpikeThreshold = Math.max(8, Math.abs(seriesMedian) * 2);
  const shortOutlierIndexes = new Set<number>();
  let runStart = -1;

  const closeOutlierRun = (runEnd: number) => {
    if (runStart < 0) return;
    const runLength = runEnd - runStart + 1;
    if (runLength <= 4) {
      for (let runIndex = runStart; runIndex <= runEnd; runIndex += 1) {
        shortOutlierIndexes.add(runIndex);
      }
    }
    runStart = -1;
  };

  points.forEach((point, index) => {
    const isGlobalOutlier = Math.abs(point.value - seriesMedian) > globalSpikeThreshold;
    if (isGlobalOutlier) {
      if (runStart < 0) runStart = index;
      return;
    }
    closeOutlierRun(index - 1);
  });
  closeOutlierRun(points.length - 1);

  return points.filter((point, index) => {
    if (shortOutlierIndexes.has(index)) return false;
    const neighbors = [points[index - 2], points[index - 1], points[index + 1], points[index + 2]]
      .filter((neighbor): neighbor is TPoint => Boolean(neighbor));
    if (neighbors.length < 2) return true;

    const sortedValues = neighbors.map((neighbor) => neighbor.value).sort((left, right) => left - right);
    const midpoint = Math.floor(sortedValues.length / 2);
    const median = sortedValues.length % 2 === 0
      ? ((sortedValues[midpoint - 1] ?? 0) + (sortedValues[midpoint] ?? 0)) / 2
      : sortedValues[midpoint] ?? 0;
    const spread = (sortedValues[sortedValues.length - 1] ?? median) - (sortedValues[0] ?? median);
    const deviation = Math.abs(point.value - median);
    const plateauTolerance = Math.max(2, Math.abs(median) * 0.35);
    const isEndpoint = index === 0 || index === points.length - 1;
    const spikeThreshold = Math.max(8, Math.abs(median) * (isEndpoint ? 1.5 : 0.75), spread * 2);

    return !(spread <= plateauTolerance && deviation > spikeThreshold);
  });
};
