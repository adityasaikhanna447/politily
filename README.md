# Politily

Politily is an open-source political signal detector and creator brief engine.

It watches open political sources, scores new stories, generates context-rich briefs with Gemini, and sends creator-ready email alerts for high-value stories.

## What It Does

- Monitors GDELT, official RSS feeds, national/regional portals, ANI/PTI-style agency wires, and social/viral early-signal lanes.
- Scores stories for novelty, political weight, India/global geopolitical relevance, viral potential, and public mood risk.
- Stores seen stories and scan history in Cloudflare D1.
- Uses Gemini to generate historical context, geographical context, facts, narratives, source confidence, and a long-form 2200-3000 word Roman Hindi/Hinglish creator script.
- Sends alert emails through Resend.
- Runs as a Cloudflare Workers app with D1 and scheduled cron.

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
POLITILY_MAX_DEEP_BRIEFS_PER_RUN=0
POLITILY_ALERT_MIN_SCORE=85
POLITILY_MAX_EMAIL_ALERTS_PER_RUN=4
POLITILY_MAX_SOURCES_PER_RUN=32
POLITILY_FETCH_TIMEOUT_MS=5000
POLITILY_MIN_STORY_DATE=2026-07-20T00:00:00+05:30
POLITILY_MAX_MEDIA_FETCHES_PER_RUN=10
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

## Email Rhythm

- Source scan: every 2 minutes.
- Scheduled digest: two table reports per day, 3:00 PM IST and 9:00 PM IST.
- Instant alerts: only new or strengthened issues scoring `85/100` or higher.
- Gemini tokens are not used for scanning or scheduled digests; they are used only when a deep brief/script is generated.

## License

MIT
