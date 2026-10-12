/**
 * Bounded in-memory cache with TTL and maximum size limit (LRU eviction).
 * Prevents Out-Of-Memory (OOM) Denial-of-Service attacks.
 */
interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

export class BoundedCache<K, V> {
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly map: Map<K, CacheEntry<V>>;

  constructor(maxEntries: number = 1000, ttlMs: number = 600_000) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
    this.map = new Map();
  }

  get(key: K): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.map.delete(key);
      return undefined;
    }

    // Refresh position for LRU
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this.maxEntries) {
      // Evict oldest item (first key in Map iterator)
      const oldestKey = this.map.keys().next().value;
      if (oldestKey !== undefined) {
        this.map.delete(oldestKey);
      }
    }

    this.map.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}
