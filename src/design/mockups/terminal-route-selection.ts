type TerminalRouteSelection = {
  eventSlug?: string | null;
  marketType?: 'binary' | 'multi' | null;
  outcomes?: readonly unknown[] | null;
} | null | undefined;

export const terminalRouteSelectionMatches = (
  routeEventSlug: string | null | undefined,
  selectedMarket: TerminalRouteSelection,
): boolean => {
  if (!selectedMarket) return false;
  if (!routeEventSlug) return true;
  return selectedMarket.eventSlug === routeEventSlug;
};

export const terminalRouteSelectionIsComplete = (
  routeEventSlug: string | null | undefined,
  selectedMarket: TerminalRouteSelection,
): boolean => {
  if (!terminalRouteSelectionMatches(routeEventSlug, selectedMarket)) return false;
  if (!selectedMarket || selectedMarket.marketType !== 'multi') return true;
  return (selectedMarket.outcomes?.length ?? 0) > 1;
};
