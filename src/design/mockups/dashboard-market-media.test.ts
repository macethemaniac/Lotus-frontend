import { describe, expect, it } from 'vitest';

import { resolveDashboardCardMedia, shouldPreferDashboardEventMedia } from './dashboard-market-media';

describe('shouldPreferDashboardEventMedia', () => {
  it('treats grouped candidate markets as event-level cards', () => {
    expect(shouldPreferDashboardEventMedia({
      marketType: 'binary',
      outcomes: [{ name: 'Argentina' }, { name: 'Belgium' }],
    })).toBe(true);
  });

  it('keeps direct yes-no markets on catalog media', () => {
    expect(shouldPreferDashboardEventMedia({
      marketType: 'binary',
      outcomes: [{ name: 'YES' }],
    })).toBe(false);
  });
});

describe('resolveDashboardCardMedia', () => {
  it('suppresses outcome-specific catalog media until neutral event artwork is available', () => {
    expect(resolveDashboardCardMedia({
      marketType: 'binary',
      outcomes: [{ name: 'Argentina' }, { name: 'Belgium' }],
      catalogImageUrl: 'https://cdn.example.com/argentina.png',
      catalogIconUrl: 'https://cdn.example.com/argentina-icon.png',
    })).toEqual({
      imageUrl: null,
      iconUrl: null,
    });
  });

  it('prefers neutral event artwork over outcome-specific catalog media', () => {
    expect(resolveDashboardCardMedia({
      marketType: 'binary',
      outcomes: [{ name: 'Argentina' }, { name: 'Belgium' }],
      catalogImageUrl: 'https://cdn.example.com/argentina.png',
      catalogIconUrl: 'https://cdn.example.com/argentina-icon.png',
      eventImageUrl: 'https://cdn.example.com/world-cup.png',
      eventIconUrl: 'https://cdn.example.com/world-cup-icon.png',
    })).toEqual({
      imageUrl: 'https://cdn.example.com/world-cup.png',
      iconUrl: 'https://cdn.example.com/world-cup-icon.png',
    });
  });

  it('preserves catalog media for direct binary markets', () => {
    expect(resolveDashboardCardMedia({
      marketType: 'binary',
      outcomes: [{ name: 'YES' }],
      catalogImageUrl: 'https://cdn.example.com/election.png',
      catalogIconUrl: 'https://cdn.example.com/election-icon.png',
    })).toEqual({
      imageUrl: 'https://cdn.example.com/election.png',
      iconUrl: 'https://cdn.example.com/election-icon.png',
    });
  });
});
