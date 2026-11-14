import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { scoreSignal } from "../app/lib/scoring";
import { cleanText, reportSlots, EMAIL_SCHEDULE_IST, topicLabel } from "../app/lib/presentation";
import { areSameIssue } from "../app/lib/issues";
import { parseFeed, selectSourcesForRun, sendDueScheduledDigests, runPolitilyScan } from "../app/lib/monitor";
import { acquireLease, releaseLease, deliverEmail, retryPendingEmails } from "../app/lib/delivery";
import { priorityTarget, runMailScheduler } from "../app/lib/scheduler";
import { ensureDatabase, insertStory, addStorySource, listStoriesInDateRange, listHourlyStories, promoteLatestReport, getStoryById, attachStorySources } from "../app/lib/storage";
import { DEFAULT_SOURCES } from "../app/lib/source-library";
import type { RawSignal, RuntimeEnv, StoredStory } from "../app/lib/types";
import { withDatabaseProtection, ServiceError } from "../app/lib/database-protection";
import { archiveWindow, readArchivePage } from "../app/lib/archive";
import { archiveCsv } from "../app/lib/archive-download";

const sqlite = new DatabaseSync(":memory:");
class Statement {
  values: unknown[] = [];
  constructor(public sql: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async all() {
    // Desktop SQLite permits larger compound queries than the production D1
    // engine. Enforce a conservative D1 ceiling in our adapter.
    if ((this.sql.match(/UNION ALL/g) || []).length >= 5) throw new Error("D1_ERROR: too many terms in compound SELECT: SQLITE_ERROR");
    return { results: sqlite.prepare(this.sql).all(...this.values as never[]) };
  }
  async first() { return sqlite.prepare(this.sql).get(...this.values as never[]) || null; }
  async run() { const result = sqlite.prepare(this.sql).run(...this.values as never[]); return { results: [], meta: { changes: Number(result.changes) } }; }
}
const db = { prepare: (sql: string) => new Statement(sql), batch: async (statements: Statement[]) => {
  sqlite.exec("BEGIN");
  try { const result = []; for (const statement of statements) result.push(await statement.run()); sqlite.exec("COMMIT"); return result; }
  catch (error) { sqlite.exec("ROLLBACK"); throw error; }
} } as unknown as D1Database;
const signal: RawSignal = { title: "India signs trade treaty at BRICS summit with China and Russia", summary: "Government announces a new trade policy after bilateral talks at the summit.", url: "https://example.org/brics", sourceName: "Test newsroom", sourceType: "rss", sourceId: "test", sourcePriority: 99, publishedAt: new Date().toISOString() };
const story: StoredStory = { ...signal, ...scoreSignal(signal), id: "test-story", fingerprint: "test-fp", sourceCountry: "india", language: "English", publishedAt: signal.publishedAt!, detectedAt: new Date().toISOString(), status: "triggered" };

assert.equal(cleanText("&amp;nbsp; A &#x1F1EE; &amp; B <b>test</b>"), "A 🇮 & B test");
assert.equal(reportSlots(new Date("2026-09-20T02:29:59Z")).length, 0);
assert.equal(reportSlots(new Date("2026-09-20T02:30:00Z"))[0].slot, "8");
assert.equal(reportSlots(new Date("2026-09-20T08:30:00Z"))[0].slot, "14");
assert.equal(reportSlots(new Date("2026-09-20T15:30:00Z")).length, 1);
assert.equal(reportSlots(new Date("2026-09-20T17:30:00Z"))[0].slot, "23");
assert.equal(reportSlots(new Date("2026-09-20T18:30:00Z")).length, 0);
assert.equal(EMAIL_SCHEDULE_IST.length, 16);
for (let hour = 8; hour <= 23; hour++) {
  const slot = reportSlots(new Date(`2026-09-20T${String(hour).padStart(2, "0")}:01:00+05:30`))[0];
  assert.equal(slot.slot, String(hour));
  assert.equal(Date.parse(slot.endIso) - Date.parse(slot.startIso), (hour === 8 ? 9 : 1) * 3600000);
}
assert.equal(reportSlots(new Date("2026-09-20T23:59:00+05:30"))[0].slot, "23");
assert.equal(reportSlots(new Date("2026-09-21T08:00:00+05:30"))[0].startIso, "2026-09-20T17:30:00.000Z");
assert.equal(topicLabel({ title: "Nvidia CEO resigns", summary: "", tags: [] }), "Technology & business");
assert.equal(topicLabel({ title: "University admission rules change", summary: "", tags: [] }), "Youth & education");
assert.equal(topicLabel({ title: "Protests in India over new law", summary: "", tags: [] }), "People & protests");
assert.equal(topicLabel({ title: "Flood disaster displaces families", summary: "", tags: [] }), "Climate & environment");
assert.equal(priorityTarget(new Date("2026-09-20T14:30:00Z")), 5);
assert.ok(story.totalScore >= 82, `BRICS substantive summit expected urgent, got ${story.totalScore}`);
assert.equal(scoreSignal(signal).politicalWeight, scoreSignal({ ...signal, sourcePriority: 1 }).politicalWeight);
assert.equal(scoreSignal({ ...signal, title: "Business displays new sports shoes", summary: "A product showcase" }).tags.includes("party-regional"), false);
assert.ok(scoreSignal({ ...signal, title: "Sponsored brand promotion launch", summary: "A product showcase" }).totalScore < 60);
assert.equal(areSameIssue({ title: "Rahul Gandhi visits Kerala flood victims", summary: "", sourceName: "A" }, { title: "Rahul Gandhi appeals defamation verdict in Surat court", summary: "", sourceName: "B" }), false);
assert.equal(areSameIssue({ title: "Bankipur bypoll candidates announced", summary: "", sourceName: "A" }, { title: "Mumbai bypoll candidates announced", summary: "", sourceName: "B" }), false);
const rss = parseFeed(`<rss><channel><item><title><![CDATA[BRICS &amp; summit begins]]></title><link>https://example.org/story</link><description><![CDATA[<p>India &amp; China discuss trade policy with leaders in a bilateral meeting.</p>]]></description><pubDate>Sun, 20 Sep 2026 08:00:00 GMT</pubDate></item></channel></rss>`, DEFAULT_SOURCES[0]);
assert.equal(rss[0]?.title, "BRICS & summit begins");
assert.ok(rss[0]?.summary.includes("India & China"));
const atom = parseFeed(`<feed><entry><title>BRICS summit statement released</title><link rel="alternate" href="https://example.org/atom"/><summary>Leaders release their joint statement on trade and policy after talks.</summary><published>2026-09-20T08:00:00Z</published></entry></feed>`, DEFAULT_SOURCES[0]);
assert.equal(atom[0]?.url, "https://example.org/atom");
const sources = selectSourcesForRun(DEFAULT_SOURCES.filter(s => s.active), 28);
assert.ok(sources.some(s => s.id === "global-summits-live-v3"));
assert.ok(sources.some(s => s.id === "rss-bbc-world-v3"));
assert.ok(sources.filter(s => /\bani\b|aninews\.in/i.test(s.name + " " + s.url)).length <= 3);
const selectionTime = Date.now();
const smallRun = selectSourcesForRun(DEFAULT_SOURCES, 4, selectionTime);
assert.equal(smallRun.length, 4);
assert.equal(new Set(smallRun.map(source => new URL(source.url).hostname)).size, 4, "Small scans must not select four searches from one provider");
assert.ok(smallRun.some(source => source.region === "india" && /Direct newsroom RSS/.test(source.category)));
assert.ok(smallRun.some(source => source.region === "global" && /Direct newsroom RSS/.test(source.category)));
const googleFailure = DEFAULT_SOURCES.map(source => source.id === "fast-google-india-politics-2h" ? { ...source, lastCheckedAt: new Date(selectionTime).toISOString(), lastError: "Timed out after 5000ms" } : source);
assert.ok(selectSourcesForRun(googleFailure, 4, selectionTime).every(source => !source.url.includes("news.google.com")), "Another Google query is not a fallback for a Google outage");
assert.ok(selectSourcesForRun(googleFailure, 4, selectionTime + 16 * 60000).some(source => source.url.includes("news.google.com")), "A provider must recover eligibility after backoff");
const secondRun = selectSourcesForRun(DEFAULT_SOURCES.map(source => smallRun.some(selected => selected.id === source.id) ? { ...source, lastCheckedAt: new Date(selectionTime).toISOString() } : source), 4, selectionTime);
assert.notEqual(secondRun[0].id, smallRun[0].id, "Direct India feeds must rotate");
assert.notEqual(secondRun[1].id, smallRun[1].id, "Direct world feeds must rotate");
assert.deepEqual(selectSourcesForRun(DEFAULT_SOURCES.map(source => ({ ...source, lastCheckedAt: new Date(selectionTime).toISOString(), lastError: "HTTP 503" })), 4, selectionTime), []);
let setupComplete = false;
for (let attempt = 0; attempt < 6; attempt++) {
  try { await withDatabaseProtection({ DB: db, POLITILY_FREE_MODE: "true" }, "free-setup-test", env => ensureDatabase(env.DB!)); setupComplete = true; break; }
  catch (error) { if (!(error instanceof ServiceError) || error.code !== "DATABASE_SETUP") throw error; }
}
assert.equal(setupComplete, true, "Fresh database must initialize within Free-plan query batches");
await ensureDatabase(db);
await insertStory(db, story);
await addStorySource(db, { storyId: story.id, title: story.title, sourceName: "Other newsroom", url: "https://example.org/other", publishedAt: story.publishedAt });
assert.equal((await listStoriesInDateRange(db, new Date(Date.now() - 3600000).toISOString(), new Date(Date.now() + 3600000).toISOString())).length, 1);
const update = { ...signal, title: "BRICS summit concludes with a signed trade agreement", publishedAt: new Date().toISOString() };
await promoteLatestReport(db, story.id, update, scoreSignal(update));
assert.equal((await getStoryById(db, story.id))?.title, update.title);
assert.equal((await getStoryById(db, story.id))?.sourceLinks?.length, 1);
const plan = sqlite.prepare("EXPLAIN QUERY PLAN SELECT id FROM stories WHERE COALESCE(published_at, detected_at) >= ?").all("2026-09-20T00:00:00Z");
assert.ok(plan.some(row => String(row.detail).includes("stories_report_date_idx")));
const sourcePlan = sqlite.prepare("EXPLAIN QUERY PLAN SELECT * FROM story_sources WHERE story_id = ? ORDER BY created_at DESC LIMIT 26").all(story.id);
assert.ok(sourcePlan.some(row => String(row.detail).includes("story_sources_story_created_idx")));
assert.ok(!sourcePlan.some(row => String(row.detail).includes("TEMP B-TREE")));
sqlite.exec("BEGIN");
for (let i = 0; i < 10000; i++) sqlite.prepare("INSERT INTO story_sources (id,story_id,title,url,source_name,created_at) VALUES (?,?,?,?,?,?)").run(`archive-${i}`, story.id, `Old report ${i}`, `https://example.org/archive-${i}`, "Archive", "2025-01-01T00:00:00Z");
sqlite.exec("COMMIT");
await attachStorySources(db, [story]);
assert.equal(story.sourceLinks?.length, 25);
assert.equal(story.sourceLinksTruncated, true);
const fullDashboard = [story, ...Array.from({ length: 159 }, (_, i) => ({ ...story, id: `empty-trail-${i}`, sourceLinks: [] }))];
await withDatabaseProtection({ DB: db, POLITILY_FREE_MODE: "true" }, "full-dashboard-citations", safe => attachStorySources(safe.DB!, fullDashboard));
assert.equal(fullDashboard[0].sourceLinks?.length, 25, "All 160 cards must load within D1 compound/query limits");
assert.equal(fullDashboard[159].sourceLinks?.length, 0);
assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM story_sources").get()?.count, 10001);
assert.throws(() => archiveWindow("2026-01-01", "2026-03-01"), /31 days/);
assert.ok(archiveCsv([{ title: "=unsafe_formula", summary: 'A "quote", with comma' }]).includes("'=unsafe_formula"));
const archiveParams = new URLSearchParams({ table: "story_sources", start: "2025-01-01", end: "2025-01-31" });
const archiveFirst = await readArchivePage(db, archiveParams);
assert.equal(archiveFirst.rows.length, 100);
assert.ok(archiveFirst.next);
archiveParams.set("cursor", archiveFirst.next!);
const archiveSecond = await readArchivePage(db, archiveParams);
assert.equal(archiveSecond.rows.length, 100);
assert.equal(new Set([...archiveFirst.rows, ...archiveSecond.rows].map(row => row.id)).size, 200);
const parent = await readArchivePage(db, new URLSearchParams({ table: "parents", ids: story.id, start: "2025-01-01", end: "2025-01-31" }));
assert.equal(parent.rows[0]?.id, story.id);
// A late report belongs to its capture hour even if its publication was yesterday.
await insertStory(db, { ...story, id: "late-fixture", fingerprint: "late-fixture-fp", detectedAt: "2026-09-20T04:15:00.000Z", publishedAt: "2026-09-19T18:00:00.000Z" });
await insertStory(db, { ...story, id: "boundary-fixture", fingerprint: "boundary-fixture-fp", detectedAt: "2026-09-20T04:30:00.000Z", publishedAt: "2026-09-19T18:00:00.000Z" });
const firstHour = await listHourlyStories(db, "2026-09-20T03:30:00.000Z", "2026-09-20T04:30:00.000Z");
const nextHour = await listHourlyStories(db, "2026-09-20T04:30:00.000Z", "2026-09-20T05:30:00.000Z");
assert.ok(firstHour.some(item => item.id === "late-fixture"));
assert.ok(firstHour.some(item => item.id === "boundary-fixture"));
assert.ok(!nextHour.some(item => item.id === "boundary-fixture"));
sqlite.exec("DELETE FROM stories WHERE id IN ('late-fixture','boundary-fixture')");
const lease = await acquireLease(db, "test");
assert.ok(lease);
assert.equal(await acquireLease(db, "test"), null);
await releaseLease(db, "test", lease!);
assert.ok(await acquireLease(db, "test"));
const env: RuntimeEnv = { DB: db, RESEND_API_KEY: "test-key", ALERT_EMAIL: "reader@example.org", ALERT_FROM_EMAIL: "desk@example.org" };
let calls = 0;
const payloads: string[] = [];
const keys: string[] = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (_url, options) => {
  calls++; payloads.push(String(options?.body)); keys.push(String((options?.headers as Record<string, string>)["Idempotency-Key"]));
  return Response.json(calls === 1 ? { message: "Temporary provider outage" } : { id: `mail-${calls}` }, { status: calls === 1 ? 503 : 200 });
};
try {
  const job = { key: "test-retry", kind: "urgent", storyId: story.id };
  assert.equal((await deliverEmail(env, { subject: "Original", html: "<p>Original</p>", text: "Original" }, job)).sent, false);
  sqlite.exec("UPDATE email_outbox SET next_attempt_at='2000-01-01T00:00:00Z'");
  await retryPendingEmails(env);
  assert.equal(sqlite.prepare("SELECT status FROM email_outbox WHERE id='test-retry'").get()?.status, "accepted");
  await deliverEmail(env, { subject: "Changed", html: "Changed", text: "Changed" }, job);
  assert.equal(calls, 2);
  assert.equal(payloads[0], payloads[1]); assert.equal(keys[0], keys[1]);
  const before = calls;
  await Promise.all([deliverEmail(env, { subject: "Once", html: "One", text: "One" }, { key: "concurrent", kind: "test" }), deliverEmail(env, { subject: "Once", html: "One", text: "One" }, { key: "concurrent", kind: "test" })]);
  assert.equal(calls, before + 1);
  const digestTime = new Date("2026-09-20T15:35:00Z");
  await sendDueScheduledDigests(env, digestTime);
  const after = calls;
  await sendDueScheduledDigests(env, digestTime);
  assert.equal(calls, after);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM email_digests").get()?.count, 1);
  assert.ok(payloads.some(body => body.includes("Hourly briefing") && body.includes("9:00 PM")));
  for (let hour = 8; hour <= 23; hour++) {
    await sendDueScheduledDigests(env, new Date(`2026-09-20T${String(hour).padStart(2, "0")}:01:00+05:30`));
  }
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM email_digests").get()?.count, 16);
  const beforeNight = calls;
  await runMailScheduler(env, new Date("2026-09-21T07:59:00+05:30"));
  assert.equal(calls, beforeNight, "Automatic mail must pause overnight");
  const missingCalls = calls;
  const missing = await deliverEmail({ DB: db }, { subject: "Missing config", html: "Test", text: "Test" }, { key: "missing-config", kind: "test" });
  assert.equal(missing.sent, false); assert.equal(calls, missingCalls);
  assert.match(String(sqlite.prepare("SELECT last_error FROM email_outbox WHERE id='missing-config'").get()?.last_error), /RESEND_API_KEY/);
  const titles = ["Kerala river pollution hearing questions factory permits", "Mexico presidential election turnout figures announced", "Japan central bank changes lending rate policy", "Assam flood rescue operations reach isolated villages", "European parliament approves digital privacy regulation"];
  const day = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const candidateTime = new Date(`${day}T20:00:00+05:30`).toISOString();
  for (const [index, title] of titles.entries()) {
    await insertStory(db, { ...story, id: `priority-${index}`, fingerprint: `fp-priority-${index}`, title, summary: "Detailed reporting of a distinct public-interest development.", totalScore: 65, emailSentAt: null, publishedAt: candidateTime, detectedAt: candidateTime });
  }
  await runMailScheduler(env, new Date(`${day}T20:30:00+05:30`));
  assert.equal(sqlite.prepare("SELECT COUNT(DISTINCT story_id) AS count FROM email_outbox WHERE kind IN ('urgent','priority') AND status='accepted'").get()?.count, 5);
  await withDatabaseProtection({ ...env, POLITILY_FREE_MODE: "true" }, "free-mail-test", safe => runMailScheduler(safe, new Date(`${day}T20:35:00+05:30`)));
  for (let i = 0; i < 100; i++) {
    await insertStory(db, { ...story, id: `busy-hour-${i}`, fingerprint: `busy-hour-fp-${i}`, totalScore: 20,
      detectedAt: new Date(`${day}T20:30:00+05:30`).toISOString(), publishedAt: new Date(`${day}T20:25:00+05:30`).toISOString() });
  }
  sqlite.exec("UPDATE email_outbox SET next_attempt_at='2000-01-01T00:00:00Z' WHERE id='missing-config'");
  await withDatabaseProtection({ ...env, POLITILY_FREE_MODE: "true" }, "busy-hour-with-retry", safe => runMailScheduler(safe, new Date(`${day}T21:01:00+05:30`)));
  assert.equal(sqlite.prepare("SELECT status FROM email_outbox WHERE id=?").get(`hourly-${day}-21`)?.status, "accepted");
  sqlite.exec("DELETE FROM stories WHERE id LIKE 'busy-hour-%'");
  const fetchedHosts = new Set<string>();
  globalThis.fetch = async input => {
    const host = new URL(String(input)).hostname;
    fetchedHosts.add(host);
    if (host === "news.google.com") throw new Error("Timed out after 5000ms");
    return new Response(`<rss><channel><item><title>Parliament debates new public education accountability bill</title><link>https://example.org/free-scan-test</link><description>Members of parliament discuss education funding and government policy reforms.</description><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`);
  };
  const freeScan = await withDatabaseProtection({ ...env, POLITILY_FREE_MODE: "true" }, "free-scan-test", runPolitilyScan);
  assert.equal(freeScan.run.status, "complete");
  assert.ok(freeScan.run.createdCount > 0, "Direct publishers must populate the radar even when Google is unavailable");
  assert.equal(fetchedHosts.size, 4);
  assert.ok(freeScan.errors.some(error => error.includes("Timed out")));
  assert.ok(freeScan.run.createdCount <= 6);
  sqlite.prepare("UPDATE scan_runs SET started_at=? WHERE id=?").run(new Date(Date.now() - 120000).toISOString(), freeScan.run.id);
  await assert.rejects(withDatabaseProtection({ ...env, POLITILY_FREE_MODE: "true" }, "scan-cooldown-test", runPolitilyScan), (error: unknown) => error instanceof ServiceError && error.code === "SCAN_COOLDOWN" && error.retryAfter <= 120);
  sqlite.prepare("UPDATE scan_runs SET status='failed' WHERE id=?").run(freeScan.run.id);
  globalThis.fetch = async () => { throw new Error("HTTP 503"); };
  const failedScan = await withDatabaseProtection({ ...env, POLITILY_FREE_MODE: "true" }, "failed-scan-retry-test", runPolitilyScan);
  assert.equal(failedScan.run.status, "failed", "A failed scan older than one minute can be retried");
  await assert.rejects(withDatabaseProtection({ ...env, POLITILY_FREE_MODE: "true" }, "failed-scan-cooldown-test", runPolitilyScan), (error: unknown) => error instanceof ServiceError && error.code === "SCAN_COOLDOWN" && error.retryAfter <= 60);
} finally { globalThis.fetch = originalFetch; sqlite.close(); }
console.log("PASS: schedule, ranking, source diversity, entity decoding, RSS/Atom, topic separation, additive schema, queue retry, idempotency, concurrent claims, exactly-once digest acceptance.");
