import { serviceError } from "./database-protection";
import type { DashboardState } from "./types";

type Snapshot = { state: DashboardState; savedAt: number };
type CacheStore = Pick<Cache, "match" | "put">;
const FRESH_MS = 60000;
const MAX_STALE_MS = 6 * 3600000;

export function createStateReader() {
  const snapshots = new Map<string, Snapshot>();
  const loading = new Map<string, Promise<DashboardState>>();
  const failures = new Map<string, { until: number; error: unknown }>();
  return async function read(key: string, load: () => Promise<DashboardState>, cache?: CacheStore, now = Date.now()): Promise<DashboardState> {
    let snapshot = snapshots.get(key);
    if (!snapshot && cache) {
      try { const response = await cache.match(key); if (response) snapshot = await response.json() as Snapshot; } catch { /* Cache is best effort; D1 remains authoritative. */ }
      if (snapshot) snapshots.set(key, snapshot);
    }
    if (snapshot && now - snapshot.savedAt < FRESH_MS) return snapshot.state;
    const stale = (error: unknown) => {
      if (snapshot && now - snapshot.savedAt < MAX_STALE_MS) return { ...snapshot.state, service: {
        stale: true, message: serviceError(error).message, snapshotAt: new Date(snapshot.savedAt).toISOString(), retryAfter: serviceError(error).retryAfter,
      } };
      throw error;
    };
    const failure = failures.get(key);
    if (failure && failure.until > now) return stale(failure.error);
    let pending = loading.get(key);
    if (!pending) {
      pending = load().then(async state => {
        const updated = { state, savedAt: Date.now() };
        snapshots.set(key, updated); failures.delete(key);
        if (cache && !state.demoMode) {
          try { await cache.put(key, Response.json(updated, { headers: { "Cache-Control": "public, max-age=21600" } })); } catch { /* Local/private cache may not be available. */ }
        }
        return state;
      }).catch(error => {
        failures.set(key, { until: now + serviceError(error).retryAfter * 1000, error });
        throw error;
      }).finally(() => { loading.delete(key); });
      loading.set(key, pending);
    }
    try { return await pending; } catch (error) { return stale(error); }
  };
}
