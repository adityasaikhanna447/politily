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
  return [14, 21].map((hour) => ({
    key: `newsletter-${day}-${hour}`,
    slot: String(hour),
    startIso: new Date(`${day}T00:00:00+05:30`).toISOString(),
    endIso: new Date(`${day}T${hour}:00:00+05:30`).toISOString(),
    label: `${hour === 14 ? "Afternoon edition" : "Evening edition"} | ${day} | ${hour === 14 ? "2 PM" : "9 PM"} IST`,
  })).filter((slot) => Date.parse(slot.endIso) <= now.getTime());
}
