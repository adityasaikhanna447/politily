import type { SignalSource } from "./types";

function gdeltUrl(query: string, maxrecords = 45) {
  const params = new URLSearchParams({
    query,
    mode: "artlist",
    format: "json",
    maxrecords: String(maxrecords),
    sort: "hybridrel",
  });

  return `https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`;
}

export const DEFAULT_SOURCES: SignalSource[] = [
  {
    id: "gdelt-global-politics",
    name: "GDELT Global Politics",
    type: "gdelt",
    url: gdeltUrl(
      "politics OR election OR parliament OR government OR protest OR constitution OR minister OR diplomacy"
    ),
    region: "global",
    category: "political signal",
    priority: 92,
    active: true,
  },
  {
    id: "gdelt-india-politics",
    name: "GDELT India Politics",
    type: "gdelt",
    url: gdeltUrl(
      'India (election OR parliament OR government OR BJP OR Congress OR "Aam Aadmi Party" OR policy OR protest OR court)'
    ),
    region: "india",
    category: "india politics",
    priority: 96,
    active: true,
  },
  {
    id: "gdelt-geopolitics",
    name: "GDELT Geopolitics",
    type: "gdelt",
    url: gdeltUrl(
      '"foreign minister" OR sanctions OR border OR treaty OR conflict OR diplomacy OR summit OR "international reaction"'
    ),
    region: "global",
    category: "geopolitics",
    priority: 88,
    active: true,
  },
  {
    id: "pm-india-feed",
    name: "Prime Minister of India",
    type: "official",
    url: "https://www.pmindia.gov.in/en/feed/",
    region: "india",
    category: "official",
    priority: 83,
    active: true,
  },
  {
    id: "pib-feed-slot",
    name: "PIB RSS Slot",
    type: "official",
    url: "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3",
    region: "india",
    category: "official",
    priority: 90,
    active: false,
  },
  {
    id: "party-press-slot",
    name: "Party Press Release Slot",
    type: "party",
    url: "https://example.com/replace-with-party-feed.xml",
    region: "india",
    category: "party",
    priority: 78,
    active: false,
  },
];
