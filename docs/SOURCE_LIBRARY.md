# Source Library Setup

Politily starts with a small source set and is designed to grow.

## Included Active Sources

- Fresh 24h India politics, protest/courts, party/election, and economy/policy sweeps
- Dedicated ANI National Politics direct RSS plus ANI Google News backup
- Direct newsroom RSS feeds from national portals
- Regional-language Hindi/regional search lanes
- Social/Viral early-chatter search lane
- Foreign Policy - India and Global Politics GDELT lanes
- Prime Minister of India RSS

## Included Paused Source Slots

- PIB RSS Slot
- Party Press Release Slot

The paused slots are intentional. Confirm the exact RSS or press-release URL before activating them, because government and party sites sometimes change feed paths.

## Recommended India Sources To Add

- PIB ministry releases
- Election Commission of India press notes
- Parliament bulletins
- Supreme Court cause lists and major judgments
- Ministry of External Affairs statements
- BJP press releases
- INC press releases
- AAP press releases
- Major state government press rooms
- YouTube RSS feeds for official party channels
- Hindi and regional-language portals such as Bhaskar, Amar Ujala, Jagran, Live Hindustan, Lokmat, Eenadu, Anandabazar, and Mathrubhumi
- Social/Viral leads from X, Reddit, and YouTube search/RSS-style lanes, treated only as early-warning signals

## Recommended Global Sources To Add

- UN press releases
- US State Department statements
- UK Parliament and government statements
- EU Council and Commission press releases
- Reuters, AP, AFP, BBC, Al Jazeera, DW, The Hindu, Indian Express, Hindustan Times, NDTV, Scroll, The Wire, and other credible sources where feeds are available

## Activation Flow

1. Add the source row to `DEFAULT_SOURCES` in `app/lib/source-library.ts`, or insert it into D1.
2. Set `active: true`.
3. Give high-trust official sources a priority from `80` to `100`.
4. Keep partisan or commentary-heavy sources lower unless you only want narrative monitoring.
5. Run a manual scan from the dashboard.

## Metadata Fields

Add these fields when you add a new source:

- `sourceLane`: `official`, `agency`, `portal`, `regional`, `social`, `factcheck`, or `research`
- `biasLean`: `left`, `center`, `right`, `state-owned`, `mixed`, or `unknown`
- `language`: English, Hindi, Regional, or the specific language
- `verificationMethod`: one sentence explaining how to verify this lane before scripting

## Verification Rule

Treat official records as primary, credible news reports as secondary, and social posts as leads until confirmed.

## ANI Integration Note

ANI is active as a high-priority agency wire because it often breaks or syndicates political stories quickly. Politily marks it as `sourceLane: agency` and `biasLean: right`, and the UI/email adds a wire-origin warning when ANI appears in the source trail. Do not count ANI plus portal reposts as separate independent proof; use them as early signal, then verify with a primary record and at least one non-wire report before scripting.
