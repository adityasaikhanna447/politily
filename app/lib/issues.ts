import type { RawSignal, StoredStory } from "./types";

export interface IssueInput {
  title: string;
  summary?: string;
  sourceName?: string;
  tags?: string[];
}

export interface IssueFrame {
  id: string;
  label: string;
  primaryEntity: string | null;
  tokens: string[];
}

const SOURCE_SUFFIX_PATTERN = /\s+-\s+([^-]{2,48})$/;

const issueRules: Array<{
  id: string;
  label: string;
  any: RegExp[];
  context?: RegExp[];
}> = [
  {
    id: "issue:cjp-sansad-chalo",
    label: "CJP / Sansad Chalo protest",
    any: [/cjp\b/i, /cockroach janta party/i, /chalo sansad/i, /sansad chalo/i],
  },
  {
    id: "issue:bankipur-bypoll",
    label: "Bankipur bypoll and Bihar party strategy",
    any: [/bankipur/i, /bypoll/i, /by-election/i, /byelection/i],
  },
  {
    id: "issue:dharmendra-pradhan-education-accountability",
    label: "Dharmendra Pradhan, NEET/student protest and education accountability",
    any: [/dharmendra pradhan/i, /education minister/i],
    context: [/neet/i, /student/i, /paper leak/i, /congress protest/i, /protest/i, /resign/i, /outrage/i],
  },
  {
    id: "issue:prahlad-joshi-parliament-floor-management",
    label: "Prahlad Joshi, Parliament floor management and opposition strategy",
    any: [/prahlad joshi/i, /parliamentary affairs minister/i],
    context: [/parliament/i, /lok sabha/i, /rajya sabha/i, /opposition/i, /monsoon session/i, /house/i, /speaker/i],
  },
  {
    id: "issue:jailed-leaders-bill",
    label: "Bill on jailed leaders holding office",
    any: [/jailed leaders/i, /removing jailed leaders/i, /office.*jailed/i, /130th constitutional/i],
  },
  {
    id: "issue:rahul-gandhi",
    label: "Rahul Gandhi and opposition leadership",
    any: [/rahul gandhi/i],
  },
];

const stopWords = new Set([
  "about",
  "after",
  "again",
  "against",
  "amid",
  "among",
  "and",
  "are",
  "asks",
  "before",
  "being",
  "brief",
  "calls",
  "case",
  "city",
  "claim",
  "claims",
  "day",
  "delhi",
  "during",
  "from",
  "have",
  "headlines",
  "india",
  "indian",
  "into",
  "latest",
  "live",
  "more",
  "news",
  "over",
  "says",
  "show",
  "shows",
  "state",
  "that",
  "the",
  "this",
  "today",
  "told",
  "what",
  "when",
  "where",
  "with",
  "will",
]);

const weakTokens = new Set([
  "affairs",
  "agency",
  "breaking",
  "centre",
  "chief",
  "daily",
  "government",
  "leader",
  "leaders",
  "minister",
  "national",
  "office",
  "party",
  "political",
  "politics",
  "press",
  "report",
  "reports",
  "said",
  "source",
  "sources",
  "times",
]);

const sourceWords = new Set([
  "aaj",
  "aljazeera",
  "ani",
  "bbc",
  "businessline",
  "deccan",
  "express",
  "hindu",
  "hindustan",
  "india",
  "indian",
  "ndtv",
  "news18",
  "print",
  "pti",
  "telegraph",
  "times",
  "tribune",
  "wire",
]);

export function issueFrameFor(input: IssueInput): IssueFrame {
  const rawText = `${input.title} ${input.summary ?? ""} ${(input.tags ?? []).join(" ")}`;
  const normalisedText = normaliseIssueText(rawText);
  const rule = issueRules.find((candidate) => {
    const hasAnchor = candidate.any.some((pattern) => pattern.test(rawText));
    if (!hasAnchor) return false;
    return !candidate.context || candidate.context.some((pattern) => pattern.test(rawText));
  });

  if (rule) {
    return {
      id: rule.id,
      label: rule.label,
      primaryEntity: extractPrimaryEntity(rawText),
      tokens: issueTokens(rawText),
    };
  }

  const primaryEntity = extractPrimaryEntity(rawText);
  const tokens = issueTokens(rawText);
  if (primaryEntity) {
    return {
      id: `issue:person:${slug(primaryEntity)}`,
      label: issueLabelFromEntity(primaryEntity, input.title),
      primaryEntity,
      tokens,
    };
  }

  const strongTokens = tokens.filter((token) => !weakTokens.has(token));
  const signature = strongTokens.slice(0, 4).join("-");
  const topic = topicBucket(normalisedText);
  return {
    id: `issue:${topic}:${signature || slug(cleanIssueTitle(input.title))}`,
    label: cleanIssueTitle(input.title),
    primaryEntity: null,
    tokens,
  };
}

export function canonicalIssueKey(input: IssueInput) {
  return issueFrameFor(input).id;
}

export function canonicalIssueLabel(input: IssueInput) {
  return issueFrameFor(input).label;
}

export function areSameIssue(
  left: Pick<RawSignal | StoredStory, "title" | "summary" | "sourceName"> & { tags?: string[] },
  right: Pick<RawSignal | StoredStory, "title" | "summary" | "sourceName"> & { tags?: string[] }
) {
  const leftFrame = issueFrameFor(left);
  const rightFrame = issueFrameFor(right);

  if (leftFrame.id === rightFrame.id) {
    return true;
  }

  if (leftFrame.primaryEntity && leftFrame.primaryEntity === rightFrame.primaryEntity) {
    return true;
  }

  const shared = sharedStrongTokens(leftFrame.tokens, rightFrame.tokens);
  if (shared.length >= 3) {
    return true;
  }

  return shared.length >= 2 && topicBucket(textFor(left)) === topicBucket(textFor(right));
}

export function issueSimilarity(
  left: Pick<RawSignal | StoredStory, "title" | "summary" | "sourceName"> & { tags?: string[] },
  right: Pick<RawSignal | StoredStory, "title" | "summary" | "sourceName"> & { tags?: string[] }
) {
  const leftFrame = issueFrameFor(left);
  const rightFrame = issueFrameFor(right);
  if (leftFrame.id === rightFrame.id) {
    return 1;
  }

  const leftTokens = new Set(leftFrame.tokens.filter((token) => !weakTokens.has(token)));
  const rightTokens = new Set(rightFrame.tokens.filter((token) => !weakTokens.has(token)));
  if (!leftTokens.size || !rightTokens.size) {
    return 0;
  }

  const shared = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
  const entityBoost =
    leftFrame.primaryEntity && leftFrame.primaryEntity === rightFrame.primaryEntity ? 0.34 : 0;
  return Math.min(1, shared / Math.max(leftTokens.size, rightTokens.size) + entityBoost);
}

export function issueTokens(value: string) {
  const cleaned = normaliseIssueText(removeSourceSuffix(value))
    .replace(/\bby election\b/g, "bypoll")
    .replace(/\bbye election\b/g, "bypoll")
    .replace(/\bbyelection\b/g, "bypoll")
    .replace(/\bsansad chalo\b/g, "cjp sansad chalo")
    .replace(/\bchalo sansad\b/g, "cjp sansad chalo");

  return Array.from(
    new Set(
      cleaned
        .split(/\s+/)
        .filter((token) => token.length > 3)
        .filter((token) => !stopWords.has(token))
        .filter((token) => !sourceWords.has(token))
    )
  ).slice(0, 12);
}

export function cleanIssueTitle(value: string) {
  return titleCase(cleanEmailLikeText(removeSourceSuffix(value))).slice(0, 140);
}

function issueLabelFromEntity(entity: string, title: string) {
  const tokens = issueTokens(title).filter((token) => !issueTokens(entity).includes(token));
  const context = tokens.slice(0, 4).join(" ");
  return titleCase(`${entity}${context ? ` and ${context}` : ""}`).slice(0, 140);
}

function sharedStrongTokens(leftTokens: string[], rightTokens: string[]) {
  const right = new Set(rightTokens.filter((token) => !weakTokens.has(token)));
  return leftTokens.filter((token) => !weakTokens.has(token) && right.has(token));
}

function extractPrimaryEntity(value: string) {
  const explicit = [
    "Dharmendra Pradhan",
    "Prahlad Joshi",
    "Rahul Gandhi",
    "Narendra Modi",
    "Amit Shah",
    "M K Stalin",
    "MK Stalin",
    "Om Birla",
    "Prashant Kishor",
  ].find((name) => new RegExp(`\\b${escapeRegex(name).replace(/\s+/g, "\\s+")}\\b`, "i").test(value));
  if (explicit) {
    return explicit.replace(/^M K$/, "MK");
  }

  const candidates = Array.from(
    cleanEmailLikeText(removeSourceSuffix(value)).matchAll(
      /\b(?:[A-Z][a-z]{2,}|[A-Z]{2,})(?:\s+(?:[A-Z][a-z]{2,}|[A-Z]{2,})){1,3}\b/g
    )
  )
    .map((match) => match[0])
    .map((candidate) => candidate.replace(/\s+/g, " ").trim())
    .filter((candidate) => {
      const normalised = normaliseIssueText(candidate);
      const parts = normalised.split(/\s+/);
      if (parts.length < 2 || parts.length > 4) return false;
      if (parts.every((token) => weakTokens.has(token) || sourceWords.has(token))) return false;
      if (parts.some((token) => sourceWords.has(token))) return false;
      if (/^(New Delhi|The Indian|The Times|Press Trust|Supreme Court|High Court)$/i.test(candidate)) return false;
      return true;
    });

  return candidates[0] ?? null;
}

function topicBucket(value: string) {
  if (/bypoll|election|poll|candidate|constituency/.test(value)) return "election";
  if (/protest|student|neet|paper leak|police|march/.test(value)) return "protest";
  if (/parliament|lok sabha|rajya sabha|bill|speaker|house/.test(value)) return "parliament";
  if (/court|supreme court|high court|petition|judgment|bail/.test(value)) return "courts";
  if (/ban|film|cbfc|censor|free speech|public order/.test(value)) return "censorship";
  if (/china|pakistan|border|foreign|jaishankar|diplomacy/.test(value)) return "geopolitics";
  if (/bjp|congress|aap|tmc|dmk|rjd|jdu|opposition|alliance/.test(value)) return "party";
  return "politics";
}

function textFor(input: IssueInput) {
  return `${input.title} ${input.summary ?? ""} ${input.sourceName ?? ""} ${(input.tags ?? []).join(" ")}`;
}

function removeSourceSuffix(value: string) {
  return value.replace(SOURCE_SUFFIX_PATTERN, "");
}

function cleanEmailLikeText(value: string) {
  return decodeEntities(decodeEntities(value || ""))
    .replace(/&nbsp;|&amp;nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity: string) => {
    if (entity.startsWith("#x")) {
      return String.fromCharCode(Number.parseInt(entity.slice(2), 16));
    }

    if (entity.startsWith("#")) {
      return String.fromCharCode(Number.parseInt(entity.slice(1), 10));
    }

    return named[entity.toLowerCase()] ?? `&${entity};`;
  });
}

function normaliseIssueText(value: string) {
  return cleanEmailLikeText(value)
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleCase(value: string) {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function slug(value: string) {
  return normaliseIssueText(value).replace(/\s+/g, "-").slice(0, 80) || "unknown";
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
