// Client-side persistent cache backed by localStorage
// Survives page refreshes — enables instant word page loads

const PREFIX = 'wf:';
const TTL = 2 * 60 * 60 * 1000; // 2 hours

export function cacheGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > TTL) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return data as T;
  } catch {
    return null;
  }
}

export function cacheSet(key: string, data: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ data, ts: Date.now() }));
  } catch {
    // localStorage full — silently skip
  }
}
