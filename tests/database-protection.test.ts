import assert from "node:assert/strict";
import { createStateReader } from "../app/lib/state-cache";
import { errorResponse, isD1QuotaError, nextD1Reset, withDatabaseProtection } from "../app/lib/database-protection";
import { getDemoState } from "../app/lib/demo-data";

assert.equal(nextD1Reset(Date.parse("2026-09-20T23:59:59Z")), "2026-09-21T00:00:00.000Z");
assert.equal(nextD1Reset(Date.parse("2026-09-21T00:00:00Z")), "2026-09-22T00:00:00.000Z");
const quotaError = new Error("D1_ERROR: Your account has exceeded D1's free tier daily row read limit.");
assert.equal(isD1QuotaError(quotaError), true);
assert.equal(isD1QuotaError(new Error("Resend API error: invalid key")), false);
assert.equal(errorResponse(quotaError).status, 503);
assert.equal(errorResponse(quotaError).headers.get("Retry-After"), "600");

let calls = 0;
function fakeDb(rows = 0, fail = false): D1Database {
  return { prepare: () => ({ all: async () => { calls++; if (fail) throw quotaError; return { results: [{ value: "ok" }], meta: { rows_read: rows, rows_written: 0 } }; } }) } as unknown as D1Database;
}
const expensive = fakeDb(1500);
await assert.rejects(withDatabaseProtection({ DB: expensive, POLITILY_D1_MAX_ROWS_PER_JOB: "1000" }, "budget-test", async env => {
  assert.equal((await env.DB!.prepare("test").first<{ value: string }>())?.value, "ok");
  await env.DB!.prepare("test again").all();
}), /read safety budget/);
assert.equal(calls, 1, "Stop later queries when actual rows read reach the budget");
const blocked = fakeDb(0, true);
await assert.rejects(withDatabaseProtection({ DB: blocked }, "quota-test", env => env.DB!.prepare("test").all()), /Cloudflare has blocked/);
const before = calls;
await assert.rejects(withDatabaseProtection({ DB: blocked }, "quota-repeat", env => env.DB!.prepare("test").all()), /retries are paused/);
assert.equal(calls, before, "Circuit breaker must not touch D1 again during cooldown");
let statements = 0;
await assert.rejects(withDatabaseProtection({ DB: fakeDb(), POLITILY_FREE_MODE: "true" }, "free-query-limit", async env => {
  for (let i = 0; i < 46; i++) { await env.DB!.prepare("test").all(); statements++; }
}), /Free-plan query budget/);
assert.equal(statements, 45);

const state = { ...getDemoState(), demoMode: false };
const values = new Map<string, Response>();
const cache = { match: async (key: RequestInfo | URL) => values.get(String(key))?.clone(), put: async (key: RequestInfo | URL, response: Response) => { values.set(String(key), response); } } as Pick<Cache, "match" | "put">;
const now = Date.now();
let loads = 0;
const load = async () => { loads++; return state; };
const reader = createStateReader();
await Promise.all([reader("https://test/state", load, cache, now), reader("https://test/state", load, cache, now)]);
assert.equal(loads, 1, "Coalesce concurrent refreshes");
await createStateReader()("https://test/state", load, cache, now + 10000);
assert.equal(loads, 1, "A new Worker isolate must use the edge snapshot");
const stale = await reader("https://test/state", async () => { loads++; throw quotaError; }, cache, now + 70000);
assert.equal(stale.service?.stale, true);
assert.match(stale.service?.message || "", /quota is exhausted/);
await reader("https://test/state", load, cache, now + 80000);
assert.equal(loads, 2, "Back off while retaining a labelled stale snapshot");
await assert.rejects(createStateReader()("https://empty/state", async () => { throw quotaError; }), /daily row read limit/);
const recovered = await reader("https://test/state", load, cache, now + 800000);
assert.equal(recovered.service, undefined);
await assert.rejects(reader("https://test/state", async () => { throw quotaError; }, cache, now + 7 * 3600000));
console.log("PASS: D1 quota classification, UTC reset, per-operation row budget, query telemetry, circuit breaker, edge cache, concurrent refresh coalescing, stale labelling, expiry and recovery.");
