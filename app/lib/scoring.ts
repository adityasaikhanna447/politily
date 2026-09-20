import { cleanText } from "./presentation";
import type { RawSignal, StoryScores, StoredStory } from "./types";

const politics = ["election", "elections", "bypoll", "government", "minister", "president", "parliament", "cabinet", "bill", "court", "policy", "constitution", "coalition", "opposition", "bjp", "congress", "dmk", "aap", "tmc", "सरकार", "संसद", "मंत्री", "चुनाव", "अदालत"];
const foreign = ["brics", "g20", "g7", "sco", "quad", "summit", "diplomacy", "treaty", "trade", "tariff", "ceasefire", "war", "border", "china", "pakistan", "ukraine", "russia", "gaza", "iran", "israel", "united states", "nato", "ब्रिक्स", "शिखर सम्मेलन", "चीन", "पाकिस्तान"];
const impact = ["budget", "inflation", "unemployment", "jobs", "education", "health", "tax", "welfare", "rights", "students", "neet", "paper leak", "election", "elections", "ceasefire", "war", "treaty", "brics", "summit", "tariff", "disaster", "flood"];
const tension = ["resignation", "resigns", "arrest", "arrested", "protest", "protests", "strike", "violence", "ban", "scandal", "leak", "backlash", "corruption", "clash", "killed", "attack"];
const decision = ["announces", "approves", "approved", "agrees", "signs", "signed", "passes", "rules", "ruling", "verdict", "resigns", "arrested", "declares", "launches", "ceasefire", "summit", "election result", "results"];
const tags: Array<[string, string[]]> = [
  ["election", ["election", "elections", "bypoll", "by-election", "ballot"]],
  ["parliament", ["parliament", "lok sabha", "rajya sabha", "bill"]],
  ["economy-policy", ["budget", "inflation", "unemployment", "welfare", "tax", "gst", "jobs"]],
  ["foreign-policy-india", ["brics", "summit", "jaishankar", "mea", "bilateral", "pakistan", "china"]],
  ["global-politics", foreign], ["courts", ["court", "judgment", "verdict", "bail"]],
  ["youth-protest", ["protest", "protests", "students", "neet", "paper leak"]],
  ["party-bjp", ["bjp", "bharatiya janata"]], ["party-congress", ["congress", "rahul gandhi"]],
  ["party-regional", ["aap", "dmk", "tmc", "rjd", "jdu", "samajwadi", "tdp"]],
  ["opposition-india-bloc", ["india bloc", "opposition alliance"]],
  ["social-viral", ["social media", "viral", "reddit", "youtube"]],
  ["fact-check", ["fact check", "fact-check", "misinformation", "hoax"]],
];

function matches(text: string, terms: string[]) {
  return terms.filter(term => new RegExp(`(?:^|[^\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\p{L}\\p{N}])`, "iu").test(text));
}
const cap = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

export function scoreSignal(signal: RawSignal, recentStories: StoredStory[] = []): StoryScores {
  const text = cleanText(`${signal.title} ${signal.summary}`).toLowerCase();
  const p = matches(text, politics), g = matches(text, foreign), i = matches(text, impact);
  const v = matches(text, tension), d = matches(text, decision);
  const similarity = recentStories.slice(0, 160).reduce((max, story) => Math.max(max, titleSimilarity(signal.title, story.title)), 0);
  const noveltyScore = cap(100 - similarity * 65);
  const politicalWeight = cap(20 + Math.min(4, p.length) * 14 + Math.min(2, d.length) * 10);
  const geopoliticalRelevance = cap(g.length ? 42 + Math.min(4, g.length) * 12 : 10);
  const publicImpact = cap(20 + Math.min(4, i.length) * 17 + Math.min(2, d.length) * 8);
  const viralPotential = cap(20 + Math.min(4, v.length) * 15 + Math.min(2, i.length) * 10);
  const sentimentScore = cap(v.length * 18);
  const ageHours = signal.publishedAt ? (Date.now() - Date.parse(signal.publishedAt)) / 3600000 : null;
  const freshness = ageHours === null || !Number.isFinite(ageHours) ? 30 : ageHours < -0.1 ? 0 : ageHours < 2 ? 100 : ageHours < 6 ? 80 : ageHours < 24 ? 55 : ageHours < 48 ? 20 : 0;
  const substance = Math.max(politicalWeight, geopoliticalRelevance);
  const commercial = /\b(sponsored|advertorial|brand promotion|partner content)\b/.test(text);
  const totalScore = cap(substance * .30 + publicImpact * .25 + freshness * .20 + noveltyScore * .10 + viralPotential * .15 - (commercial ? 40 : 0));
  return {
    noveltyScore, politicalWeight, geopoliticalRelevance, viralPotential, sentimentScore, totalScore,
    tags: tags.filter(([, terms]) => matches(text, terms).length).map(([tag]) => tag),
    scoringBreakdown: {
      noveltySignals: [similarity > .65 ? "Substantial overlap with existing reporting" : "New or developing report"],
      politicalSignals: [...p, ...d], geopoliticalSignals: g,
      viralSignals: [...v, ...i], sentimentSignals: v,
      velocitySignal: `Freshness ${freshness}/100. ${ageHours === null ? "Publisher timestamp unavailable; detection is not publication." : "Based on publisher timestamp, not measured sharing velocity."}`,
      sourceSignal: `Public impact ${publicImpact}/100. ${signal.sourceLane || "portal"} feed. Source crawl priority is NOT a ranking input. Share counts are unavailable.`,
      formula: "v3: relevance max(political, geopolitical) 30% + public impact 25% + freshness 20% + novelty 10% + attention cues 15%. Editorial heuristic, not a truth score or view forecast.",
    },
  };
}

export function titleSimilarity(a: string, b: string) {
  const tokenize = (value: string) => new Set(cleanText(value).toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").split(/\s+/).filter(t => t.length > 2 && !["the", "and", "for", "with", "from", "that"].includes(t)));
  const left = tokenize(a), right = tokenize(b);
  return left.size && right.size ? [...left].filter(t => right.has(t)).length / Math.max(left.size, right.size) : 0;
}

// Keep the existing fingerprint algorithm so deployments do not reinsert old reports.
export function fingerprintFor(signal: Pick<RawSignal, "title" | "url" | "sourceName">) {
  const normalize = (value: string) => value.toLowerCase().replace(/https?:\/\/\S+/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const basis = `${normalize(signal.title)}|${normalize(signal.url)}|${normalize(signal.sourceName)}`;
  let hash = 2166136261;
  for (let i = 0; i < basis.length; i++) { hash ^= basis.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return `fp_${(hash >>> 0).toString(36)}`;
}
