# Politily Architecture

Politily is a zero-budget-first political monitoring desk for one creator.

## Runtime

- Cloudflare-compatible Vinext app for the dashboard and API routes.
- Cloudflare Worker `scheduled()` handler for 24 hour monitoring.
- Cloudflare D1 for source registry, seen stories, scores, briefs, and scan runs.
- Gemini Interactions API for context briefs and creator scripts.
- Resend for email alerts.
- Optional Netlify scheduled function as a fallback cron pinger.

## Pipeline

1. Signal detection
   - Active sources are stored in D1.
   - Default live sources include GDELT global politics, GDELT India politics, GDELT geopolitics, and PM India RSS.
   - PIB and party press-release slots are seeded as paused examples until their final feed URLs are confirmed.

2. Story scoring
   - Novelty checks recent stored stories for title overlap.
   - Political weight checks institution, party, election, policy, court, and administration terms.
   - Geopolitical relevance checks diplomacy, border, conflict, treaty, sanction, and country terms.
   - Viral potential checks urgency, controversy, protest, court, corruption, and alliance terms.

3. Deep research
   - Stories above `POLITILY_SCORE_THRESHOLD` are eligible for Gemini.
   - The prompt asks for historical context, geographical context, key people, facts, source confidence, narratives, what happens next, and a creator script.
   - The prompt requires an original Politily voice rather than imitation of any living creator.

4. Alerting
   - Email alerts are sent only when `RESEND_API_KEY`, `ALERT_EMAIL`, and `ALERT_FROM_EMAIL` are configured.
   - `POLITILY_MAX_DEEP_BRIEFS_PER_RUN` keeps Gemini usage controlled.

## Data Model

- `sources`: source registry and active/paused status.
- `stories`: one row per detected story with scores and brief output.
- `story_sources`: supporting links for each story.
- `scan_runs`: run history and error messages.

## 0 Budget Notes

True internet-wide instant detection is not free. This app aims for a practical 5 to 15 minute loop using open feeds, GDELT, official RSS, and party/agency press-release sources. More expensive real-time firehoses can be added later without changing the dashboard workflow.
