import { decodeHTML } from "entities";
import type { StoredStory } from "./types";

export function cleanText(value: string | null | undefined) {
  let text = value || "";
  for (let i = 0; i < 3; i++) text = decodeHTML(text);
  return text.replace(/<!\[CDATA\[|\]\]>/g, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/[\u200B-\u200F\uFEFF]/g, "")
    .replace(/\s+/g, " ").trim();
}

export function headline(story: Pick<StoredStory, "title" | "sourceName">) {
  const title = cleanText(story.title);
  const source = cleanText(story.sourceName);
  return source && title.toLowerCase().endsWith(` - ${source.toLowerCase()}`)
    ? title.slice(0, -(source.length + 3)).trim() : title;
}

export function storySummary(story: Pick<StoredStory, "title" | "sourceName" | "summary" | "articleExcerpt" | "brief">) {
  const title = headline(story).toLowerCase();
  const options = [story.articleExcerpt, story.summary, story.brief?.whatHappened].map(cleanText);
  return options.find((text) => text.length > 45 && text.toLowerCase() !== title &&
    !/^Reported by .*Use this as a signal|^Official page item|^Comprehensive up-to-date news/i.test(text) &&
    !(text.toLowerCase().startsWith(title) && text.length < title.length + 35)) || "";
}

export function topicLabel(story: Pick<StoredStory, "title" | "summary" | "tags">) {
  const text = `${story.title} ${story.summary} ${story.tags.join(" ")}`.toLowerCase();
  const rules: Array<[string, RegExp]> = [
    ["People & protests", /\b(protests?|demonstrations?|strikes?|unrest|rally|rallies)\b/],
    ["Youth & education", /\b(students?|neet|exams?|paper leak|education|university|universities|scholarships?|tuition|admissions?|recruitment)\b/],
    ["Technology & business", /\b(ceo|nvidia|microsoft|executive|resigns?|resignation|layoffs?|artificial intelligence|ai|chips?|technology|cyberattack|data breach|antitrust|outage)\b/],
    ["Climate & environment", /\b(climate|environment|pollution|heatwave|floods?|earthquake|cyclone|wildfire|drought|disaster|biodiversity|cop\d+|burning planet)\b/],
    ["Health & society", /\b(health|outbreak|pandemic|disease|hospitals?|vaccines?|healthcare)\b/],
    ["Diplomacy & summits", /\b(brics|g20|g7|sco|quad|summit|diplomacy|bilateral|jaishankar|mea)\b/],
    ["World & security", /\b(war|ceasefire|ukraine|russia|israel|gaza|iran|nato|terror|border|pok|pakistan|china|united nations)\b/],
    ["Economy & policy", /\b(budget|inflation|unemployment|jobs|gst|tax|rbi|welfare|tariff|economy|trade)\b/],
    ["Elections", /\b(election|bypoll|by-election|candidate|constituency|ballot)\b/],
    ["Parliament", /\b(parliament|lok sabha|rajya sabha|bill|ordinance|speaker)\b/],
    ["Courts & accountability", /\b(court|judgment|petition|bail|corruption|investigation|scam)\b/],
    ["People & protests", /\b(protest|students?|neet|paper leak|strike|public health|flood|disaster)\b/],
    ["Social & culture", /\b(viral|censorship|film|social media|fact.check|misinformation)\b/],
    ["Party politics", /\b(bjp|congress|aap|dmk|tmc|rjd|jdu|opposition|alliance|minister|president)\b/],
  ];
  return rules.find(([, pattern]) => pattern.test(text))?.[0] || "Other developments";
}

export function istDate(now = new Date()) {
  return new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10);
}

export function reportSlots(now = new Date()) {
  const day = istDate(now);
  const hour = new Date(now.getTime() + 330 * 60000).getUTCHours();
  if (hour < 8) return [];
  const end = new Date(`${day}T${String(hour).padStart(2, "0")}:00:00+05:30`);
  const start = new Date(end.getTime() - (hour === 8 ? 9 : 1) * 3600000);
  // Only the current slot is due. Recovery must not flood the inbox with every
  // missed hour. Pending provider attempts retain their original outbox key.
  return [{ key: `hourly-${day}-${hour}`, slot: String(hour),
    startIso: start.toISOString(), endIso: end.toISOString(),
    label: `${hour === 8 ? "Morning catch-up" : "Hourly briefing"} | ${day} | ${hour > 12 ? hour - 12 : hour}:00 ${hour < 12 ? "AM" : "PM"} IST`,
  }];
}

export const EMAIL_SCHEDULE_IST = Array.from({ length: 16 }, (_, i) => `${String(i + 8).padStart(2, "0")}:00`);
