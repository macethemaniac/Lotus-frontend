type CacheEntry<T> = {
  data?: T;
  updatedAt: number;
  promise?: Promise<T>;
};

const cache = new Map<string, CacheEntry<unknown>>();

export type StaleCacheOptions = {
  ttlMs?: number;
  maxStaleMs?: number;
};

export async function staleWhileRevalidate<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: StaleCacheOptions = {}
): Promise<T> {
  const ttlMs = options.ttlMs ?? 15_000;
  const maxStaleMs = options.maxStaleMs ?? 5 * 60_000;
  const now = Date.now();
  const entry = cache.get(key) as CacheEntry<T> | undefined;
  const age = entry ? now - entry.updatedAt : Number.POSITIVE_INFINITY;

  if (entry?.data !== undefined && age <= ttlMs) {
    return entry.data;
  }

  if (entry?.promise) {
    return entry.data !== undefined && age <= maxStaleMs ? entry.data : entry.promise;
  }

  const promise = fetcher()
    .then((data) => {
      cache.set(key, { data, updatedAt: Date.now() });
      return data;
    })
    .catch((error) => {
      if (entry?.data !== undefined && age <= maxStaleMs) {
        return entry.data;
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
  return entry?.data !== undefined && age <= maxStaleMs ? entry.data : promise;
}

export function setCachedData<T>(key: string, data: T): void {
  cache.set(key, { data, updatedAt: Date.now() });
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
