# Politily Architecture

Politily is a zero-budget-first political monitoring desk for one creator.

## Runtime

- Cloudflare-compatible Vinext app for the dashboard and API routes.
- Cloudflare Worker `scheduled()` handler for 24 hour monitoring.
- Cloudflare D1 for source registry, seen stories, scores, briefs, and scan runs.
- Gemini Interactions API for context briefs and creator scripts.
- Resend for email alerts.
- Cloudflare Worker scheduled handlers for 2-minute scanning and two daily table digest emails.

## Pipeline

1. Signal detection
   - Active sources are stored in D1.
  - Default live sources include GDELT India politics, freshness sweeps, national media RSS, regional-language search lanes, social/viral search lanes, and PM India RSS.
  - PIB and party press-release slots are seeded as paused examples until their final feed URLs are confirmed.

2. Story scoring
  - Each signal is normalized into an issue umbrella using alias cleanup, named entities, key actors, topic buckets, and high-signal token phrases.
  - New reports attach to an existing umbrella when the issue confidence score is high, so one national issue does not become ten separate newspaper cards.
  - Each umbrella also keeps a part/update label from the event/action layer: protest, court/legal turn, policy/bill, election, party move, investigation/revelation, diplomacy, security, economy, or social/viral signal. New revelations therefore become new parts inside the same issue instead of a separate unrelated card.
  - Novelty checks recent stored stories for title overlap.
  - Political weight checks institution, party, election, policy, court, and administration terms.
   - Geopolitical relevance separates India foreign-policy signals from wider global-politics signals.
  - Viral potential checks urgency, controversy, protest, court, corruption, and alliance terms.
   - Sentiment score estimates public mood and backlash risk.
   - Score breakdowns are stored so the dashboard can show why a story ranked.

3. Deep research
   - Stories above `POLITILY_SCORE_THRESHOLD` are eligible for Gemini.
   - The prompt asks for historical context, geographical context, key people, facts, source confidence, narratives, what happens next, and a creator script.
   - The creator script target is long-form: normally 2500-3400 words in Roman Hindi/Hinglish, with a question bank, thesis, timeline, escalation chain, named actor/institution background, data checkpoints, STEPPS packaging strategy, counter-view, unresolved proof, conclusion, and next-watch ending.
   - The prompt requires an original Politily voice rather than imitation of any living creator.

4. Alerting
   - Email alerts are sent only when `RESEND_API_KEY`, `ALERT_EMAIL`, and `ALERT_FROM_EMAIL` are configured.
   - `POLITILY_MAX_DEEP_BRIEFS_PER_RUN` keeps Gemini usage controlled.
   - Routine updates are grouped into midday and end-of-day topic-umbrella tables.
   - Instant emails are reserved for new or strengthened issue umbrellas scoring 85/100 or higher.

## Data Model

- `sources`: source registry with active/paused status, `bias_lean`, `verification_method`, `language`, and `source_lane`.
- `stories`: one row per detected story with scores, sentiment, score breakdown, verification method, and brief output.
- `story_sources`: supporting links for each story, including source lane, bias lean, and verification method.
- `scan_runs`: run history and error messages.

## 0 Budget Notes

True internet-wide instant detection is not free. This app aims for a practical 2 to 6 minute loop using open feeds, GDELT, official RSS, and party/agency press-release sources. More expensive real-time firehoses can be added later without changing the dashboard workflow.
