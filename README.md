# Politily 3.5 — Hourly World Research Desk

India and world news, youth and public affairs, source trails, research briefs,
and hourly email editions from 8 AM through 11 PM IST.

Read [the upload and Cloudflare guide](docs/UPLOAD-GUIDE.md) before deploying.

## Build and deploy

Use Node 24 and pnpm 11.19.0.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run check
pnpm run build
pnpm exec wrangler deploy --config dist/server/wrangler.json
```

This is a server-backed Cloudflare Worker. The build generates its Worker bundle
and client assets. It is not a static HTML upload.

Keep the existing DB binding and production secrets. The schema update is additive.
This release fixes the compound SELECT failure by fetching citations in groups of five.

## Operating behaviour

- Small feed scans every five minutes, continuously: four rotating feeds and up to
  six processed reports per run. Feed revisit times are longer than five minutes.
- 16 hourly editions daily, 8 AM through 11 PM Asia/Kolkata inclusive. The next
  five-minute mail tick normally processes each edition at about :01 IST.
- Each edition covers newly captured reports and issue updates. The 8 AM edition
  includes overnight captures. A delayed scheduler sends the current slot without
  backfilling all missed hours. Automatic mail retries pause overnight.
- Durable email queue, retries and provider idempotency; acceptance is distinct
  from confirmed inbox delivery.
- Dashboard notifications refresh while the tab is visible; read status is saved
  in the browser. No background OS push service is included.
- Source trails, source-fetch health, evidence labels, saved research and JSON/CSV
  export. Research generation requires the configured Gemini provider.

Coverage includes politics, protests, youth/education, employment, technology and
corporate leadership, climate/environment and public health. Feed/index delays and
service limits apply; captured reports are not guaranteed exhaustive or independently
verified. Review original reporting, primary records and missing evidence before publishing.

## Verification

The source passed TypeScript checks, regression tests and a production build.
The dashboard was checked locally on desktop, tablet and mobile; all ten added feed
URLs returned usable reports during the release check. Real production cron execution,
Gemini access and email delivery must be verified after deployment using the guide.
