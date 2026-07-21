import type { PolitilyBrief, StoredStory, StorySourceLink, RuntimeEnv } from "./types";

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

interface SourceContext {
  sourceName: string;
  url: string;
  title: string;
  excerpt: string;
}

export async function generateBriefWithGemini(
  env: RuntimeEnv,
  story: StoredStory,
  sourceLinks: StorySourceLink[]
): Promise<PolitilyBrief> {
  const compactSources = uniqueSourceLinks(sourceLinks).slice(0, 8);
  const sourceContexts = await fetchSourceContexts(story, compactSources);

  if (!env.GEMINI_API_KEY) {
    return templateBrief(story, sourceLinks, sourceContexts);
  }

  const model = env.GEMINI_MODEL || "gemini-3.5-flash";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: buildPrompt(story, compactSources, sourceContexts) }],
        },
      ],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 2400,
        responseMimeType: "application/json",
      },
    }),
    }
  );

  if (!response.ok) {
    return {
      ...templateBrief(story, sourceLinks, sourceContexts),
      sourceConfidence: `Gemini request failed with HTTP ${response.status}. Template brief generated instead.`,
    };
  }

  const payload = (await response.json()) as GeminiGenerateContentResponse;
  const text = payload.candidates
    ?.flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => part.text ?? "")
    .join("");
  const parsed = parseBrief(text);
  if (!parsed) {
    return {
      ...templateBrief(story, sourceLinks, sourceContexts),
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
    citedUrls: uniqueStrings(
      normaliseList(parsed.citedUrls)
        .concat(compactSources.map((link) => link.url))
        .concat(sourceContexts.map((context) => context.url))
    ).slice(0, 12),
    generatedBy: "gemini",
    generatedAt: new Date().toISOString(),
  };
}

function buildPrompt(
  story: StoredStory,
  sourceLinks: StorySourceLink[],
  sourceContexts: SourceContext[]
) {
  const sources = sourceLinks
    .map((link, index) => `${index + 1}. ${link.sourceName}: ${link.title} - ${link.url}`)
    .join("\n");
  const contexts = sourceContexts
    .map(
      (context, index) =>
        `${index + 1}. ${context.sourceName} - ${context.title}\nURL: ${context.url}\nExcerpt: ${context.excerpt}`
    )
    .join("\n\n");

  return `You are Politily, an original political education and narrative research assistant for a creator in India.

Create a concise, fact-first, source-aware political brief for a newsroom research desk. The output must help a political creator decide whether this is worth a video today. Use an original Politily explainer voice: sharp hook, clear context, historical memory, multiple perspectives, and creator-ready structure. Do not imitate any living creator or YouTube channel.

Priority rules:
1. Separate confirmed facts, reported claims, allegations, and political framing.
2. Prefer primary documents, court records, government orders, official statements, parliamentary records, and direct party releases over media summaries.
3. Use agencies and media as triangulation, not as final proof.
4. If a story needs historical context, name the real institutional, regional, social, or party tension and say exactly what still needs verification.
5. If the source base is thin, say so clearly. Do not invent facts, dates, laws, people, numbers, or quotes.
6. Keep all research fields in English. Write only videoScript and cta in Hindi using Devanagari script.
7. Optimize for 12-15 daily briefs: avoid repetition and prioritize evidence, competing claims, Indian audience reach, and creator strategy.
8. Every headline and research field must be in English, even if an original source is in another Indian language.
9. Avoid generic filler like "identify the law" or "verify the source" unless you also name the specific document, institution, party, person, or missing fact.

Story:
Title: ${story.title}
Summary: ${story.summary}
News snippet/article excerpt: ${story.articleExcerpt || story.summary || "No article excerpt stored yet."}
Primary URL: ${story.url}
Image/thumbnail URL: ${story.imageUrl || "No image captured."}
Source: ${story.sourceName}
Country/language: ${story.sourceCountry || "unknown"} / ${story.language || "unknown"}
Scores: novelty ${story.noveltyScore}, political weight ${story.politicalWeight}, geopolitical relevance ${story.geopoliticalRelevance}, viral potential ${story.viralPotential}, total ${story.totalScore}
Tags: ${story.tags.join(", ")}

Sources:
${sources || "No secondary sources yet. Be careful and say what needs verification."}

Fetched source/page excerpts:
${contexts || "No fetched source text was available. Use only the title, URL, and source trail, and clearly label the evidence as thin."}

Return only valid JSON with this exact shape:
{
  "briefTitle": "short title",
  "hook": "one strong opening line that names the core political tension",
  "whatHappened": "plain-language event summary with the specific bill, protest, party move, court action, or policy event",
  "whyItMatters": "political significance for governance, elections, party strategy, rights, public order, or youth/public mood",
  "historicalContext": "specific background and parallels; if unknown, name the exact missing record instead of writing generic advice",
  "geographicalContext": "places, institutions, regions, constituencies, or international context",
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
  "videoAngles": ["specific video angle with hook and audience promise"],
  "sourcePositions": ["source name - what it claims or emphasizes - why it matters or its limitation"],
  "scoreRationale": {
    "noveltyScore": "why novelty score is high or low",
    "politicalWeight": "why political weight matters",
    "geopoliticalRelevance": "why geo relevance matters",
    "viralPotential": "why it can or cannot travel online",
    "audienceReach": "why this reaches Indian viewers"
  },
  "videoScript": "Hindi Devanagari structured creator script with hook, context, history, evidence, multiple perspectives, what next, CTA. Sound like a serious explainer, not a school assignment.",
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

async function fetchSourceContexts(story: StoredStory, sourceLinks: StorySourceLink[]) {
  const targets = uniqueStrings([story.url, ...sourceLinks.map((link) => link.url)])
    .filter(Boolean)
    .slice(0, 4);
  const sourceNameByUrl = new Map<string, string>();
  sourceNameByUrl.set(story.url, story.sourceName);
  sourceLinks.forEach((link) => sourceNameByUrl.set(link.url, link.sourceName));

  const results = await Promise.allSettled(
    targets.map((url) => fetchSourceContext(url, sourceNameByUrl.get(url) || "Source"))
  );

  return results
    .filter((result): result is PromiseFulfilledResult<SourceContext | null> => result.status === "fulfilled")
    .map((result) => result.value)
    .filter((context): context is SourceContext => Boolean(context));
}

async function fetchSourceContext(url: string, sourceName: string): Promise<SourceContext | null> {
  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml,text/plain",
      "User-Agent": "Politily/0.1 research-context-fetcher",
    },
  }, 5000);

  if (!response.ok) {
    return null;
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
    return null;
  }

  const text = await response.text();
  const title = cleanText(extractTitle(text) || sourceName);
  const excerpt = cleanText(htmlToText(text)).slice(0, 2600);
  if (excerpt.length < 120) {
    return null;
  }

  return { sourceName, url, title, excerpt };
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function extractTitle(html: string) {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
}

function htmlToText(html: string) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h1|h2|h3|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
}

function cleanText(value: string) {
  return decodeEntities(value)
    .replace(/\s+/g, " ")
    .replace(/\bAdvertisement\b/gi, " ")
    .trim();
}

function templateBrief(
  story: StoredStory,
  sourceLinks: StorySourceLink[],
  sourceContexts: SourceContext[] = []
): PolitilyBrief {
  const compactSources = uniqueSourceLinks(sourceLinks).slice(0, 8);
  const citedUrls = uniqueStrings([
    story.url,
    ...compactSources.map((link) => link.url),
    ...sourceContexts.map((context) => context.url),
  ].filter(Boolean)).slice(0, 10);
  const strongestContext = sourceContexts[0];
  const contextLead = strongestContext
    ? `${strongestContext.sourceName} page indicates: ${strongestContext.excerpt.slice(0, 520)}`
    : story.articleExcerpt || story.summary || `A political signal was detected from ${story.sourceName}.`;
  const inferredTopic = inferStoryTopic(story);

  return {
    briefTitle: story.title,
    hook: `${inferredTopic.hook} The key is whether this is only a headline, or a real shift in power, policy, or public mood.`,
    whatHappened: contextLead,
    whyItMatters:
      inferredTopic.whyItMatters,
    historicalContext:
      inferredTopic.historicalContext,
    geographicalContext:
      story.sourceCountry ||
      "Map the constituency, state, institution, affected public group, and any national political implication before scripting the final video.",
    keyPeople: inferredTopic.keyPeople,
    factsAndFigures: [
      `Politily total score: ${story.totalScore}/100`,
      `Political weight: ${story.politicalWeight}/100`,
      `Novelty score: ${story.noveltyScore}/100`,
      `Known source trail: ${uniqueStrings([story.sourceName, ...compactSources.map((link) => link.sourceName)]).length} source(s)`,
    ],
    sourceConfidence:
      sourceContexts.length
        ? "Fallback mode with fetched source text. Use as a research draft only; verify primary documents and compare at least two independent reports before publishing."
        : "Fallback mode with thin source context. Do not publish as fact until primary documents and independent reports are checked.",
    evidenceGrade: "thin",
    timeline: [
      `Detected - ${story.title} - initial source: ${story.sourceName}`,
      ...inferredTopic.timeline,
    ],
    claimMatrix: [
      `Main event - detected through ${story.sourceName} - verify against original document, direct quote, or official record.`,
      ...inferredTopic.claimMatrix,
    ],
    primaryDocuments: inferredTopic.primaryDocuments,
    missingEvidence: [
      "Full primary document or official statement behind the headline.",
      "Independent corroboration from at least two credible sources with different incentives.",
      "Local/regional reporting that explains ground impact, not only Delhi/national framing.",
    ],
    regionalContext:
      inferredTopic.regionalContext,
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
      ...inferredTopic.whatHappensNext,
    ],
    audienceReachScore: story.totalScore,
    audienceReachReason:
      inferredTopic.audienceReachReason,
    videoAngles: inferredTopic.videoAngles,
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
    videoScript: buildFallbackHindiScript(story, inferredTopic, contextLead),
    cta: "अगर आप राजनीति को शोर नहीं, सबूत और संदर्भ से समझना चाहते हैं, तो Politily को फॉलो कीजिए.",
    caution:
      "Do not publish allegations as facts. Separate confirmed records, reported claims, and political spin.",
    citedUrls,
    generatedBy: "template",
    generatedAt: new Date().toISOString(),
  };
}

function inferStoryTopic(story: StoredStory) {
  const text = `${story.title} ${story.summary} ${story.tags.join(" ")}`.toLowerCase();
  const base = {
    hook: "This story is a political signal, not just a news item.",
    whyItMatters:
      "It matters because it can affect public trust, party positioning, governance accountability, or voter perception.",
    historicalContext:
      "The deeper context should be built from the related institution, earlier policy decisions, party positions, and previous public reactions.",
    regionalContext:
      "Map the affected place, institution, community, and political stakeholders before making a public narrative.",
    keyPeople: ["Primary institution", "ruling side", "opposition response", "affected public group", "independent expert"],
    timeline: ["Next - compare official record, agency report, national media, and regional reporting."],
    claimMatrix: [
      "Political meaning - may be framed differently by government, opposition, affected groups, and media - compare all positions.",
    ],
    primaryDocuments: [
      "Official order, notification, bill text, court record, election notice, press release, or party statement connected to the story.",
    ],
    whatHappensNext: [
      "Watch for direct statements from named institutions or parties.",
      "Check whether regional reporting confirms ground impact.",
    ],
    audienceReachReason:
      "Indian audience reach depends on whether the issue has a clear public consequence, political conflict, identity/election angle, or document-backed revelation.",
    videoAngles: [
      "Explain what happened, what is verified, what is still a claim, and who benefits if this narrative spreads.",
    ],
  };

  if (text.includes("bankipur") || text.includes("bypoll") || text.includes("by-election")) {
    return {
      ...base,
      hook: "Bankipur is not just a local bypoll; it can become a test of BJP strength, opposition coordination, and Bihar political mood.",
      whyItMatters:
        "A bypoll can reveal whether party machinery, candidate choice, caste/community networks, and local anti-incumbency are moving before a bigger election cycle.",
      historicalContext:
        "Bankipur needs constituency history, previous winners, party margins, caste/community composition, student-politics legacy, and why the seat became vacant.",
      regionalContext:
        "Focus on Patna/Bankipur, Bihar BJP organization, Jan Suraaj/RJD positioning, local candidate credibility, and whether the contest is triangular.",
      keyPeople: ["BJP candidate", "Jan Suraaj leadership", "RJD/local opposition", "Election Commission", "Bankipur voters"],
      timeline: [
        "Check ECI schedule - nomination, polling, and counting dates.",
        "Track candidate changes, campaigner list, local alliances, and opposition reactions.",
      ],
      claimMatrix: [
        "BJP strength claim - party/campaign framing - verify through candidate list, past margins, and booth-level/local reporting.",
        "Opposition opportunity claim - opposition/strategist framing - verify through alliances, turnout, and local candidate credibility.",
      ],
      primaryDocuments: [
        "Election Commission bypoll notification and candidate affidavits.",
        "Party candidate announcement and star campaigner list.",
        "Previous Bankipur election result and margin data.",
      ],
      whatHappensNext: [
        "Watch BJP campaigner deployment and candidate messaging.",
        "Track RJD/Jan Suraaj coordination or vote split.",
        "Check polling day turnout and booth-level swing signals.",
      ],
      audienceReachReason:
        "Reach is strong for Indian viewers if framed as a small-seat test of BJP organization, opposition strategy, and Bihar's next political mood.",
      videoAngles: [
        "Bankipur bypoll: why one Patna seat can become a BJP vs opposition stress test.",
        "Candidate switch, local history, and vote split: what Bankipur tells us before bigger Bihar politics.",
      ],
    };
  }

  if (
    text.includes("cjp") ||
    text.includes("cockroach janta party") ||
    text.includes("sansad chalo") ||
    text.includes("chalo sansad") ||
    text.includes("student protest") ||
    text.includes("paper leak")
  ) {
    return {
      ...base,
      hook: "A student/youth protest becomes politically serious when it moves from online anger to street mobilization and Parliament-facing pressure.",
      whyItMatters:
        "The issue can affect youth sentiment, education accountability, opposition framing, police/public-order debate, and the government's handling of dissent.",
      historicalContext:
        "Build the timeline from exam leak allegations, verified student distress claims, court/government remarks, protest calls, police permissions, and prior student movements.",
      regionalContext:
        "Map Delhi protest sites, student networks, state-level spillover, police response, and whether opposition parties or civil-society figures are amplifying it.",
      keyPeople: ["Student protest organisers", "Education Ministry", "Delhi Police", "opposition leaders", "affected students"],
      timeline: [
        "Check protest call and route details.",
        "Verify police action, detentions, injuries, restrictions, and government response from multiple sources.",
      ],
      claimMatrix: [
        "Protester claim - education accountability and youth anger - verify with demands, memoranda, and affected-student evidence.",
        "Government/public-order claim - law and order management - verify through police statements and administrative orders.",
      ],
      primaryDocuments: [
        "Protest organisers' official demands or statement.",
        "Police order, detention/arrest record, or official press note.",
        "Education Ministry or exam authority statement.",
      ],
      whatHappensNext: [
        "Watch whether government opens formal dialogue.",
        "Track opposition response inside Parliament.",
        "Check whether the protest spreads to other cities or campuses.",
      ],
      audienceReachReason:
        "Reach is high for Indian viewers when youth anger, exams/jobs, police response, and Parliament politics meet in one story.",
      videoAngles: [
        "CJP/Sansad Chalo: youth anger, exam accountability, and the politics of protest.",
        "What is confirmed, what is rumour, and why student protests can reshape political narratives.",
      ],
    };
  }

  if (text.includes("bill") || text.includes("parliament") || text.includes("lok sabha") || text.includes("rajya sabha")) {
    return {
      ...base,
      hook: "A Bill matters when it changes incentives for citizens, companies, states, courts, or the ruling party's governance story.",
      whyItMatters:
        "Parliamentary stories can become strong explainers when the bill has public impact, industry winners/losers, federal tension, rights questions, or electoral messaging.",
      historicalContext:
        "Compare the bill with earlier law, committee reports, court cases, industry/public objections, and the government's previous policy stance.",
      regionalContext:
        "Map which states, industries, ministries, courts, or citizen groups are likely to be affected.",
      keyPeople: ["Sponsoring ministry", "Parliament", "affected industry/public group", "opposition parties", "legal/policy experts"],
      timeline: [
        "Check bill introduction date, current parliamentary stage, and committee status.",
        "Compare bill text with previous law or policy.",
      ],
      claimMatrix: [
        "Government claim - reform/regulation/accountability - verify through bill text and statement of objects.",
        "Critic claim - rights/federal/industry concern - verify through committee notes, expert analysis, or stakeholder response.",
      ],
      primaryDocuments: [
        "Official bill text and statement of objects and reasons.",
        "PRS bill summary and legislative status.",
        "Ministry press note or parliamentary debate record.",
      ],
      whatHappensNext: [
        "Watch committee referral, debate, amendments, and stakeholder reactions.",
        "Check whether opposition turns it into a public campaign issue.",
      ],
      audienceReachReason:
        "Reach improves when the bill can be explained through direct public consequences, money/jobs/rights impact, or a clear conflict between government and affected groups.",
      videoAngles: [
        "What the bill actually changes, who benefits, who worries, and what must be verified in the text.",
      ],
    };
  }

  return base;
}

function buildFallbackHindiScript(
  story: StoredStory,
  topic: ReturnType<typeof inferStoryTopic>,
  contextLead: string
) {
  const context = contextLead.replace(/\s+/g, " ").slice(0, 420);

  return `हुक: आज का मुद्दा है - ${story.title}

पहला सवाल: यह सिर्फ खबर है या राजनीति में कोई असली संकेत? Politily score इसे ${story.totalScore}/100 पर रखता है, इसलिए इसे सीधे वायरल दावा मानने से पहले सबूत देखना जरूरी है.

क्या हुआ: उपलब्ध स्रोत के अनुसार, ${context}

क्यों मायने रखता है: ${topic.whyItMatters}

इतिहास और संदर्भ: ${topic.historicalContext}

सबूत की लाइन: अभी इसे final truth नहीं बोलना है. पहले primary document, official statement, agency report, और regional reporting मिलाकर देखनी होगी.

दोनों पक्ष: एक तरफ इसे governance/accountability की कहानी बताया जा सकता है. दूसरी तरफ ruling party, opposition, affected people और institutions इसे अलग-अलग तरीके से frame कर सकते हैं.

आगे क्या देखें: ${topic.whatHappensNext.join(" ")}

CTA: कमेंट में बताइए, इस मुद्दे पर आपको सबसे जरूरी सवाल क्या लगता है - evidence, politics, या public impact?`;
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
