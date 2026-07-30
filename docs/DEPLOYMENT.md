# Deployment

## Recommended Platform

Cloudflare is the best fit for Politily because the same platform can host the dashboard, run Worker cron, and provide D1 storage.

This repository is now Cloudflare-only. Do not upload Netlify config or OpenAI Sites config for this deployment.

## Required Environment Variables

Copy `.env.example` and set these in local development and production:

- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `RESEND_API_KEY`
- `ALERT_EMAIL`
- `ALERT_FROM_EMAIL`
- `APP_BASE_URL`
- `POLITILY_SCORE_THRESHOLD`
- `POLITILY_ALERT_MIN_SCORE`
- `POLITILY_MAX_DEEP_BRIEFS_PER_RUN`
- `POLITILY_MAX_EMAIL_ALERTS_PER_RUN`
- `POLITILY_MAX_SOURCES_PER_RUN`
- `POLITILY_FETCH_TIMEOUT_MS`
- `POLITILY_MIN_STORY_DATE`
- `POLITILY_MAX_MEDIA_FETCHES_PER_RUN`

For Cloudflare production, set `GEMINI_API_KEY`, `RESEND_API_KEY`, `ALERT_EMAIL`, and `ALERT_FROM_EMAIL` as secrets in Workers > Settings > Variables and secrets. This keeps email settings stable across Git or Wrangler deploys without committing your personal inbox or sender domain.

## Cloudflare Runtime

The app exports a Worker `scheduled()` handler in `worker/index.ts`. Configure a cron trigger such as:

```txt
*/5 * * * *
```

That checks sources every 5 minutes. Scanning RSS/GDELT/open pages uses 0 Gemini tokens; Gemini is used only when a brief is generated.

For early-access free-tier scans, start with:

```txt
POLITILY_MAX_SOURCES_PER_RUN=18
POLITILY_FETCH_TIMEOUT_MS=6500
POLITILY_ALERT_MIN_SCORE=85
POLITILY_MAX_EMAIL_ALERTS_PER_RUN=3
POLITILY_MAX_DEEP_BRIEFS_PER_RUN=0
```

## Email Rhythm

- Scanner cron: `*/5 * * * *`
- Scheduled digest cron: `30 6,15 * * *`
- Digest timing in India: 12 PM and 9 PM IST
- Instant alerts: only issues at `POLITILY_ALERT_MIN_SCORE=85` or above
