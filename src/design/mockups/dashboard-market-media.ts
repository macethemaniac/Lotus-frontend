export type DashboardMediaOutcome = {
  name?: string | null;
};

export type DashboardMediaShape = {
  marketType?: 'binary' | 'multi';
  outcomes?: readonly DashboardMediaOutcome[] | null;
};

export type DashboardMedia = {
  imageUrl: string | null;
  iconUrl: string | null;
};

const normalizeOutcomeId = (value: string | null | undefined): string => value?.trim().toUpperCase().replace(/\s+/g, '_') ?? '';

const isGenericBinaryOutcomeLabel = (value: string | null | undefined): boolean => {
  const normalized = normalizeOutcomeId(value);
  return normalized === 'YES' || normalized === 'NO' || normalized === 'UP' || normalized === 'DOWN';
};

export const shouldPreferDashboardEventMedia = (market: DashboardMediaShape): boolean =>
  market.marketType === 'multi'
  || (market.outcomes?.length ?? 0) > 1
  || ((market.outcomes?.length ?? 0) === 1 && !isGenericBinaryOutcomeLabel(market.outcomes?.[0]?.name));

export const resolveDashboardCardMedia = (input: DashboardMediaShape & {
  catalogImageUrl?: string | null;
  catalogIconUrl?: string | null;
  eventImageUrl?: string | null;
  eventIconUrl?: string | null;
}): DashboardMedia => {
  if (!shouldPreferDashboardEventMedia(input)) {
    return {
      imageUrl: input.catalogImageUrl ?? null,
      iconUrl: input.catalogIconUrl ?? null,
    };
  }

  if (input.eventImageUrl || input.eventIconUrl) {
    return {
      imageUrl: input.eventImageUrl ?? null,
      iconUrl: input.eventIconUrl ?? null,
    };
  }

  return {
    imageUrl: null,
    iconUrl: null,
  };
};
