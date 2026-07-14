import { describe, expect, it } from 'vitest';

import { terminalRouteSelectionIsComplete, terminalRouteSelectionMatches } from './terminal-route-selection';

describe('terminalRouteSelectionMatches', () => {
  it('treats a slug route with no selected market as unresolved', () => {
    expect(terminalRouteSelectionMatches('fifa-world-cup-2026-winner', null)).toBe(false);
  });

  it('accepts the selected market when its event slug matches the route', () => {
    expect(terminalRouteSelectionMatches('fifa-world-cup-2026-winner', { eventSlug: 'fifa-world-cup-2026-winner' })).toBe(true);
  });

  it('rejects a stale selected market from a different event', () => {
    expect(terminalRouteSelectionMatches('fifa-world-cup-2026-winner', { eventSlug: 'cleveland-will-the-cleveland-cavaliers-win' })).toBe(false);
  });

  it('treats the selected market as ready when the terminal route has no slug', () => {
    expect(terminalRouteSelectionMatches(null, { eventSlug: 'fifa-world-cup-2026-winner' })).toBe(true);
  });

  it('does not treat an incomplete multi-outcome selection as route-ready', () => {
    expect(terminalRouteSelectionIsComplete('republican-presidential-nominee-2028', {
      eventSlug: 'republican-presidential-nominee-2028',
      marketType: 'multi',
      outcomes: [{ name: 'Tucker Carlson' }],
    })).toBe(false);
  });

  it('accepts a multi-outcome selection once candidate rows are present', () => {
    expect(terminalRouteSelectionIsComplete('republican-presidential-nominee-2028', {
      eventSlug: 'republican-presidential-nominee-2028',
      marketType: 'multi',
      outcomes: [{ name: 'J.D. Vance' }, { name: 'Marco Rubio' }],
    })).toBe(true);
  });
});
