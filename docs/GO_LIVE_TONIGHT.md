# Politily Go Live Tonight

This is the simplest beginner path.

## What To Upload

Upload the whole Politily source folder to GitHub:

- `app/`
- `build/`
- `db/`
- `docs/`
- `drizzle/`
- `netlify/`
- `public/`
- `worker/`
- `.openai/`
- `.env.example`
- `cloudflare-env.d.ts`
- `drizzle.config.ts`
- `eslint.config.mjs`
- `LICENSE`
- `netlify.toml`
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

Set these in Cloudflare:

```txt
GEMINI_API_KEY=your_google_ai_studio_key
GEMINI_MODEL=gemini-3.5-flash
RESEND_API_KEY=your_resend_key
ALERT_EMAIL=your_inbox@example.com
ALERT_FROM_EMAIL=Politily <alerts@yourdomain.com>
APP_BASE_URL=https://your-worker-url.workers.dev
POLITILY_SCORE_THRESHOLD=72
POLITILY_MAX_DEEP_BRIEFS_PER_RUN=1
POLITILY_MAX_SOURCES_PER_RUN=8
POLITILY_FETCH_TIMEOUT_MS=10000
```

## Database

Create one Cloudflare D1 database named:

```txt
politily-d1
```

Copy the database ID shown by Cloudflare.

In `vite.config.ts`, replace this placeholder:

```txt
00000000-0000-4000-8000-000000000000
```

with your real Cloudflare D1 database ID. Commit/upload that change before deploying.

Bind it to the Worker using binding name:

```txt
DB
```

Run this migration on the remote D1 database:

```txt
drizzle/0000_steep_thor.sql
```

## Schedule

Use this cron trigger:

```txt
*/15 * * * *
```

That runs Politily every 15 minutes, all day and night.

## Test URLs

After deployment:

```txt
https://your-worker-url.workers.dev/
https://your-worker-url.workers.dev/api/state
```

Manual scan:

```txt
POST https://your-worker-url.workers.dev/api/scan
```

The dashboard has a Run scan button, so you usually do not need to call the API manually.
