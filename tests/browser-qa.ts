import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { getDemoState } from "../app/lib/demo-data";
import { scoreSignal } from "../app/lib/scoring";
const playwrightPath = process.env.PLAYWRIGHT_MODULE || "playwright";
const { chromium } = await import(playwrightPath);
const data = getDemoState();
data.generatedAt = new Date().toISOString();
data.config = { ...data.config, storageReady: true, geminiReady: true, emailReady: true, alertThreshold: 82 };
const original = data.stories[0];
const examples = [
  ["BRICS leaders discuss trade, development finance and the next phase of cooperation", "The summit brings trade, development lending and cooperation between emerging economies into focus. The research task is to distinguish adopted agreements from statements of intent and assess the implications for India.", "BBC World"],
  ["Parliament debates education accountability as students seek answers on examination reform", "Lawmakers have raised questions about examination security and institutional accountability. The available reports describe competing proposals; original parliamentary records are needed to establish the exact commitments.", "The Indian Express"],
  ["Election funding transparency: the documents behind the political debate", "The debate centres on donor disclosures, accountability and the relationship between political finance and public policy. A complete explainer should compare official filings, legal requirements and the parties' responses.", "The Hindu"],
  ["Court hearing puts environmental safeguards and public consultation under scrutiny", "The reporting concerns the approval process, the evidence submitted and the communities affected. The next step is to examine the order itself and separate judicial findings from arguments presented by the parties.", "Reuters"],
];
data.stories = examples.map(([title, summary, sourceName], i) => {
  const signal = { title, summary, sourceName, sourceType: "rss" as const, sourceId: `qa-${i}`, sourcePriority: 90, publishedAt: new Date(Date.now() - (i + 1) * 1200000).toISOString(), url: `https://example.org/test-${i}` };
  return { ...original, ...signal, ...scoreSignal(signal), id: `qa-${i}`, detectedAt: signal.publishedAt,
    articleExcerpt: summary, brief: i === 2 ? original.brief : null, sourceLinks: [
      { id: `s-${i}`, storyId: `qa-${i}`, title, url: signal.url, sourceName, publishedAt: signal.publishedAt },
      { id: `s2-${i}`, storyId: `qa-${i}`, title: `${title}: independent reporting and context`, url: `https://example.org/context-${i}`, sourceName: "Al Jazeera", publishedAt: signal.publishedAt },
    ] };
});
data.runs = [{ id: "qa-scan", status: "complete", startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), scannedCount: 42, createdCount: 8, triggeredCount: 3, emailedCount: 2, message: "UI test fixture; not live news" }];
data.deliveries = [{ id: "qa-email", kind: "newsletter", subject: "Afternoon edition / 2 PM IST", status: "accepted", attempts: 1, provider_id: "test-message-id", created_at: new Date().toISOString(), last_error: "" }];
await mkdir("artifacts", { recursive: true });
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const errors: string[] = [];
try {
  for (const [width, height] of [[1440, 1000], [390, 844], [320, 740], [768, 1024]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    page.on("pageerror", (error: Error) => errors.push(error.message));
    await page.route("**/api/state", (route: { fulfill: (arg: object) => Promise<void> }) => route.fulfill({ json: data }));
    await page.goto("http://localhost:3017", { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Issue radar", exact: false }).waitFor();
    assert.ok(await page.locator(".story-card").count() >= 4);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `Overflow at ${width}`);
    const overlap = await page.locator(".story-card").evaluateAll((cards: Element[]) => cards.slice(1).some((card, i) => card.getBoundingClientRect().top < cards[i].getBoundingClientRect().bottom));
    assert.equal(overlap, false);
    await page.screenshot({ path: `artifacts/radar-${width}.png`, fullPage: false });
    await page.locator(".story-open").first().click();
    if (width <= 850) assert.equal(await page.locator(".feed").isVisible(), false);
    await page.getByRole("tab", { name: /Sources/ }).click();
    assert.ok(await page.locator(".reader .source-trail article").count() >= 2);
    await page.screenshot({ path: `artifacts/issue-${width}.png`, fullPage: false });
    await page.getByRole("button", { name: "Delivery", exact: true }).click();
    await page.getByRole("heading", { name: "Delivery", exact: true }).waitFor();
    if (width === 1440) {
      await page.route("**/api/archive?**", (route: { request: () => { url: () => string }; fulfill: (arg: object) => Promise<void> }) => {
        const params = new URL(route.request().url()).searchParams;
        const table = params.get("table");
        return route.fulfill({ json: { rows: table === "stories" ? [{ id: "archive-test", title: "QA archive fixture", brief_json: '{"videoScript":"Roman Hindi test"}' }] : table === "story_sources" ? [{ id: "link-test", story_id: "archive-test", url: "https://example.org/evidence" }] : [{ id: "catalog-test", name: "QA source" }], next: null } });
      });
      const downloaded = page.waitForEvent("download");
      await page.getByRole("button", { name: "Full archive (JSON)" }).click();
      const download = await downloaded;
      const archive = JSON.parse(await readFile(await download.path(), "utf8"));
      assert.equal(archive.stories.length, 1);
      assert.equal(archive.story_sources.length, 1);
      assert.match(archive.stories[0].brief_json, /Roman Hindi/);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: `artifacts/delivery-${width}.png`, fullPage: false });
    await page.getByRole("button", { name: /Issue radar/ }).click();
    await page.getByRole("textbox", { name: "Search issues or research a topic" }).fill("BRICS");
    assert.equal(await page.locator(".story-card").count(), 1);
    await page.getByRole("textbox", { name: "Search issues or research a topic" }).fill("unseen future issue");
    assert.equal(await page.locator(".story-card").count(), 0);
    assert.equal(await page.getByRole("button", { name: "Research topic" }).isEnabled(), true);
    await page.close();
  }
  const unavailable = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await unavailable.route("**/api/state", (route: { fulfill: (arg: object) => Promise<void> }) => route.fulfill({ status: 503, headers: { "Retry-After": "600" }, json: { code: "D1_QUOTA_EXCEEDED", error: "Cloudflare D1 daily quota exhausted. Reset at 5:30 AM IST.", retryAfter: 600 } }));
  await unavailable.goto("http://localhost:3017", { waitUntil: "networkidle" });
  await unavailable.getByRole("heading", { name: "The newsroom is unavailable" }).waitFor();
  assert.equal(await unavailable.locator(".story-card").count(), 0);
  assert.equal(await unavailable.getByRole("link", { name: "Open connection diagnostics" }).isVisible(), true);
  assert.equal(await unavailable.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await unavailable.screenshot({ path: "artifacts/quota-error-390.png" });
  await unavailable.close();
  const degraded = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await degraded.route("**/api/state", (route: { fulfill: (arg: object) => Promise<void> }) => route.fulfill({ json: { ...data, service: { stale: true, message: "D1 quota exhausted. Snapshot only.", snapshotAt: new Date().toISOString(), retryAfter: 600 } } }));
  await degraded.goto("http://localhost:3017", { waitUntil: "networkidle" });
  await degraded.getByText(/Read-only snapshot from/).waitFor();
  assert.ok(await degraded.locator(".story-card").count() > 0);
  await degraded.close();
  assert.deepEqual(errors, []);
  console.log("PASS: desktop/tablet/390px/320px layouts, no horizontal overflow or card overlap, issue/source navigation, delivery view, search and arbitrary-topic research entry. Screenshots use labelled fixture data.");
} finally { await browser.close(); }
