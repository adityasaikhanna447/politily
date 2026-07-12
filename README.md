# Politily

Politily is an open-source political signal detector and creator brief engine.

It watches open political sources, scores new stories, generates context-rich briefs with Gemini, and sends creator-ready email alerts for high-value stories.

## What It Does

- Monitors GDELT, official RSS feeds, and press-release sources.
- Scores stories for novelty, political weight, geopolitical relevance, and viral potential.
- Stores seen stories and scan history in Cloudflare D1.
- Uses Gemini to generate historical context, geographical context, facts, narratives, source confidence, and a video script.
- Sends alert emails through Resend.
- Runs as a Cloudflare-compatible app with an optional Netlify scheduled pinger.

## Quick Start

```bash
pnpm install --no-lockfile
pnpm rebuild
pnpm run dev
```

This workspace was created from a Cloudflare-compatible Vinext starter. If you use a normal Node installation with npm available, `npm ci` also works with the included `package-lock.json`.

## Environment

Copy `.env.example` and fill in the values:

```bash
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.5-flash
RESEND_API_KEY=
ALERT_EMAIL=
ALERT_FROM_EMAIL=
APP_BASE_URL=
POLITILY_SCORE_THRESHOLD=72
POLITILY_MAX_DEEP_BRIEFS_PER_RUN=1
```

Never commit `.env` files.

## Main Files

- `app/components/politily-dashboard.tsx`: dashboard UI
- `app/lib/monitor.ts`: scan orchestration
- `app/lib/scoring.ts`: story scoring engine
- `app/lib/gemini.ts`: Gemini Interactions API integration
- `app/lib/email.ts`: Resend alert delivery
- `app/lib/storage.ts`: D1 schema bootstrap and data access
- `worker/index.ts`: Worker fetch and scheduled handlers
- `docs/ARCHITECTURE.md`: system design
- `docs/SOURCE_LIBRARY.md`: source expansion guide
- `docs/DEPLOYMENT.md`: deployment path

## License

MIT
