// Two-level client cache: RAM -> localStorage -> network.
// The API stays compatible with the old wf:{data,ts} envelope.

const PREFIX = 'wf:';
export const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const CACHE_VERSION = 1;
const MAX_MEMORY_ENTRIES = 128;

interface CacheEnvelope<T = unknown> {
  version?: number;
  data: T;
  ts: number;
}

const memoryCache = new Map<string, CacheEnvelope>();

function normalizeKey(key: string): string {
  return String(key || '').trim().toLowerCase();
}

function isEnvelope(value: unknown): value is CacheEnvelope {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (candidate.version === undefined || candidate.version === CACHE_VERSION)
    && typeof candidate.ts === 'number'
    && Number.isFinite(candidate.ts)
    && 'data' in candidate;
}

function isFresh(entry: CacheEnvelope): boolean {
  const age = Date.now() - entry.ts;
  return Number.isFinite(age) && age >= 0 && age <= CACHE_TTL_MS;
}

function touchMemory(key: string, entry: CacheEnvelope): void {
  memoryCache.delete(key);
  memoryCache.set(key, entry);
  while (memoryCache.size > MAX_MEMORY_ENTRIES) {
    const oldest = memoryCache.keys().next().value as string | undefined;
    if (!oldest) break;
    memoryCache.delete(oldest);
  }
}

function removePersisted(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    // Storage may be disabled; RAM eviction is still safe.
  }
}

export function cacheGet<T>(key: string): T | null {
  const normalizedKey = normalizeKey(key);
  if (!normalizedKey) return null;

  const memoryEntry = memoryCache.get(normalizedKey);
  if (memoryEntry) {
    if (isFresh(memoryEntry)) {
      touchMemory(normalizedKey, memoryEntry);
      return memoryEntry.data as T;
    }
    memoryCache.delete(normalizedKey);
  }

  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + normalizedKey);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isEnvelope(parsed) || !isFresh(parsed)) {
      removePersisted(normalizedKey);
      return null;
    }
    const entry: CacheEnvelope<T> = {
      version: typeof parsed.version === 'number' ? parsed.version : CACHE_VERSION,
      data: parsed.data as T,
      ts: parsed.ts,
    };
    touchMemory(normalizedKey, entry);
    return entry.data;
  } catch {
    return null;
  }
}

export function cacheSet<T>(key: string, data: T): void {
  const normalizedKey = normalizeKey(key);
  if (!normalizedKey) return;
  const envelope: CacheEnvelope<T> = { version: CACHE_VERSION, data, ts: Date.now() };
  touchMemory(normalizedKey, envelope);
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PREFIX + normalizedKey, JSON.stringify(envelope));
  } catch {
    // Quota/private-mode failures leave the RAM layer available.
  }
}

export function cacheDelete(key: string): void {
  const normalizedKey = normalizeKey(key);
  if (!normalizedKey) return;
  memoryCache.delete(normalizedKey);
  removePersisted(normalizedKey);
}

export function cacheClear(): void {
  memoryCache.clear();
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(PREFIX)) keysToRemove.push(key);
    }
    keysToRemove.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Ignore storage access errors.
  }
}
