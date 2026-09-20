# Politily Newsroom 3.2 - Free Mode + Data Export

An India-and-world research desk on Cloudflare Workers and D1. Text-first issue cards,
source trails, research briefs, Roman Hindi scripts and Resend newsletters.

## Start

Use Node 22.13+ (tested on Node 24.19) and pnpm 11.19.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run check
pnpm run build
pnpm run dev
```

This release uses `pnpm-lock.yaml`, not the old npm lockfile. Do not run `npm ci`.

## Operating Logic

- Scan every five minutes in small batches: four rotating feeds and at most six
  reports per run. Mail is processed in a separate cron invocation one minute later.
  Individual feeds are not all checked every five minutes; coverage is slower in Free mode.
- BRICS/G20/summits have a dedicated discovery feed. BBC and Al Jazeera world RSS
  complement ANI and other agency/portal feeds. Failed feeds are visible in Sources.
- Group reports by issue context, actors, event and lexical overlap, within a
  seven-day matching window. Actor names or a generic word alone are insufficient.
  This is deterministic grouping, not a guarantee of perfect semantic clustering.
- Show the latest dated report as the issue lead and retain earlier citations.
  The dashboard displays up to 160 recently detected records, grouped into issues.
  Each stored issue loads at most 25 recent citations, with a visible truncation notice.
  Research may retrieve up to 100 citations; older stored links are not deleted.
- V3 priority: relevance 30%, public impact 25%, freshness 20%, novelty 10%,
  attention cues 15%. Crawl priority never becomes political importance.
  Scores are editorial heuristics, not truth scores, measured sentiment or predicted views.
- Urgent alerts at 82+. Up to five qualifying priority picks per day, paced at
  10 AM, noon, 2 PM, 5 PM and 8 PM IST. Lower-scoring picks are labelled priority,
  not urgent. The floor is 60, reporting must be less than 24 hours old, and there
  can be fewer than five on a quiet or broken-coverage day.
- Duplicate alert suppression uses issue + IST day + event type. A changed event
  on an existing emailed issue needs a new report and at least six hours since its last alert.
- Newsletters at **2 PM and 9 PM IST**. Each is a day-to-slot topic-grouped table,
  with headlines, excerpts, source links and saved analysis where available.
  The email shows up to 60 issues from the queried stored reports; it is not
  exhaustive world coverage or automatically generated deep research on every item.
- Mail scheduling runs independently from ingestion. A persistent outbox records
  each attempt, retries failures and supplies Resend idempotency keys. Retries expire
  within 23 hours or after eight attempts. Check Resend before manually resending an
  ambiguous expired job. Accepted by Resend does not mean delivered to the inbox.
- RSS scanning and newsletter assembly make no Gemini calls. User-triggered research
  uses Gemini and records returned token usage on the brief.

## Upload

Beginner instructions: [START-HERE-BEGINNER.md](docs/START-HERE-BEGINNER.md).

In Delivery, choose dates and download up to 31 days as JSON (issues, source reports,
source catalog, saved briefs/scripts) or CSV (issues/briefs for a spreadsheet).
Exports are paginated, not restricted to the 160 dashboard records. Existing data is
not automatically deleted. Download each month; retention remains subject to D1's
storage allowance. Exported archives exclude API secrets and email payloads.

Read [deployment instructions](docs/DEPLOYMENT.md) before uploading. This is a Worker
application, not a static HTML site. Upload the release source to the existing GitHub
repository, build it, and deploy the generated Worker bundle plus client assets.
Do not replace the existing D1 database. Secrets stay in Cloudflare, not Git.

## Main Files

- `app/components/politily-dashboard.tsx`, `app/globals.css`: application UI.
- `app/lib/scoring.ts`: transparent editorial priority.
- `app/lib/issues.ts`, `app/lib/grouping.ts`: topic grouping and source trails.
- `app/lib/monitor.ts`, `app/lib/source-library.ts`: ingestion and coverage.
- `app/lib/delivery.ts`, `app/lib/scheduler.ts`, `app/lib/email.ts`: outbox, schedule, newsletter.
- `app/lib/storage.ts`: additive schema setup, indexes and storage.
- `app/lib/database-protection.ts`, `app/lib/state-cache.ts`: read telemetry, quota backoff and cached snapshots.
- `app/api/health/route.ts`: configuration diagnostics without querying D1.
- `app/lib/gemini.ts`: research generation, not headline ingestion.
- `worker/index.ts`, `vite.config.ts`: production entry and deployment bindings.

## Limits

No RSS tool guarantees first access to all news. Publishers and discovery indexes
can lag; licensed wire/social APIs can be necessary for lower latency. D1 quota
exhaustion blocks the app and mail queue until Cloudflare restores service. Indexes,
bounded scans and caching reduce waste but do not replace usage monitoring.
This release defaults to Free mode, with a 45-query per-invocation safety guard,
incremental database setup and reduced ingestion. It does not require buying a plan.
Free limits still apply to CPU, storage and total account reads/writes; no promise of
unlimited or instant coverage is made. Read [Cloudflare recovery](docs/CLOUDFLARE-RECOVERY.md).
Secure the portal with Cloudflare Access before exposing research/email actions.
