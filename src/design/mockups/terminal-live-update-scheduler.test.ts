import { describe, expect, it } from 'vitest';

import { bufferedRenderDelay, TERMINAL_STREAM_RENDER_INTERVAL_MS } from './terminal-live-update-scheduler';

describe('bufferedRenderDelay', () => {
  it('flushes immediately before any prior render', () => {
    expect(bufferedRenderDelay(null, 1_000)).toBe(0);
  });

  it('waits out the remainder of the render interval when updates arrive too quickly', () => {
    expect(bufferedRenderDelay(1_000, 1_050, 120)).toBe(70);
  });

  it('flushes immediately again once the interval has elapsed', () => {
    expect(bufferedRenderDelay(1_000, 1_000 + TERMINAL_STREAM_RENDER_INTERVAL_MS)).toBe(0);
  });
});
