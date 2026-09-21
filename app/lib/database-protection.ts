import { AsyncLocalStorage } from "node:async_hooks";
import type { RuntimeEnv } from "./types";

export const RELEASE = "newsroom-3.3-d1-binding";
type Usage = { operation: string; queries: number; rowsRead: number; rowsWritten: number; rowBudget: number; queryBudget: number };
const scope = new AsyncLocalStorage<Usage>();
const wrapped = new WeakMap<D1Database, D1Database>();
const originals = new WeakMap<D1Database, D1Database>();
const quotaFailures = new WeakMap<D1Database, { retryAt: number; resetAt: string }>();
export function remainingQueries() { const usage = scope.getStore(); return usage ? usage.queryBudget - usage.queries : Infinity; }
export function freeMode(env: RuntimeEnv) { return env.POLITILY_FREE_MODE === "true"; }

export class ServiceError extends Error {
  constructor(message: string, public code: string, public retryAfter = 60, public resetAt?: string) { super(message); }
}

export function nextD1Reset(now = Date.now()) {
  const date = new Date(now);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)).toISOString();
}

export function isD1QuotaError(error: unknown) {
  return /(?:D1|row read|row write).*(?:daily.*limit|exceeded.*limit|free tier)|daily.*(?:row read|row write).*limit/i.test(String(error));
}

export function databaseIdentity(db: D1Database) { return originals.get(db) || db; }

export function quotaState(db?: D1Database) {
  if (!db) return null;
  const failure = quotaFailures.get(databaseIdentity(db));
  return failure && failure.retryAt > Date.now() ? failure : null;
}

export function serviceError(error: unknown): ServiceError {
  if (error instanceof ServiceError) return error;
  if (isD1QuotaError(error)) return new ServiceError(
    "Cloudflare has blocked D1 queries because the account's daily quota is exhausted. Scans, research and queued email cannot run until the quota resets (5:30 AM IST) or the account is upgraded. Stored data has not been deleted.",
    "D1_QUOTA_EXCEEDED", 600, nextD1Reset());
  return new ServiceError(error instanceof Error ? error.message : "Service unavailable", "SERVICE_UNAVAILABLE", 60);
}

export function errorResponse(error: unknown) {
  const detail = serviceError(error);
  return Response.json({ error: detail.message, message: detail.message, code: detail.code, retryAfter: detail.retryAfter, resetAt: detail.resetAt },
    { status: detail.code === "SCAN_COOLDOWN" ? 429 : 503, headers: { "Cache-Control": "no-store", "Retry-After": String(detail.retryAfter) } });
}

// Stable wrappers keep schema setup memoized. Usage is isolated per request/cron job.
function protectDatabase(db: D1Database): D1Database {
  if (originals.has(db)) return db;
  const existing = wrapped.get(db);
  if (existing) return existing;
  const statements = new WeakMap<D1PreparedStatement, D1PreparedStatement>();
  async function query<T>(count: number, task: () => Promise<T>): Promise<T> {
    const circuit = quotaState(db);
    if (circuit) throw new ServiceError("D1 quota exhausted. Database retries are paused for 10 minutes; check Cloudflare D1 usage or upgrade the account.", "D1_QUOTA_EXCEEDED", Math.max(1, Math.ceil((circuit.retryAt - Date.now()) / 1000)), circuit.resetAt);
    const usage = scope.getStore();
    if (usage && usage.queries + count > usage.queryBudget) throw new ServiceError("This operation reached its Free-plan query budget. Remaining work will continue in a later batch.", "D1_QUERY_BUDGET", 60);
    if (usage && usage.rowsRead >= usage.rowBudget) throw new ServiceError("This operation reached its database-read safety budget. Check politily_d1_usage in Worker logs before raising the budget.", "D1_READ_BUDGET", 300);
    if (usage) usage.queries += count;
    try {
      const result = await task();
      for (const item of Array.isArray(result) ? result : [result]) {
        const meta = (item as { meta?: { rows_read?: number; rows_written?: number } })?.meta;
        if (usage && meta) { usage.rowsRead += Number(meta.rows_read || 0); usage.rowsWritten += Number(meta.rows_written || 0); }
      }
      return result;
    } catch (error) {
      if (isD1QuotaError(error)) {
        const resetAt = nextD1Reset();
        quotaFailures.set(db, { resetAt, retryAt: Math.min(Date.now() + 600000, Date.parse(resetAt)) });
        throw serviceError(error);
      }
      throw error;
    }
  }
  function statement(raw: D1PreparedStatement): D1PreparedStatement {
    const proxy = new Proxy(raw, { get(target, property) {
      if (property === "bind") return (...values: unknown[]) => statement(target.bind(...values));
      if (property === "first") return async (column?: string) => {
        const result = await query(1, () => target.all<Record<string, unknown>>());
        const row = result.results[0] || null;
        if (row && column && !(column in row)) throw new Error(`D1 column not found: ${column}`);
        return column ? row?.[column] ?? null : row;
      };
      if (property === "all" || property === "run") return () => query(1, () => target[property]());
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    statements.set(proxy, raw);
    return proxy;
  }
  const proxy = new Proxy(db, { get(target, property) {
    if (property === "prepare") return (sql: string) => statement(target.prepare(sql));
    if (property === "batch") return (items: D1PreparedStatement[]) => query(items.length, () => target.batch(items.map(item => statements.get(item) || item)));
    const value = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  wrapped.set(db, proxy); originals.set(proxy, db);
  return proxy;
}

export async function withDatabaseProtection<T>(env: RuntimeEnv, operation: string, task: (safe: RuntimeEnv) => Promise<T>) {
  const configured = Number(env.POLITILY_D1_MAX_ROWS_PER_JOB || 12000);
  const usage: Usage = { operation, queries: 0, rowsRead: 0, rowsWritten: 0, rowBudget: Number.isFinite(configured) ? Math.max(1000, configured) : 12000, queryBudget: freeMode(env) ? 45 : 950 };
  return scope.run(usage, async () => {
    try { return await task({ ...env, DB: env.DB ? protectDatabase(env.DB) : undefined }); }
    finally { console.log(JSON.stringify({ event: "politily_d1_usage", ...usage })); }
  });
}
