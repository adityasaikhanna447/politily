import type { SignalSource } from "./types";

function gdeltUrl(query: string, maxrecords = 8, timespan = "7d") {
  const params = new URLSearchParams({
    query,
    mode: "artlist",
    format: "json",
    maxrecords: String(maxrecords),
    sort: "datedesc",
    timespan,
  });

  return `https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`;
}

function googleNewsRss(query: string) {
  const params = new URLSearchParams({
    q: query,
    hl: "en-IN",
    gl: "IN",
    ceid: "IN:en",
  });

  return `https://news.google.com/rss/search?${params.toString()}`;
}

const indiaCoreTerms =
  'India OR Indian OR Delhi OR "Lok Sabha" OR "Rajya Sabha" OR parliament OR election OR BJP OR Congress OR AAP OR TMC OR DMK OR CPI OR "Samajwadi Party" OR "Shiv Sena" OR NCP';

export const DEFAULT_SOURCES: SignalSource[] = [
  {
    id: "google-news-cjp-protest",
    name: "CJP Protest / Sansad Chalo Watch",
    type: "rss",
    url: googleNewsRss(
      '"CJP protest" OR "Cockroach Janta Party" OR "Chalo Sansad" OR "Sansad Chalo" OR "Sonam Wangchuk" OR "education minister resignation"'
    ),
    region: "india/delhi",
    category: "Hot topic / youth protest",
    priority: 100,
    active: true,
  },
  {
    id: "gdelt-cjp-protest",
    name: "GDELT CJP Protest Monitor",
    type: "gdelt",
    url: gdeltUrl(
      'India ("CJP protest" OR "Cockroach Janta Party" OR "Chalo Sansad" OR "Sansad Chalo" OR "Jantar Mantar" OR "Sonam Wangchuk")',
      10,
      "14d"
    ),
    region: "india",
    category: "Hot topic / protest triangulation",
    priority: 100,
    active: true,
  },
  {
    id: "google-news-bankipur-bypoll",
    name: "Bankipur Bypoll / BJP Watch",
    type: "rss",
    url: googleNewsRss(
      '"Bankipur bypoll" OR "Bankipur by-election" OR "Bankipur byelection" OR "Bankipur Assembly" BJP OR "Prashant Kishor" OR "Jan Suraaj"'
    ),
    region: "india/bihar",
    category: "Hot topic / bypoll",
    priority: 100,
    active: true,
  },
  {
    id: "gdelt-bankipur-bypoll",
    name: "GDELT Bankipur Bypoll Monitor",
    type: "gdelt",
    url: gdeltUrl(
      'Bankipur (bypoll OR "by-election" OR byelection OR "Assembly seat" OR BJP OR "Prashant Kishor" OR "Jan Suraaj" OR RJD)',
      10,
      "30d"
    ),
    region: "india/bihar",
    category: "Hot topic / bypoll triangulation",
    priority: 99,
    active: true,
  },
  {
    id: "google-news-bjp-national",
    name: "BJP National Political News",
    type: "rss",
    url: googleNewsRss(
      'BJP politics India parliament election protest court policy opposition'
    ),
    region: "india",
    category: "Party statements and conflict",
    priority: 96,
    active: true,
  },
  {
    id: "google-news-bbc-india-politics",
    name: "BBC India Politics",
    type: "rss",
    url: googleNewsRss(
      'site:bbc.com/news India politics BJP election protest parliament court policy'
    ),
    region: "india/global",
    category: "International newsroom triangulation",
    priority: 97,
    active: true,
  },
  {
    id: "google-news-aljazeera-india-politics",
    name: "Al Jazeera India Politics",
    type: "rss",
    url: googleNewsRss(
      'site:aljazeera.com India politics BJP election protest Kashmir parliament court'
    ),
    region: "india/global",
    category: "International newsroom triangulation",
    priority: 96,
    active: true,
  },
  {
    id: "google-news-toi-politics",
    name: "Times of India Politics",
    type: "rss",
    url: googleNewsRss(
      'site:timesofindia.indiatimes.com India politics BJP election protest bypoll parliament'
    ),
    region: "india",
    category: "National newsroom triangulation",
    priority: 96,
    active: true,
  },
  {
    id: "google-news-economic-times-politics",
    name: "Economic Times Politics",
    type: "rss",
    url: googleNewsRss(
      'site:economictimes.indiatimes.com/news/politics-and-nation BJP election protest policy parliament India'
    ),
    region: "india",
    category: "National newsroom triangulation",
    priority: 95,
    active: true,
  },
  {
    id: "google-news-india-today-aajtak-network",
    name: "India Today / Aaj Tak Network",
    type: "rss",
    url: googleNewsRss(
      '(site:indiatoday.in OR site:aajtak.in) India politics BJP election protest parliament bypoll'
    ),
    region: "india",
    category: "National newsroom triangulation",
    priority: 95,
    active: true,
  },
  {
    id: "google-news-pti-uni-wire",
    name: "PTI / UNI Wire Mentions",
    type: "rss",
    url: googleNewsRss(
      '(PTI OR "Press Trust of India" OR UNI OR "United News of India") India politics BJP election protest parliament court'
    ),
    region: "india",
    category: "Agency wire verification",
    priority: 95,
    active: true,
  },
  {
    id: "google-news-hindu-indian-express",
    name: "The Hindu / Indian Express Politics",
    type: "rss",
    url: googleNewsRss(
      '(site:thehindu.com OR site:indianexpress.com) India politics BJP election protest parliament court policy'
    ),
    region: "india",
    category: "National newsroom triangulation",
    priority: 94,
    active: true,
  },
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
      `${indiaCoreTerms} (PTI OR UNI OR ANI OR Reuters OR "Associated Press" OR BBC OR "Al Jazeera" OR "The Hindu" OR "Indian Express" OR NDTV OR "Hindustan Times" OR "Times of India" OR "Economic Times" OR "Aaj Tak" OR "India Today" OR Scroll OR "The Wire")`
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
      `${indiaCoreTerms} (PTI OR UNI OR ANI OR Reuters OR "Associated Press" OR "Press Trust of India" OR "United News of India")`
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
    id: "gdelt-election-watch-india",
    name: "Election Strategy + Voter Mood",
    type: "gdelt",
    url: gdeltUrl(
      'India (election OR campaign OR alliance OR manifesto OR voter OR EVM OR "Election Commission" OR constituency OR candidate OR "model code")'
    ),
    region: "india",
    category: "Election watch",
    priority: 95,
    active: true,
  },
  {
    id: "gdelt-parliament-policy-watch",
    name: "Parliament, Bills, Policy Impact",
    type: "gdelt",
    url: gdeltUrl(
      'India (Parliament OR "Lok Sabha" OR "Rajya Sabha" OR bill OR ordinance OR policy OR regulation OR committee OR "standing committee")'
    ),
    region: "india",
    category: "Parliament and policy",
    priority: 92,
    active: true,
  },
  {
    id: "gdelt-punjab-culture-censorship",
    name: "Punjab, Culture, Film Ban Context",
    type: "gdelt",
    url: gdeltUrl(
      'Punjab OR Sikh OR CBFC OR "film ban" OR censorship OR "public order" OR "Diljit" OR "Ghallughara" OR Satluj OR Khalistan OR diaspora'
    ),
    region: "india/punjab",
    category: "Punjab and cultural politics",
    priority: 90,
    active: true,
  },
  {
    id: "gdelt-national-newsrooms",
    name: "National Newsroom Triangulation",
    type: "gdelt",
    url: gdeltUrl(
      'India ("The Hindu" OR "Indian Express" OR "Hindustan Times" OR NDTV OR "Times of India" OR "Economic Times" OR "The Print" OR Scroll OR "The Wire" OR "India Today") politics'
    ),
    region: "india",
    category: "National media triangulation",
    priority: 88,
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
