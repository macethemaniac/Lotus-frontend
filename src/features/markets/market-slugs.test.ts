import { describe, expect, it } from 'vitest';

import { eventSlugFromTitle } from './market-slugs';

describe('eventSlugFromTitle', () => {
  it('builds stable slugs for plain event titles', () => {
    expect(eventSlugFromTitle('FIFA World Cup 2026 Winner')).toBe('fifa-world-cup-2026-winner');
  });

  it('removes punctuation and diacritics', () => {
    expect(eventSlugFromTitle("Who'll win São Paulo?")).toBe('wholl-win-sao-paulo');
  });

  it('falls back to a non-empty slug for empty titles', () => {
    expect(eventSlugFromTitle('')).toBe('event');
  });
});
