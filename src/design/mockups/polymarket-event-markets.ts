import type { PolymarketEventMarketSnapshot } from '@/features/markets/api/market-api';

/**
 * Gamma can keep an inactive duplicate market under the same event outcome
 * label. Only active, open markets are valid sources for the terminal's live
 * probability display.
 */
export const selectActiveOpenPolymarketEventMarkets = (
  markets: readonly PolymarketEventMarketSnapshot[],
): PolymarketEventMarketSnapshot[] => markets.filter((market) => (
  market.active === true && market.closed !== true
));
