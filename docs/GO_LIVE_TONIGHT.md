# Politily Go Live Tonight

This is the simplest beginner path.

## What To Upload

Upload only the contents of this folder to GitHub:

- `app/`
- `db/`
- `docs/`
- `drizzle/`
- `public/`
- `worker/`
- `.env.example`
- `cloudflare-env.d.ts`
- `drizzle.config.ts`
- `eslint.config.mjs`
- `LICENSE`
- `next.config.ts`
- `package-lock.json`
- `package.json`
- `pnpm-workspace.yaml`
- `postcss.config.mjs`
- `README.md`
- `tsconfig.json`
- `vite.config.ts`

Do not upload:

- `.env`
- `node_modules/`
- `dist/`
- `.wrangler/`
- `.wrangler-config/`
- `.pnpm-store/`
- `dev-server*.log`
- `tsconfig.tsbuildinfo`

## Best Website To Host

Use Cloudflare Workers, not Netlify, as the main host.

Politily needs:

- a website dashboard,
- a 24 hour scheduled scanner,
- a database,
- private environment keys.

Cloudflare Workers + D1 handles all of that in one place.

## Accounts Needed

1. GitHub account
2. Cloudflare account
3. Google AI Studio account with Gemini API key
4. Resend account for email

## Production Environment Variables

Set these in Cloudflare Workers > Politily > Settings > Variables and secrets.
Use **Secret** for API keys and email values.

```txt
GEMINI_API_KEY=your_google_ai_studio_key
GEMINI_MODEL=gemini-3.5-flash
RESEND_API_KEY=your_resend_key
ALERT_EMAIL=your_inbox@example.com
ALERT_FROM_EMAIL=Politily <alerts@yourdomain.com>
APP_BASE_URL=https://your-worker-url.workers.dev
POLITILY_SCORE_THRESHOLD=72
POLITILY_ALERT_MIN_SCORE=85
POLITILY_MAX_DEEP_BRIEFS_PER_RUN=0
POLITILY_MAX_EMAIL_ALERTS_PER_RUN=5
POLITILY_MAX_SOURCES_PER_RUN=18
POLITILY_FETCH_TIMEOUT_MS=6500
POLITILY_MIN_STORY_DATE=2026-07-20T00:00:00+05:30
POLITILY_MAX_MEDIA_FETCHES_PER_RUN=6
```

## Database

Create one Cloudflare D1 database named:

```txt
politily-d1
```

Copy the database ID shown by Cloudflare.

In `vite.config.ts`, confirm this database ID is present:

```txt
43c380f8-2924-41a1-9bdb-707cba1c22fe
```

If you create a new D1 database later, replace that value with the new Cloudflare D1 database ID before uploading.

Bind it to the Worker using binding name:

```txt
DB
```

Run this migration on the remote D1 database:

```txt
drizzle/0000_steep_thor.sql
```

## Schedule

Use these cron triggers:

```txt
*/5 * * * *
30 6,15 * * *
```

The first cron scans every 5 minutes. The second sends scheduled digest emails at 12:00 PM and 9:00 PM IST.

Instant alert rule:

```txt
POLITILY_ALERT_MIN_SCORE=85
```

Any new or strengthened issue at 85/100 or higher can email immediately.

## Test URLs

After deployment:

```txt
https://your-worker-url.workers.dev/
https://your-worker-url.workers.dev/api/state
https://your-worker-url.workers.dev/api/test-email
```

Manual scan:

```txt
POST https://your-worker-url.workers.dev/api/scan
```

The dashboard has a Run scan button, so you usually do not need to call the API manually.
