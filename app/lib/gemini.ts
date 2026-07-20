import type { PolitilyBrief, StoredStory, StorySourceLink, RuntimeEnv } from "./types";

interface GeminiInteractionResponse {
  output_text?: string;
  steps?: Array<{
    content?: Array<{ text?: string }>;
  }>;
}

export async function generateBriefWithGemini(
  env: RuntimeEnv,
  story: StoredStory,
  sourceLinks: StorySourceLink[]
): Promise<PolitilyBrief> {
  if (!env.GEMINI_API_KEY) {
    return templateBrief(story, sourceLinks);
  }

  const model = env.GEMINI_MODEL || "gemini-3.5-flash";
  const compactSources = uniqueSourceLinks(sourceLinks).slice(0, 8);
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      model,
      input: buildPrompt(story, compactSources),
      generation_config: {
        temperature: 0.45,
        thinking_level: "low",
        max_output_tokens: 1800,
      },
      store: false,
    }),
  });

  if (!response.ok) {
    return {
      ...templateBrief(story, sourceLinks),
      sourceConfidence: `Gemini request failed with HTTP ${response.status}. Template brief generated instead.`,
    };
  }

  const payload = (await response.json()) as GeminiInteractionResponse;
  const text =
    payload.output_text ||
    payload.steps
      ?.flatMap((step) => step.content ?? [])
      .map((content) => content.text ?? "")
      .join("");
  const parsed = parseBrief(text);
  if (!parsed) {
    return {
      ...templateBrief(story, sourceLinks),
      sourceConfidence: "Gemini response could not be parsed. Template brief generated instead.",
    };
  }

  return {
    ...parsed,
    keyPeople: normaliseList(parsed.keyPeople),
    factsAndFigures: normaliseList(parsed.factsAndFigures),
    evidenceGrade: normaliseEvidenceGrade(parsed.evidenceGrade),
    timeline: normaliseList(parsed.timeline),
    claimMatrix: normaliseList(parsed.claimMatrix),
    primaryDocuments: normaliseList(parsed.primaryDocuments),
    missingEvidence: normaliseList(parsed.missingEvidence),
    regionalContext: String(parsed.regionalContext || ""),
    verificationProtocol: normaliseList(parsed.verificationProtocol),
    narratives: normaliseList(parsed.narratives),
    whatHappensNext: normaliseList(parsed.whatHappensNext),
    audienceReachScore: normaliseScore(parsed.audienceReachScore, story.totalScore),
    audienceReachReason: String(parsed.audienceReachReason || ""),
    videoAngles: normaliseList(parsed.videoAngles),
    sourcePositions: normaliseList(parsed.sourcePositions),
    scoreRationale: normaliseScoreRationale(parsed.scoreRationale),
    citedUrls: uniqueStrings(normaliseList(parsed.citedUrls).concat(compactSources.map((link) => link.url))).slice(0, 12),
    generatedBy: "gemini",
    generatedAt: new Date().toISOString(),
  };
}

function buildPrompt(story: StoredStory, sourceLinks: StorySourceLink[]) {
  const sources = sourceLinks
    .map((link, index) => `${index + 1}. ${link.sourceName}: ${link.title} - ${link.url}`)
    .join("\n");

  return `You are Politily, an original political education and narrative research assistant for a creator in India.

Create a concise, fact-first, source-aware political brief for a newsroom research desk. Use an original Politily explainer voice: sharp hook, clear context, historical memory, multiple perspectives, and creator-ready structure. Do not imitate any living creator or YouTube channel.

Priority rules:
1. Separate confirmed facts, reported claims, allegations, and political framing.
2. Prefer primary documents, court records, government orders, official statements, parliamentary records, and direct party releases over media summaries.
3. Use agencies and media as triangulation, not as final proof.
4. If a story needs historical context, name the historical tensions and say exactly what still needs verification.
5. If the source base is thin, say so clearly. Do not invent facts, dates, laws, people, numbers, or quotes.
6. Keep all research fields in English. Write only videoScript and cta in Hindi using Devanagari script.
7. Optimize for 12-15 daily briefs: avoid repetition and prioritize evidence, competing claims, and creator strategy.

Story:
Title: ${story.title}
Summary: ${story.summary}
Primary URL: ${story.url}
Source: ${story.sourceName}
Country/language: ${story.sourceCountry || "unknown"} / ${story.language || "unknown"}
Scores: novelty ${story.noveltyScore}, political weight ${story.politicalWeight}, geopolitical relevance ${story.geopoliticalRelevance}, viral potential ${story.viralPotential}, total ${story.totalScore}
Tags: ${story.tags.join(", ")}

Sources:
${sources || "No secondary sources yet. Be careful and say what needs verification."}

Return only valid JSON with this exact shape:
{
  "briefTitle": "short title",
  "hook": "one strong opening line",
  "whatHappened": "plain-language event summary",
  "whyItMatters": "political significance",
  "historicalContext": "relevant background and parallels",
  "geographicalContext": "places, institutions, regions, or international context",
  "keyPeople": ["person or institution"],
  "factsAndFigures": ["verifiable fact or number, with caveat if needed"],
  "sourceConfidence": "how reliable the available source base is",
  "evidenceGrade": "primary-backed | multi-source | reported | disputed | thin",
  "timeline": ["date or period - event - source/caveat"],
  "claimMatrix": ["claim - who says it - evidence level - what would verify/refute it"],
  "primaryDocuments": ["official order, court record, filing, statement, dataset, or document to obtain"],
  "missingEvidence": ["specific missing source or unresolved fact"],
  "regionalContext": "state/regional/social/history context needed to understand the story",
  "verificationProtocol": ["step a researcher should do before publishing"],
  "narratives": ["major perspective or competing interpretation"],
  "whatHappensNext": ["watch item"],
  "audienceReachScore": 0,
  "audienceReachReason": "why Indian audience may or may not care",
  "videoAngles": ["one possible video angle"],
  "sourcePositions": ["source name - what it claims or emphasizes - why it matters or its limitation"],
  "scoreRationale": {
    "noveltyScore": "why novelty score is high or low",
    "politicalWeight": "why political weight matters",
    "geopoliticalRelevance": "why geo relevance matters",
    "viralPotential": "why it can or cannot travel online",
    "audienceReach": "why this reaches Indian viewers"
  },
  "videoScript": "Hindi Devanagari structured creator script with hook, context, history, evidence, multiple perspectives, what next, CTA",
  "cta": "short Hindi Devanagari call to action",
  "caution": "what not to overclaim",
  "citedUrls": ["url"]
}`;
}

function parseBrief(text?: string): Omit<PolitilyBrief, "generatedBy" | "generatedAt"> | null {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as Omit<PolitilyBrief, "generatedBy" | "generatedAt">;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]) as Omit<PolitilyBrief, "generatedBy" | "generatedAt">;
    } catch {
      return null;
    }
  }
}

function templateBrief(story: StoredStory, sourceLinks: StorySourceLink[]): PolitilyBrief {
  const compactSources = uniqueSourceLinks(sourceLinks).slice(0, 8);
  const citedUrls = uniqueStrings([story.url, ...compactSources.map((link) => link.url)].filter(Boolean)).slice(0, 10);

  return {
    briefTitle: story.title,
    hook: `This is not just another headline. The political question is who gains power, who loses leverage, and what changes next.`,
    whatHappened: story.summary || `A political signal was detected from ${story.sourceName}.`,
    whyItMatters:
      "This story has a notable mix of novelty, political weight, wider relevance, and narrative potential for an Indian audience.",
    historicalContext:
      "Add timeline research before publication: identify the law, institution, election cycle, party history, and earlier parallel events connected to this story.",
    geographicalContext:
      story.sourceCountry ||
      "Map the place, institution, affected communities, and any cross-border implications before scripting the final video.",
    keyPeople: ["Primary institution", "affected party", "opposition response", "independent expert"],
    factsAndFigures: [
      `Politily total score: ${story.totalScore}/100`,
      `Political weight: ${story.politicalWeight}/100`,
      `Novelty score: ${story.noveltyScore}/100`,
    ],
    sourceConfidence:
      "Template mode. Set GEMINI_API_KEY for deeper automated context, and verify primary documents before publishing.",
    evidenceGrade: "thin",
    timeline: [
      `Detected - ${story.title} - initial source: ${story.sourceName}`,
      "Next - locate primary documents, direct statements, and independent corroboration.",
    ],
    claimMatrix: [
      "Main claim - reported by the detected source - unverified until primary records are checked.",
      "Political interpretation - may be partisan framing - compare ruling, opposition, institution, and affected community positions.",
    ],
    primaryDocuments: [
      "Official order, notification, court record, or parliamentary document connected to the story.",
      "Direct statements from named institutions and parties.",
    ],
    missingEvidence: [
      "Primary document link.",
      "Independent corroboration from at least two credible sources.",
      "Regional historical background from reliable records.",
    ],
    regionalContext:
      "Map the state, community, legal, electoral, and historical tensions before turning the signal into a public narrative.",
    verificationProtocol: [
      "Find the primary document before treating the claim as fact.",
      "Check agency copy and at least one independent national source.",
      "Check regional reporting for local context and affected voices.",
      "Label allegations, claims, and confirmed records separately.",
    ],
    narratives: [
      "Institutional accountability",
      "Party strategy",
      "Public trust and voter impact",
    ],
    whatHappensNext: [
      "Check official statements.",
      "Watch court, commission, ministry, or party updates.",
      "Compare national, regional, and international framing.",
    ],
    audienceReachScore: story.totalScore,
    audienceReachReason:
      "Estimated from novelty, political weight, public relevance, source credibility, and whether the issue can be explained with a clear conflict or consequence.",
    videoAngles: [
      "What happened, what is verified, and what political claim still needs proof.",
      "Who benefits politically if this narrative becomes popular.",
      "What ordinary Indian viewers should watch next.",
    ],
    sourcePositions: compactSources.length
      ? compactSources.map((link) => `${link.sourceName} - reports or links the signal "${link.title}" - verify against primary records.`)
      : [`${story.sourceName} - first detected source - needs independent corroboration.`],
    scoreRationale: {
      noveltyScore: `Novelty is ${story.noveltyScore}/100 because Politily compares this signal against recent stored stories.`,
      politicalWeight: `Political weight is ${story.politicalWeight}/100 based on institutions, parties, courts, policy, elections, and public-order terms.`,
      geopoliticalRelevance: `Geopolitical relevance is ${story.geopoliticalRelevance}/100 based on foreign affairs, cross-border, diplomatic, or global reaction signals.`,
      viralPotential: `Viral potential is ${story.viralPotential}/100 based on conflict, personalities, censorship, identity, rights, and shareable public stakes.`,
      audienceReach: `Indian audience reach is estimated at ${story.totalScore}/100 from the combined story score.`,
    },
    videoScript:
      `हुक: ${story.title}\n\nकॉन्टेक्स्ट: सबसे पहले साफ बताइए कि हुआ क्या, किस संस्था या व्यक्ति का नाम जुड़ रहा है, और यह मुद्दा अभी क्यों उठा है.\n\nइतिहास: इस कहानी को पुराने राजनीतिक, कानूनी या सामाजिक संदर्भ से जोड़िए, लेकिन बिना सबूत के कोई बड़ा दावा मत कीजिए.\n\nसबूत: पहले आधिकारिक दस्तावेज, कोर्ट रिकॉर्ड, सरकारी बयान या सीधा स्रोत दिखाइए. मीडिया रिपोर्ट को संकेत मानिए, अंतिम सच नहीं.\n\nअलग-अलग पक्ष: सरकार, विपक्ष, संस्था, प्रभावित लोगों और स्वतंत्र विशेषज्ञ के दृष्टिकोण को अलग-अलग रखिए.\n\nआगे क्या: दर्शक को बताइए कि अगला दस्तावेज, फैसला, बयान या चुनावी संकेत कौन सा देखना चाहिए.`,
    cta: "अगर आप राजनीति को शोर नहीं, सबूत और संदर्भ से समझना चाहते हैं, तो Politily को फॉलो कीजिए.",
    caution:
      "Do not publish allegations as facts. Separate confirmed records, reported claims, and political spin.",
    citedUrls,
    generatedBy: "template",
    generatedAt: new Date().toISOString(),
  };
}

function normaliseList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean).slice(0, 12);
  }

  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }

  return [];
}

function normaliseEvidenceGrade(value: unknown): PolitilyBrief["evidenceGrade"] {
  const allowed: PolitilyBrief["evidenceGrade"][] = [
    "primary-backed",
    "multi-source",
    "reported",
    "disputed",
    "thin",
  ];
  return allowed.includes(value as PolitilyBrief["evidenceGrade"])
    ? (value as PolitilyBrief["evidenceGrade"])
    : "thin";
}

function normaliseScore(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function normaliseScoreRationale(value: unknown): PolitilyBrief["scoreRationale"] {
  if (!value || typeof value !== "object") {
    return {};
  }

  const record = value as Record<string, unknown>;
  return {
    noveltyScore: stringValue(record.noveltyScore),
    politicalWeight: stringValue(record.politicalWeight),
    geopoliticalRelevance: stringValue(record.geopoliticalRelevance),
    viralPotential: stringValue(record.viralPotential),
    audienceReach: stringValue(record.audienceReach),
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function uniqueSourceLinks(sourceLinks: StorySourceLink[]) {
  const seen = new Set<string>();
  const unique: StorySourceLink[] = [];
  for (const link of sourceLinks) {
    const key = `${link.url}|${link.sourceName}`.toLowerCase();
    if (!link.url || seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(link);
  }

  return unique;
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}
