export type LiveCanonicalChartMemoProps = {
  marketId: string | null;
  outcomeId: string | null;
  marketType: 'binary' | 'multi';
  onMarketTypeChange?: ((value: 'binary' | 'multi') => void) | undefined;
  outcomes?: readonly unknown[];
};

export const shouldReuseLiveCanonicalChart = (
  previousProps: LiveCanonicalChartMemoProps,
  nextProps: LiveCanonicalChartMemoProps,
): boolean => {
  if (previousProps.marketId !== nextProps.marketId) return false;
  if (previousProps.outcomeId !== nextProps.outcomeId) return false;
  if (previousProps.marketType !== nextProps.marketType) return false;
  if (previousProps.onMarketTypeChange !== nextProps.onMarketTypeChange) return false;

  if (previousProps.marketType !== 'binary' && nextProps.marketType !== 'binary') {
    return true;
  }

  return previousProps.outcomes === nextProps.outcomes;
};
