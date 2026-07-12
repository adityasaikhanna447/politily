import type { SignalSource } from "./types";

function gdeltUrl(query: string, maxrecords = 20) {
  const params = new URLSearchParams({
    query,
    mode: "artlist",
    format: "json",
    maxrecords: String(maxrecords),
    sort: "datedesc",
  });

  return `https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`;
}

const indiaCoreTerms =
  'India OR Indian OR Delhi OR "Lok Sabha" OR "Rajya Sabha" OR parliament OR election OR BJP OR Congress OR AAP OR TMC OR DMK OR CPI OR "Samajwadi Party" OR "Shiv Sena" OR NCP';

export const DEFAULT_SOURCES: SignalSource[] = [
  {
    id: "gdelt-india-war-room",
    name: "India Political War Room",
    type: "gdelt",
    url: gdeltUrl(
      `${indiaCoreTerms} (government OR election OR parliament OR court OR policy OR protest OR party OR minister OR cabinet OR governor OR censorship OR ban OR propaganda)`
    ),
    region: "india",
    category: "Live monitor / India politics",
    priority: 98,
    active: true,
  },
  {
    id: "gdelt-india-agencies-national-media",
    name: "Agencies + National Media Sweep",
    type: "gdelt",
    url: gdeltUrl(
      `${indiaCoreTerms} (PTI OR ANI OR Reuters OR "Associated Press" OR BBC OR "The Hindu" OR "Indian Express" OR NDTV OR "Hindustan Times" OR "Times of India" OR Scroll OR "The Wire")`
    ),
    region: "india/global",
    category: "Agency and media triangulation",
    priority: 94,
    active: true,
  },
  {
    id: "gdelt-news-agencies-india",
    name: "PTI, ANI, Reuters, AP Watch",
    type: "gdelt",
    url: gdeltUrl(
      `${indiaCoreTerms} (PTI OR ANI OR Reuters OR "Associated Press" OR "Press Trust of India")`
    ),
    region: "india/global",
    category: "Agency wire verification",
    priority: 95,
    active: true,
  },
  {
    id: "gdelt-international-india-politics",
    name: "International Press on India",
    type: "gdelt",
    url: gdeltUrl(
      `${indiaCoreTerms} (BBC OR Reuters OR "Associated Press" OR "Al Jazeera" OR "The Guardian" OR "Financial Times" OR "New York Times" OR "Washington Post" OR "The Diplomat")`
    ),
    region: "global",
    category: "International reaction",
    priority: 87,
    active: true,
  },
  {
    id: "gdelt-official-institutions",
    name: "Official Institutions Watch",
    type: "gdelt",
    url: gdeltUrl(
      '"Election Commission of India" OR "Supreme Court of India" OR "Ministry of External Affairs" OR "Press Information Bureau" OR "Cabinet Committee" OR "President of India" OR "Parliament of India" OR "Law Commission of India"'
    ),
    region: "india",
    category: "Primary institutional trail",
    priority: 96,
    active: true,
  },
  {
    id: "gdelt-party-politics",
    name: "Party Specific Political Signals",
    type: "gdelt",
    url: gdeltUrl(
      '"Bharatiya Janata Party" OR BJP OR "Indian National Congress" OR Congress OR "Aam Aadmi Party" OR AAP OR "Trinamool Congress" OR TMC OR DMK OR AIADMK OR "Samajwadi Party" OR RJD OR JDU OR "Shiv Sena" OR NCP OR "CPI(M)" OR "Bahujan Samaj Party"'
    ),
    region: "india",
    category: "Party statements and conflict",
    priority: 91,
    active: true,
  },
  {
    id: "gdelt-regional-politics",
    name: "Regional Politics + State Tensions",
    type: "gdelt",
    url: gdeltUrl(
      'Punjab OR Haryana OR Kashmir OR Manipur OR Assam OR Bengal OR Tamil Nadu OR Kerala OR Maharashtra OR Bihar OR Uttar Pradesh OR Karnataka OR Telangana OR Andhra OR "state government" OR "chief minister" OR "high court"'
    ),
    region: "india/states",
    category: "Regional context",
    priority: 90,
    active: true,
  },
  {
    id: "gdelt-legal-rights-censorship",
    name: "Courts, Rights, Censorship",
    type: "gdelt",
    url: gdeltUrl(
      'India ("Supreme Court" OR "High Court" OR CBFC OR censorship OR ban OR sedition OR UAPA OR defamation OR "free speech" OR "fundamental rights" OR "public order")'
    ),
    region: "india",
    category: "Legal and rights context",
    priority: 93,
    active: true,
  },
  {
    id: "gdelt-film-censorship-public-order",
    name: "Film, Culture, Censorship, Public Order",
    type: "gdelt",
    url: gdeltUrl(
      'India (CBFC OR film OR cinema OR documentary OR censorship OR "public order" OR ban OR takedown OR propaganda OR Punjab OR Kashmir OR religion OR community)'
    ),
    region: "india",
    category: "Culture war / censorship context",
    priority: 90,
    active: true,
  },
  {
    id: "gdelt-geopolitics",
    name: "Geopolitics + International Reaction",
    type: "gdelt",
    url: gdeltUrl(
      '"foreign minister" OR sanctions OR border OR treaty OR conflict OR diplomacy OR summit OR "international reaction" OR "United Nations" OR G7 OR BRICS OR "Global South"'
    ),
    region: "global",
    category: "Geopolitics",
    priority: 88,
    active: true,
  },
  {
    id: "gdelt-fact-checks",
    name: "Fact Check + Misinformation Watch",
    type: "gdelt",
    url: gdeltUrl(
      'India (misinformation OR disinformation OR fake OR hoax OR "fact check" OR "PIB Fact Check" OR "Alt News" OR BOOM OR Factly)'
    ),
    region: "india",
    category: "Fact-check layer",
    priority: 86,
    active: true,
  },
  {
    id: "pm-india-feed",
    name: "Prime Minister of India",
    type: "official",
    url: "https://www.pmindia.gov.in/en/feed/",
    region: "india",
    category: "Primary / executive",
    priority: 85,
    active: true,
  },
  {
    id: "pib-feed-national",
    name: "PIB National RSS",
    type: "official",
    url: "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3",
    region: "india",
    category: "Primary / government releases",
    priority: 92,
    active: true,
  },
  {
    id: "mea-press-releases",
    name: "MEA Press Releases",
    type: "html",
    url: "https://www.mea.gov.in/press-releases.htm",
    region: "india/global",
    category: "Primary / foreign affairs",
    priority: 89,
    active: true,
  },
  {
    id: "prs-parliament-watch",
    name: "PRS Parliament Watch",
    type: "html",
    url: "https://prsindia.org/billtrack",
    region: "india",
    category: "Research / parliament",
    priority: 82,
    active: true,
  },
  {
    id: "sci-latest-updates",
    name: "Supreme Court Latest Updates",
    type: "html",
    url: "https://www.sci.gov.in/latest-updates/",
    region: "india",
    category: "Primary / judiciary",
    priority: 84,
    active: true,
  },
  {
    id: "party-press-slot",
    name: "Party Press Release Slot",
    type: "party",
    url: "https://example.com/replace-with-party-feed.xml",
    region: "india",
    category: "Party / custom feed needed",
    priority: 70,
    active: false,
  },
];
