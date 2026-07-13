type CacheEntry<T> = {
  data?: T;
  updatedAt: number;
  promise?: Promise<T>;
};

const cache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

export type StaleCacheOptions<T = unknown> = {
  ttlMs?: number;
  maxStaleMs?: number;
  /** Whether an existing value is safe to return while a refresh runs. */
  allowStale?: (data: T) => boolean;
  /** Whether a refreshed value should be retained for later requests. */
  shouldCache?: (data: T) => boolean;
};

export async function staleWhileRevalidate<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: StaleCacheOptions<T> = {}
): Promise<T> {
  const ttlMs = options.ttlMs ?? 15_000;
  const maxStaleMs = options.maxStaleMs ?? 5 * 60_000;
  const allowStale = options.allowStale ?? (() => true);
  const shouldCache = options.shouldCache ?? (() => true);
  const now = Date.now();
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  const age = entry ? now - entry.updatedAt : Number.POSITIVE_INFINITY;
  const canUseStale = entry?.data !== undefined
    && age <= maxStaleMs
    && allowStale(entry.data);

  if (entry?.data !== undefined && age <= ttlMs && allowStale(entry.data)) {
    return entry.data;
  }

  if (entry?.promise) {
    return canUseStale ? entry.data! : entry.promise;
  }

  const promise = fetcher()
    .then((data) => {
      if (shouldCache(data)) {
        cache.set(key, { data, updatedAt: Date.now() });
      } else {
        cache.delete(key);
      }
      return data;
    })
    .catch((error) => {
      if (canUseStale) {
        return entry.data!;
      }
      throw error;
    })
    .finally(() => {
      const current = cache.get(key);
      if (current?.promise === promise) {
        cache.set(key, { data: current.data, updatedAt: current.updatedAt });
      }
    });

  cache.set(key, { data: entry?.data, updatedAt: entry?.updatedAt ?? 0, promise });
  return canUseStale ? entry.data! : promise;
}

export function setCachedData<T>(key: string, data: T): void {
  cache.set(key, { data, updatedAt: Date.now() });
}

export function dedupeInFlight<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = fetcher().finally(() => {
    if (inFlight.get(key) === promise) inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}

export function peekCachedData<T>(key: string): T | undefined {
  return (cache.get(key) as CacheEntry<T> | undefined)?.data;
}

export function clearCachedData(keyPrefix?: string): void {
  if (!keyPrefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(keyPrefix)) cache.delete(key);
  }
}
