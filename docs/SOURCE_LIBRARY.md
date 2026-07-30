# Source Library Setup

Politily starts with a small source set and is designed to grow.

## Included Active Sources

- GDELT Global Politics
- GDELT India Politics
- GDELT Geopolitics
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

## Verification Rule

Treat official records as primary, credible news reports as secondary, and social posts as leads until confirmed.
