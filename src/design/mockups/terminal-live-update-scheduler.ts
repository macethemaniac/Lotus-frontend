export const TERMINAL_STREAM_RENDER_INTERVAL_MS = 1_000;

export const bufferedRenderDelay = (
  lastRenderedAt: number | null,
  now: number,
  minIntervalMs = TERMINAL_STREAM_RENDER_INTERVAL_MS,
): number => {
  if (lastRenderedAt === null) return 0;
  const elapsed = now - lastRenderedAt;
  if (elapsed >= minIntervalMs) return 0;
  return minIntervalMs - elapsed;
};
