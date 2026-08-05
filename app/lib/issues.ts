import type { RawSignal, StoredStory } from "./types";

export interface IssueInput {
  title: string;
  summary?: string;
  sourceName?: string;
  tags?: string[];
}

export interface IssueFrame {
  id: string;
  umbrellaId: string;
  label: string;
  partKey: string;
  partLabel: string;
  primaryEntity: string | null;
  entities: string[];
  tokens: string[];
  anchors: string[];
  topic: string;
  eventType: string;
}

const SOURCE_SUFFIX_PATTERN = /\s+-\s+([^-]{2,48})$/;

const issueRules: Array<{
  id: string;
  label: string;
  any: RegExp[];
  context?: RegExp[];
}> = [
  {
    id: "issue:pok-kashmir-political-tensions",
    label: "PoK / Kashmir political and security tensions",
    any: [
      /\bpok\b/i,
      /pakistan occupied kashmir/i,
      /pakistan-occupied kashmir/i,
      /pak occupied kashmir/i,
      /azad kashmir/i,
      /gilgit baltistan/i,
    ],
  },
  {
    id: "issue:india-pakistan-security-diplomacy",
    label: "India-Pakistan security and diplomacy tensions",
    any: [/india pakistan/i, /pakistan india/i, /border tension/i, /line of control/i, /\bloc\b/i, /operation sindoor/i],
    context: [/kashmir/i, /terror/i, /ceasefire/i, /border/i, /diplomacy/i, /army/i, /security/i, /strike/i, /pahalgam/i],
  },
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

const acronymTokens = new Set([
  "aap",
  "bjp",
  "cbi",
  "cjp",
  "dmk",
  "eci",
  "inc",
  "jdu",
  "jnu",
  "loc",
  "mea",
  "neet",
  "nia",
  "nta",
  "pok",
  "rbi",
  "rjd",
  "rss",
  "sc",
  "sp",
  "tmc",
  "un",
]);

const phraseAnchors: Array<{ id: string; any: RegExp[] }> = [
  { id: "pok", any: [/\bpok\b/i, /pakistan occupied kashmir/i, /azad kashmir/i, /gilgit baltistan/i] },
  { id: "line-of-control", any: [/\bloc\b/i, /line of control/i] },
  { id: "operation-sindoor", any: [/operation sindoor/i] },
  { id: "pahalgam", any: [/pahalgam/i] },
  { id: "neet-paper-leak", any: [/neet/i, /paper leak/i] },
  { id: "student-protest", any: [/student protest/i, /sansad chalo/i, /chalo sansad/i, /\bcjp\b/i] },
  { id: "parliament-session", any: [/monsoon session/i, /lok sabha/i, /rajya sabha/i, /parliament/i] },
  { id: "waqf", any: [/\bwaqf\b/i] },
  { id: "delimitation", any: [/delimitation/i] },
  { id: "bypoll", any: [/bypoll/i, /by election/i, /byelection/i] },
];

const eventAnchors: Array<{ id: string; any: RegExp[] }> = [
  { id: "revelation", any: [/exclusive/i, /documents show/i, /reveals/i, /revealed/i, /leak/i, /leaked/i, /exposes/i, /allegation/i, /whistleblower/i] },
  { id: "protest", any: [/protest/i, /march/i, /demonstration/i, /rally/i, /agitation/i, /strike/i, /unrest/i] },
  { id: "court-case", any: [/court/i, /petition/i, /plea/i, /hearing/i, /judgment/i, /bail/i, /order/i] },
  { id: "policy-bill", any: [/bill/i, /policy/i, /scheme/i, /ordinance/i, /regulation/i, /reform/i, /notification/i] },
  { id: "election", any: [/election/i, /bypoll/i, /candidate/i, /campaign/i, /vote/i, /seat/i] },
  { id: "security", any: [/security/i, /terror/i, /attack/i, /border/i, /army/i, /police/i, /ceasefire/i, /strike/i] },
  { id: "diplomacy", any: [/diplomacy/i, /foreign/i, /summit/i, /bilateral/i, /jaishankar/i, /mea/i, /talks/i] },
  { id: "party-move", any: [/joins/i, /joined/i, /defection/i, /alliance/i, /meeting/i, /appoint/i, /resign/i, /expelled/i] },
  { id: "corruption", any: [/scam/i, /corruption/i, /probe/i, /investigation/i, /raid/i, /chargesheet/i] },
  { id: "economy", any: [/budget/i, /inflation/i, /unemployment/i, /jobs/i, /tax/i, /gst/i, /welfare/i] },
  { id: "social-viral", any: [/viral/i, /trending/i, /hashtag/i, /video/i, /social media/i] },
];

export function issueFrameFor(input: IssueInput): IssueFrame {
  const rawText = `${input.title} ${input.summary ?? ""} ${(input.tags ?? []).join(" ")}`;
  const normalisedText = normaliseIssueText(rawText);
  const searchText = `${rawText} ${normalisedText}`;
  const entities = extractNamedEntities(rawText);
  const primaryEntity = entities[0] ?? null;
  const tokens = issueTokens(rawText);
  const anchors = issueAnchors(rawText);
  const topic = topicBucket(normalisedText);
  const eventType = eventBucket(searchText);
  const partKey = issuePartKey(eventType, anchors, tokens);
  const partLabel = issuePartLabel(eventType, anchors);
  const rule = issueRules.find((candidate) => {
    const hasAnchor = candidate.any.some((pattern) => pattern.test(searchText));
    if (!hasAnchor) return false;
    return !candidate.context || candidate.context.some((pattern) => pattern.test(searchText));
  });

  if (rule) {
    return {
      id: rule.id,
      umbrellaId: rule.id,
      label: rule.label,
      partKey,
      partLabel,
      primaryEntity,
      entities,
      tokens,
      anchors,
      topic,
      eventType,
    };
  }

  if (primaryEntity) {
    const entityContext = anchors
      .filter((anchor) => !anchor.includes(slug(primaryEntity)))
      .filter((anchor) => !weakTokens.has(anchor))
      .slice(0, 2)
      .join("-");
    const umbrellaId = `issue:${topic}:${slug(primaryEntity)}:${entityContext || "general"}`;
    return {
      id: umbrellaId,
      umbrellaId,
      label: issueLabelFromEntity(primaryEntity, input.title),
      partKey,
      partLabel,
      primaryEntity,
      entities,
      tokens,
      anchors,
      topic,
      eventType,
    };
  }

  const strongTokens = anchors.length ? anchors : tokens.filter((token) => !weakTokens.has(token));
  const signature = strongTokens.slice(0, 3).join("-");
  const umbrellaId = `issue:${topic}:${signature || slug(cleanIssueTitle(input.title))}`;
  return {
    id: umbrellaId,
    umbrellaId,
    label: cleanIssueTitle(input.title),
    partKey,
    partLabel,
    primaryEntity: null,
    entities,
    tokens,
    anchors,
    topic,
    eventType,
  };
}

export function canonicalIssueKey(input: IssueInput) {
  return issueFrameFor(input).id;
}

export function canonicalIssueUmbrellaKey(input: IssueInput) {
  return issueFrameFor(input).umbrellaId;
}

export function canonicalIssueLabel(input: IssueInput) {
  return issueFrameFor(input).label;
}

export function canonicalIssuePartKey(input: IssueInput) {
  return issueFrameFor(input).partKey;
}

export function canonicalIssuePartLabel(input: IssueInput) {
  return issueFrameFor(input).partLabel;
}

export function canonicalIssueActors(input: IssueInput) {
  return issueFrameFor(input).entities;
}

export function canonicalIssueTopic(input: IssueInput) {
  return issueFrameFor(input).topic;
}

export function canonicalIssueEventType(input: IssueInput) {
  return issueFrameFor(input).eventType;
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

  if (issueMatchConfidence(left, right) >= 0.72) {
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
  return issueMatchConfidence(left, right);
}

export function issueMatchConfidence(
  left: Pick<RawSignal | StoredStory, "title" | "summary" | "sourceName"> & { tags?: string[] },
  right: Pick<RawSignal | StoredStory, "title" | "summary" | "sourceName"> & { tags?: string[] }
) {
  const leftFrame = issueFrameFor(left);
  const rightFrame = issueFrameFor(right);
  if (leftFrame.umbrellaId === rightFrame.umbrellaId) {
    return 1;
  }

  if (leftFrame.id === rightFrame.id) {
    return 1;
  }

  const leftTokens = uniqueFrameSignals(leftFrame);
  const rightTokens = uniqueFrameSignals(rightFrame);

  const sharedTokens = Array.from(leftTokens).filter((token) => rightTokens.has(token));
  const shared = sharedTokens.length;
  const sharedEntities = overlapCount(
    leftFrame.entities.map(slug),
    rightFrame.entities.map(slug)
  );
  const sameTopic = leftFrame.topic === rightFrame.topic;
  const sameEvent = leftFrame.eventType !== "general" && leftFrame.eventType === rightFrame.eventType;
  const tokenScore = leftTokens.size && rightTokens.size ? shared / Math.max(leftTokens.size, rightTokens.size) : 0;
  const entityScore = Math.min(1, sharedEntities / Math.max(1, Math.min(leftFrame.entities.length || 1, rightFrame.entities.length || 1)));
  const phraseBoost = sharedTokens.some((token) => token.includes("-")) ? 0.12 : 0;
  const acronymBoost = sharedTokens.some((token) => acronymTokens.has(token)) ? 0.1 : 0;

  return Math.min(
    1,
    tokenScore * 0.42 +
      entityScore * 0.3 +
      (sameTopic ? 0.13 : 0) +
      (sameEvent ? 0.15 : 0) +
      phraseBoost +
      acronymBoost
  );
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
        .filter((token) => token.length > 3 || acronymTokens.has(token))
        .filter((token) => !stopWords.has(token))
        .filter((token) => !sourceWords.has(token))
    )
  ).slice(0, 12);
}

export function issueAnchors(value: string) {
  const text = normaliseIssueText(value);
  const entities = extractNamedEntities(value).map(slug);
  const phrases = phraseAnchors
    .filter((anchor) => anchor.any.some((pattern) => pattern.test(text)))
    .map((anchor) => anchor.id);
  const tokens = issueTokens(text).filter((token) => !weakTokens.has(token));
  const tokenPhrases = issueTokenPhrases(tokens);
  return Array.from(new Set([...phrases, ...entities, ...tokenPhrases, ...tokens])).slice(0, 18);
}

export function cleanIssueTitle(value: string) {
  return titleCase(cleanEmailLikeText(removeSourceSuffix(value))).slice(0, 140);
}

function issueLabelFromEntity(entity: string, title: string) {
  const tokens = issueTokens(title).filter((token) => !issueTokens(entity).includes(token));
  const context = tokens.slice(0, 4).join(" ");
  return titleCase(`${entity}${context ? ` and ${context}` : ""}`).slice(0, 140);
}

function issuePartKey(eventType: string, anchors: string[], tokens: string[]) {
  const signal = [
    eventType,
    ...anchors.filter((anchor) => anchor !== eventType && !anchor.startsWith("topic:")).slice(0, 2),
    ...tokens.filter((token) => !weakTokens.has(token)).slice(0, 1),
  ]
    .filter(Boolean)
    .join(" ");
  return slug(signal || eventType || "latest-development");
}

function issuePartLabel(eventType: string, anchors: string[]) {
  const eventLabels: Record<string, string> = {
    revelation: "New revelation",
    protest: "Protest/mobilisation",
    "court-case": "Court/legal turn",
    "policy-bill": "Policy/bill move",
    election: "Election angle",
    security: "Security angle",
    diplomacy: "Diplomacy angle",
    "party-move": "Party/power move",
    corruption: "Investigation/accountability",
    economy: "Economy/public impact",
    "social-viral": "Social/viral signal",
    general: "Latest development",
  };
  const anchorText = anchors
    .filter((anchor) => anchor !== eventType)
    .slice(0, 2)
    .map(titleCaseAnchor)
    .join(" + ");
  return `${eventLabels[eventType] ?? "Latest development"}${anchorText ? `: ${anchorText}` : ""}`;
}

function sharedStrongTokens(leftTokens: string[], rightTokens: string[]) {
  const right = new Set(rightTokens.filter((token) => !weakTokens.has(token)));
  return leftTokens.filter((token) => !weakTokens.has(token) && right.has(token));
}

function extractNamedEntities(value: string) {
  const explicit = [
    "Pakistan Occupied Kashmir",
    "Pakistan-occupied Kashmir",
    "PoK",
    "Dharmendra Pradhan",
    "Prahlad Joshi",
    "Rahul Gandhi",
    "Narendra Modi",
    "Amit Shah",
    "M K Stalin",
    "MK Stalin",
    "Om Birla",
    "Prashant Kishor",
  ].filter((name) => new RegExp(`\\b${escapeRegex(name).replace(/\s+/g, "\\s+")}\\b`, "i").test(value));

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

  return Array.from(
    new Set(
      [...explicit, ...candidates]
        .map((candidate) => candidate.replace(/^M K$/, "MK").replace(/\s+/g, " ").trim())
        .filter(Boolean)
    )
  ).slice(0, 5);
}

function topicBucket(value: string) {
  if (/pok|pakistan occupied kashmir|kashmir|gilgit|baltistan|line of control|operation sindoor|pahalgam/.test(value)) return "geopolitics";
  if (/bypoll|election|poll|candidate|constituency/.test(value)) return "election";
  if (/protest|student|neet|paper leak|police|march/.test(value)) return "protest";
  if (/parliament|lok sabha|rajya sabha|bill|speaker|house/.test(value)) return "parliament";
  if (/court|supreme court|high court|petition|judgment|bail/.test(value)) return "courts";
  if (/ban|film|cbfc|censor|free speech|public order/.test(value)) return "censorship";
  if (/china|pakistan|border|foreign|jaishankar|diplomacy/.test(value)) return "geopolitics";
  if (/bjp|congress|aap|tmc|dmk|rjd|jdu|opposition|alliance/.test(value)) return "party";
  return "politics";
}

function eventBucket(value: string) {
  const normalised = normaliseIssueText(value);
  return eventAnchors.find((event) => event.any.some((pattern) => pattern.test(normalised)))?.id ?? "general";
}

function issueTokenPhrases(tokens: string[]) {
  const phrases: string[] = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    const left = tokens[index];
    const right = tokens[index + 1];
    if (!left || !right || weakTokens.has(left) || weakTokens.has(right)) {
      continue;
    }
    phrases.push(`${left}-${right}`);
  }
  return phrases.slice(0, 5);
}

function uniqueFrameSignals(frame: IssueFrame) {
  return new Set(
    [
      ...frame.anchors,
      ...frame.tokens.filter((token) => !weakTokens.has(token)),
      ...frame.entities.map(slug),
      frame.eventType !== "general" ? `event:${frame.eventType}` : "",
      `topic:${frame.topic}`,
    ].filter(Boolean)
  );
}

function overlapCount(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((value) => rightSet.has(value)).length;
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
  return normaliseAliases(cleanEmailLikeText(value))
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normaliseAliases(value: string) {
  return value
    .replace(/\bp[\s.\-]*o[\s.\-]*k\b/gi, " pok pakistan occupied kashmir ")
    .replace(/\bpak(?:istan)?[\s-]*occupied\s+kashmir\b/gi, " pok pakistan occupied kashmir ")
    .replace(/\bazad\s+kashmir\b/gi, " pok pakistan occupied kashmir ")
    .replace(/\bgilgit[\s-]*baltistan\b/gi, " pok gilgit baltistan ")
    .replace(/\bj\s*&\s*k\b/gi, " jammu kashmir ")
    .replace(/\bjammu\s+and\s+kashmir\b/gi, " jammu kashmir ")
    .replace(/\bline\s+of\s+control\b/gi, " loc line of control ")
    .replace(/\bby[-\s]?election\b/gi, " bypoll ");
}

function titleCase(value: string) {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function titleCaseAnchor(value: string) {
  return titleCase(value.replace(/-/g, " "));
}

function slug(value: string) {
  return normaliseIssueText(value).replace(/\s+/g, "-").slice(0, 80) || "unknown";
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
