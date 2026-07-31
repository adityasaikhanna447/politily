import type { RawSignal, StoryScores, StoredStory } from "./types";

const politicalTerms = [
  "election",
  "vote",
  "parliament",
  "assembly",
  "government",
  "minister",
  "cabinet",
  "policy",
  "bill",
  "court",
  "constitution",
  "party",
  "campaign",
  "bypoll",
  "by-election",
  "byelection",
  "coalition",
  "opposition",
  "administration",
  "governor",
  "president",
  "prime minister",
  "chief minister",
  "lok sabha",
  "rajya sabha",
  "censorship",
  "public order",
  "cbfc",
  "cjp",
  "cockroach janta party",
  "sansad chalo",
  "chalo sansad",
  "neet",
  "paper leak",
  "student protest",
  "bankipur",
  "rights",
  "commission",
  "bjp",
  "congress",
  "aap",
  "dmk",
  "tmc",
  "sp",
  "rjd",
  "jdu",
  "india bloc",
  "unemployment",
  "inflation",
  "budget",
  "welfare",
  "scheme",
];

const geopoliticalTerms = [
  "border",
  "sanction",
  "summit",
  "treaty",
  "war",
  "conflict",
  "ceasefire",
  "diplomacy",
  "foreign",
  "embassy",
  "security council",
  "china",
  "pakistan",
  "russia",
  "ukraine",
  "united states",
  "eu",
  "g7",
  "brics",
  "global south",
];

const indiaForeignPolicyTerms = [
  "china",
  "pakistan",
  "united states",
  "us",
  "border",
  "lac",
  "loc",
  "mea",
  "jaishankar",
  "foreign minister",
  "diplomacy",
  "treaty",
  "bilateral",
  "strategic",
  "defence",
];

const viralTerms = [
  "resigns",
  "resign",
  "arrest",
  "raid",
  "protest",
  "march",
  "lathi charge",
  "tear gas",
  "students",
  "student",
  "youth",
  "paper leak",
  "violence",
  "ban",
  "leak",
  "scandal",
  "controversy",
  "supreme court",
  "breaking",
  "exclusive",
  "clash",
  "collapse",
  "defection",
  "alliance",
  "bypoll",
  "by-election",
  "bankipur",
  "chalo sansad",
  "sansad chalo",
  "cjp",
  "cockroach janta party",
  "jantar mantar",
  "neet",
  "education minister",
  "detention",
  "detained",
  "police",
  "jan suraaj",
  "prashant kishor",
  "prestige battle",
  "home turf",
  "caste",
  "communal",
  "corruption",
  "censorship",
  "public order",
  "film ban",
  "takedown",
  "misinformation",
  "disinformation",
  "backlash",
  "boycott",
  "trend",
  "viral",
  "x post",
  "reddit",
  "youtube",
];

const sentimentRiskTerms = [
  "anger",
  "angry",
  "outrage",
  "backlash",
  "protest",
  "clash",
  "violence",
  "arrest",
  "detained",
  "lathi charge",
  "tear gas",
  "ban",
  "censorship",
  "corruption",
  "scandal",
  "paper leak",
  "unemployment",
  "inflation",
  "communal",
  "caste",
  "rights",
  "boycott",
];

export function fingerprintFor(signal: Pick<RawSignal, "title" | "url" | "sourceName">) {
  const basis = `${normalise(signal.title)}|${normalise(signal.url)}|${normalise(
    signal.sourceName
  )}`;
  return hashText(basis);
}

export function scoreSignal(signal: RawSignal, recentStories: StoredStory[]): StoryScores {
  const text = `${signal.title} ${signal.summary}`.toLowerCase();
  const maxSimilarity = recentStories.reduce(
    (max, story) => Math.max(max, titleSimilarity(signal.title, story.title)),
    0
  );
  const noveltyScore = clamp(Math.round(100 - maxSimilarity * 92));
  const politicalHits = matchedTerms(text, politicalTerms);
  const geopoliticalHits = matchedTerms(text, geopoliticalTerms);
  const indiaForeignHits = matchedTerms(text, indiaForeignPolicyTerms);
  const viralHits = matchedTerms(text, viralTerms);
  const sentimentHits = matchedTerms(text, sentimentRiskTerms);
  const velocity = velocityBoost(signal.publishedAt);
  const politicalWeight = clamp(scoreKeywordSetFromHits(politicalHits.length, signal.sourcePriority));
  const geopoliticalRelevance = clamp(scoreKeywordSetFromHits(geopoliticalHits.length + indiaForeignHits.length, 28));
  const viralPotential = clamp(scoreKeywordSetFromHits(viralHits.length, 24) + headlineTension(signal.title) + velocity);
  const sentimentScore = clamp(36 + sentimentHits.length * 10 + Math.round(viralPotential * 0.18) + velocity);
  const hotTopicBoost = hotTopicSignalBoost(text);
  const tags = inferTags(text);

  const totalScore = clamp(
    Math.round(
      noveltyScore * 0.24 +
        politicalWeight * 0.31 +
        geopoliticalRelevance * 0.2 +
        viralPotential * 0.25 +
        hotTopicBoost
    )
  );
  const scoringBreakdown = {
    noveltySignals: [
      maxSimilarity > 0.7
        ? "Similar issue already seen recently"
        : maxSimilarity > 0.35
          ? "Partial overlap with a recent issue"
          : "Fresh headline against recent stored issues",
    ],
    politicalSignals: politicalHits.slice(0, 10),
    geopoliticalSignals: uniqueStrings([...indiaForeignHits, ...geopoliticalHits]).slice(0, 10),
    viralSignals: viralHits.slice(0, 10),
    sentimentSignals: sentimentHits.slice(0, 10),
    velocitySignal: velocity
      ? `Freshness boost ${velocity}: source timestamp is recent or breaking`
      : "No freshness boost from timestamp",
    sourceSignal: `Source priority ${signal.sourcePriority}; lane ${signal.sourceLane ?? "portal"}; bias ${signal.biasLean ?? "unknown"}`,
    formula: "total = novelty 24% + political 31% + geo 20% + viral 25% + hot-topic boost",
  };

  return {
    noveltyScore,
    politicalWeight,
    geopoliticalRelevance,
    viralPotential,
    sentimentScore,
    totalScore,
    tags,
    scoringBreakdown,
  };
}

export function titleSimilarity(a: string, b: string) {
  const left = new Set(tokenise(a));
  const right = new Set(tokenise(b));
  if (left.size === 0 || right.size === 0) {
    return 0;
  }

  let shared = 0;
  left.forEach((token) => {
    if (right.has(token)) {
      shared += 1;
    }
  });

  return shared / Math.max(left.size, right.size);
}

function matchedTerms(text: string, terms: string[]) {
  return terms.filter((term) => text.includes(term));
}

function scoreKeywordSetFromHits(hits: number, base: number) {
  return Math.min(100, base + hits * 12);
}

function velocityBoost(publishedAt?: string | null) {
  if (!publishedAt) {
    return 0;
  }

  const ageMs = Date.now() - Date.parse(publishedAt);
  if (!Number.isFinite(ageMs) || ageMs < 0) {
    return 0;
  }

  const hours = ageMs / (1000 * 60 * 60);
  if (hours <= 2) return 12;
  if (hours <= 6) return 8;
  if (hours <= 24) return 4;
  return 0;
}

function headlineTension(title: string) {
  const words = title.split(/\s+/).filter(Boolean).length;
  const hasQuestion = title.includes("?") ? 8 : 0;
  const hasNumbers = /\d/.test(title) ? 8 : 0;
  const lengthFit = words >= 6 && words <= 16 ? 12 : 4;
  return hasQuestion + hasNumbers + lengthFit;
}

function inferTags(text: string) {
  const tags = new Set<string>();
  const checks: Array<[string, string[]]> = [
    ["india", ["india", "delhi", "lok sabha", "rajya sabha", "bjp", "congress"]],
    ["election", ["election", "vote", "poll", "campaign", "bypoll", "by-election", "byelection"]],
    ["bypoll", ["bypoll", "by-election", "byelection", "bankipur"]],
    ["governance", ["policy", "bill", "administration", "minister", "cabinet"]],
    ["courts", ["court", "supreme court", "high court", "constitution"]],
    ["censorship", ["censorship", "ban", "cbfc", "film", "takedown", "free speech", "public order"]],
    ["culture", ["film", "cinema", "documentary", "religion", "identity", "community"]],
    ["youth-protest", ["cjp", "cockroach janta party", "sansad chalo", "chalo sansad", "student protest", "neet", "paper leak", "jantar mantar"]],
    ["states", ["punjab", "kashmir", "manipur", "assam", "bengal", "tamil nadu", "kerala", "maharashtra", "bihar", "uttar pradesh"]],
    ["geopolitics", geopoliticalTerms],
    ["foreign-policy-india", indiaForeignPolicyTerms],
    ["global-politics", ["united nations", "brics", "g7", "global south", "russia", "ukraine", "war", "conflict"]],
    ["party-bjp", ["bjp", "bharatiya janata party"]],
    ["party-congress", ["congress", "indian national congress"]],
    ["party-regional", ["aap", "dmk", "tmc", "sp", "rjd", "jdu", "shiv sena", "ncp", "aiadmk", "bsp", "cpi"]],
    ["opposition-india-bloc", ["india bloc", "opposition bloc", "opposition alliance", "india alliance"]],
    ["economy-policy", ["budget", "inflation", "unemployment", "welfare", "scheme", "subsidy", "tax", "gst", "jobs"]],
    ["party-politics", ["party", "coalition", "opposition", "defection", "alliance"]],
    ["social-viral", ["viral", "trend", "x post", "reddit", "youtube", "social media"]],
    ["public-order", ["protest", "violence", "clash", "security"]],
    ["fact-check", ["misinformation", "disinformation", "fake", "hoax", "fact check"]],
  ];

  checks.forEach(([tag, terms]) => {
    if (terms.some((term) => text.includes(term))) {
      tags.add(tag);
    }
  });

  return Array.from(tags).slice(0, 6);
}

function hotTopicSignalBoost(text: string) {
  if (
    [
      "cjp",
      "cockroach janta party",
      "sansad chalo",
      "chalo sansad",
      "bankipur",
      "bypoll",
      "by-election",
      "byelection",
      "jan suraaj",
      "prashant kishor",
      "film ban",
      "censorship",
      "public order",
    ].some((term) => text.includes(term))
  ) {
    return 8;
  }

  return 0;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function tokenise(value: string) {
  return normalise(value)
    .split(" ")
    .filter((token) => token.length > 2)
    .filter((token) => !["the", "and", "for", "with", "from", "that"].includes(token));
}

function normalise(value: string) {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `fp_${(hash >>> 0).toString(36)}`;
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, value));
}
