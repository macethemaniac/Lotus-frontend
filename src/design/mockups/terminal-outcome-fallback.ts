export type TerminalFallbackMarketLike = {
  id?: string;
  title: string;
  priceLabel?: string;
  imageUrl?: string | null;
  iconUrl?: string | null;
  venues?: string[];
  canonicalMarketIds?: string[];
  outcomes?: Array<{
    id: string;
    prob: string;
    imageUrl?: string | null;
    iconUrl?: string | null;
  }>;
  initialOutcomeId?: string | null;
};

export type TerminalRelatedEventOutcomeSeed = {
  id: string;
  marketId: string;
  canonicalMarketIds: string[];
  quoteOutcomeId: 'YES';
  name: string;
  prob: string;
  imageUrl: string | null | undefined;
  iconUrl: string | null | undefined;
  venues: string[];
  volume: string | null;
  volume24h: string | null;
};

export const terminalOutcomeNameForEventMarket = (market: { title: string; displayOutcome?: string | null }): string => {
  const displayOutcome = market.displayOutcome?.trim();
  if (displayOutcome) return displayOutcome;
  const suffix = market.title.match(/:\s*(.+)$/)?.[1]?.trim();
  return suffix && suffix.length > 0 ? suffix : market.title.trim();
};

export const buildRelatedEventOutcomeFallbackSeeds = (input: {
  hasCompoundEventOutcomes: boolean;
  relatedEventMarkets: TerminalFallbackMarketLike[];
  resolveMarketId: (market: TerminalFallbackMarketLike) => string;
}): TerminalRelatedEventOutcomeSeed[] => {
  if (!input.hasCompoundEventOutcomes) return [];
  return input.relatedEventMarkets.map((market) => {
    const marketId = input.resolveMarketId(market);
    const initialOutcome = market.outcomes?.find((outcome) => outcome.id === market.initialOutcomeId) ?? market.outcomes?.[0] ?? null;
    return {
      id: marketId,
      marketId,
      canonicalMarketIds: market.canonicalMarketIds ?? [],
      quoteOutcomeId: 'YES',
      name: terminalOutcomeNameForEventMarket(market),
      prob: market.priceLabel ?? initialOutcome?.prob ?? 'Quote',
      imageUrl: initialOutcome?.imageUrl ?? market.imageUrl,
      iconUrl: initialOutcome?.iconUrl ?? market.iconUrl,
      venues: market.venues ?? [],
      volume: null,
      volume24h: null,
    };
  });
};
