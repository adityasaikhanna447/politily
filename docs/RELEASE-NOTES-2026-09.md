# Newsroom 3.3 Release Verification

## Replacement Database Connection

- Replaced the deleted D1 ID with 3d2c02a8-6529-4408-8c8d-4d5702251456 from
  the user's politily-d1 Overview screenshot. Binding name remains DB.
- Packaging refuses the known deleted ID or old placeholder constant.
- Updated beginner instructions for reconnecting and automatic table setup.
- Runtime release marker is newsroom-3.3-d1-binding; the schema is unchanged.
- No production deployment or old-data recovery is implied by this source update.

## Free Mode and Archive

- Free mode is now the default; no plan purchase is required for the reduced workload.
- Four rotating feeds/six reports per scan, with mail handled in a separate cron invocation.
- 45-query guard and staged initialization keep each invocation below the Free D1 query ceiling.
- Separate newsletter/alert processing; one new alert per mail tick, with bounded retries.
- Date-range JSON and CSV downloads, with keyset pagination across the captured archive.
- Exports include parent issues for captured source updates and preserve saved briefs/scripts.
- No automatic deletion or retention purge. Exports do not spend Gemini tokens.
- Beginner instructions replace the earlier Paid-oriented deployment guide.
- Free CPU headroom and sustained account usage still require post-deployment monitoring.

## Fixed

- Crawl priority previously contributed directly to political weight. Scoring v3
  separates relevance, public impact, freshness, novelty and attention cues.
- Removed legacy CJP/Bankipur preference from automatic ranking/trigger selection.
- Newsletter handling previously waited for the scan promise. Jobs now run independently.
- Durable email queue with immutable payloads, provider message IDs, bounded retries,
  idempotency keys, distributed claims and visible error messages.
- Digest slots are 14:00 and 21:00 IST. No duplicate cron is required.
- Added a five-pick daily priority target without falsely labelling all picks urgent.
- One source cannot consume the whole selected-feed budget. World/summit feeds added.
- XML parser handles RSS, Atom, CDATA and encoded descriptions. Full UTF-8 text supported.
- Generic bypoll/actor matches no longer automatically collapse unrelated issues.
- New dated reports can update an existing issue's lead headline and time, retaining citations.
- New desktop/mobile application layout, complete headlines, source links, evidence caveats,
  research/script tabs, DOCX, flexible search, recent/oldest/priority sorts and delivery logs.
- D1 indexes, bounded citation retrieval, bounded scan work, one-time source/schema setup,
  leases against overlapping scans, and a 60-second state cache.
- Best-effort edge snapshots with explicit stale/read-only state on D1 failures.
- Quota-aware 503 responses, Retry-After, browser backoff and an in-isolate DB circuit breaker.
- Actual D1 query/read/write telemetry, a per-operation read guard, scan pause control
  and a shared four-minute manual scan cooldown.
- A zero-query `/api/health` endpoint for diagnosing deployments while D1 is blocked.

## Local Checks

- TypeScript check: passed.
- Production build: passed.
- ESLint: no errors; an existing unused helper warning remains in the Gemini module.
- SQLite-backed tests cover additive initialization, source-link retention, date-range
  indexing, score independence from crawl priority, BRICS relevance, word boundaries,
  unrelated topic separation, RSS/Atom parsing and encoded text.
- Mock Resend tests cover provider 503, missing settings, persisted errors, retries,
  stable payload/idempotency keys, concurrent claims, duplicate digest suppression,
  two IST slots and five qualifying daily priority deliveries.
- Playwright checks at 1440x1000, 768x1024, 390x844 and 320x740: no horizontal overflow
  or overlapping story cards; search, source tabs, issue navigation and Delivery passed.
- Screenshots are labelled test fixtures, not evidence of live news coverage.
- A 10,000-citation fixture verifies bounded reads, index use and no history deletion.
- Tests cover cache sharing, concurrent refresh coalescing, stale labelling, cache expiry,
  quota cooldown, UTC reset boundaries, read-budget stopping and clean error states.

## Not Verified

- Production deployment and successful queries against the replacement D1 database,
  Resend credentials/domain restrictions,
  actual inbox delivery, live scheduled execution or sustained production D1 usage.
- Every upstream feed remaining accessible: publishers may return errors, block requests,
  change their feeds or delay indexing. Source health is displayed rather than hidden.
- The research model's factual accuracy. Scores, generated briefs and grouping still
  require editorial review. No promise of perfect coverage or guaranteed virality.

See DEPLOYMENT.md for production acceptance steps. This release was not pushed to
GitHub and was not deployed to Cloudflare during preparation.
