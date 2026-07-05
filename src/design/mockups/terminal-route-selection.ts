type TerminalRouteSelection = {
  eventSlug?: string | null;
} | null | undefined;

export const terminalRouteSelectionMatches = (
  routeEventSlug: string | null | undefined,
  selectedMarket: TerminalRouteSelection,
): boolean => {
  if (!selectedMarket) return false;
  if (!routeEventSlug) return true;
  return selectedMarket.eventSlug === routeEventSlug;
};
