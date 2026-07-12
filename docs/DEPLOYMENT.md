# Deployment

## Recommended Platform

Cloudflare is the best fit for Politily because the same platform can host the dashboard, run Worker cron, and provide D1 storage.

Netlify can still help as a scheduled pinger, but it is not the best primary backend for this app because Politily needs durable state and frequent background scans.

## Required Environment Variables

Copy `.env.example` and set these in local development and production:

- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `RESEND_API_KEY`
- `ALERT_EMAIL`
- `ALERT_FROM_EMAIL`
- `APP_BASE_URL`
- `POLITILY_SCORE_THRESHOLD`
- `POLITILY_MAX_DEEP_BRIEFS_PER_RUN`
- `POLITILY_MAX_SOURCES_PER_RUN`
- `POLITILY_FETCH_TIMEOUT_MS`

## Cloudflare Runtime

The app exports a Worker `scheduled()` handler in `worker/index.ts`. Configure a cron trigger such as:

```txt
*/15 * * * *
```

That checks sources every 15 minutes. Use a lower frequency only if your free-tier limits and Gemini budget can handle it.

For stable free-tier scans, start with:

```txt
POLITILY_MAX_SOURCES_PER_RUN=8
POLITILY_FETCH_TIMEOUT_MS=10000
```

## Netlify Fallback Cron

The file `netlify/functions/politily-monitor.mjs` can call a deployed Politily scan URL every 15 minutes.

Set these Netlify environment variables:

- `POLITILY_SCAN_URL`
- `POLITILY_SCAN_TOKEN` if you later add token protection

This fallback is useful if the dashboard is hosted elsewhere and you still want Netlify to wake the scan endpoint.
