# Deploy Politily 3.2 Free Mode

Follow [START-HERE-BEGINNER.md](START-HERE-BEGINNER.md) for the step-by-step process.
This guide supersedes the Paid-oriented instructions in releases 3.0 and 3.1.

## Technical Checklist

- Preserve the existing D1 database; confirm its ID in vite.config.ts before deployment.
- Node 24, pnpm 11.19.0; install with pnpm-lock.yaml. Remove obsolete package-lock.json.
- Build: `pnpm install --frozen-lockfile && pnpm run build`
- Deploy: `pnpm exec wrangler deploy --config dist/server/wrangler.json`
- Keep GEMINI_API_KEY and RESEND_API_KEY as Worker secrets, never in Git.
- Free mode is enabled in config. Ingestion: four rotating feeds, six reports maximum,
  no automatic Gemini research and no inline scan emails/media enrichment.
- Two separate cron invocations: `*/5 * * * *` for scans, `1-59/5 * * * *` for mail.
- Digests due 14:00 / 21:00 Asia/Kolkata, processed on the next mail tick.
- Setup progresses in small idempotent stages. DATABASE_SETUP is retryable, not data loss.
- Query cap: 45 per protected invocation. Read guard: 8,000 actual rows per operation,
  stopping subsequent queries after the limit. Neither is an account-wide daily quota.
- /api/health reports newsroom-3.2-free-archive; presence checks do not prove delivery.
- /api/archive supports paginated 31-day captured-data exports. No automatic purge.

Run `pnpm test`, `pnpm run check` and `pnpm run build` before deploying.
In Delivery test one email and newsletter, then verify actual delivery in Resend.
In Cloudflare D1 Metrics inspect reads/writes/storage; in Worker logs filter
politily_d1_usage for actual per-operation query/read/write metadata.

Browser/server tests do not establish real Cloudflare Free CPU headroom or sustained
account-wide usage. Observe those after deployment. Upstream feeds may lag or fail.
