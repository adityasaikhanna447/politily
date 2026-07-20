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

const viralTerms = [
  "resigns",
  "resign",
  "arrest",
  "raid",
  "protest",
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
  "caste",
  "communal",
  "corruption",
  "censorship",
  "public order",
  "film ban",
  "takedown",
  "misinformation",
  "disinformation",
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
  const politicalWeight = clamp(scoreKeywordSet(text, politicalTerms, signal.sourcePriority));
  const geopoliticalRelevance = clamp(scoreKeywordSet(text, geopoliticalTerms, 28));
  const viralPotential = clamp(scoreKeywordSet(text, viralTerms, 24) + headlineTension(signal.title));
  const tags = inferTags(text);

  const totalScore = clamp(
    Math.round(
      noveltyScore * 0.24 +
        politicalWeight * 0.31 +
        geopoliticalRelevance * 0.2 +
        viralPotential * 0.25
    )
  );

  return {
    noveltyScore,
    politicalWeight,
    geopoliticalRelevance,
    viralPotential,
    totalScore,
    tags,
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

function scoreKeywordSet(text: string, terms: string[], base: number) {
  const hits = terms.filter((term) => text.includes(term)).length;
  return Math.min(100, base + hits * 12);
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
    ["election", ["election", "vote", "poll", "campaign"]],
    ["governance", ["policy", "bill", "administration", "minister", "cabinet"]],
    ["courts", ["court", "supreme court", "high court", "constitution"]],
    ["censorship", ["censorship", "ban", "cbfc", "film", "takedown", "free speech", "public order"]],
    ["culture", ["film", "cinema", "documentary", "religion", "identity", "community"]],
    ["states", ["punjab", "kashmir", "manipur", "assam", "bengal", "tamil nadu", "kerala", "maharashtra", "bihar", "uttar pradesh"]],
    ["geopolitics", geopoliticalTerms],
    ["party-politics", ["party", "coalition", "opposition", "defection", "alliance"]],
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
