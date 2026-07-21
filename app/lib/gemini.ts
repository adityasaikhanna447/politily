import type { PolitilyBrief, StoredStory, StorySourceLink, RuntimeEnv } from "./types";

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

interface SourceContext {
  sourceName: string;
  url: string;
  title: string;
  excerpt: string;
}

interface GeminiAttempt {
  model: string;
  maxOutputTokens: number;
}

export async function generateBriefWithGemini(
  env: RuntimeEnv,
  story: StoredStory,
  sourceLinks: StorySourceLink[]
): Promise<PolitilyBrief> {
  const compactSources = uniqueSourceLinks(sourceLinks).slice(0, 16);
  const sourceContexts = await fetchSourceContexts(story, compactSources);

  if (!env.GEMINI_API_KEY) {
    return templateBrief(story, sourceLinks, sourceContexts);
  }

  const model = env.GEMINI_MODEL || "gemini-3.5-flash";
  const prompt = buildPrompt(story, compactSources, sourceContexts);
  let lastFailure = "";

  for (const [index, attempt] of geminiAttempts(model).entries()) {
    if (index > 0) {
      await delay(450 + index * 650);
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(attempt.model)}:generateContent`,
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
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              temperature: 0.28,
              maxOutputTokens: attempt.maxOutputTokens,
              responseMimeType: "application/json",
            },
          }),
        }
      );

      if (!response.ok) {
        lastFailure = `HTTP ${response.status}${await shortErrorBody(response)}`;
        if (response.status === 401 || response.status === 403) {
          break;
        }
        continue;
      }

      const payload = (await response.json()) as GeminiGenerateContentResponse;
      const text = payload.candidates
        ?.flatMap((candidate) => candidate.content?.parts ?? [])
        .map((part) => part.text ?? "")
        .join("");
      const parsed = parseBrief(text);
      if (!parsed) {
        lastFailure = "Gemini returned non-JSON output";
        continue;
      }

      return normaliseGeminiBrief(parsed, story, compactSources, sourceContexts, payload, attempt.model);
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : "Gemini request failed";
    }
  }

  return {
    ...templateBrief(story, sourceLinks, sourceContexts),
    sourceConfidence: `Gemini unavailable after retry path (${lastFailure || "unknown error"}). This is a template research draft, not the final deep brief. Retry brief generation in 1-2 minutes.`,
  };
}

function normaliseGeminiBrief(
  parsed: Omit<PolitilyBrief, "generatedBy" | "generatedAt">,
  story: StoredStory,
  compactSources: StorySourceLink[],
  sourceContexts: SourceContext[],
  payload: GeminiGenerateContentResponse,
  model: string
): PolitilyBrief {
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
    researchDepthScore: normaliseScore(parsed.researchDepthScore, story.totalScore),
    dataPoints: normaliseList(parsed.dataPoints),
    researchQuestions: normaliseList(parsed.researchQuestions),
    institutionalContext: String(parsed.institutionalContext || ""),
    accountabilityMap: normaliseList(parsed.accountabilityMap),
    stakeholderMap: normaliseList(parsed.stakeholderMap),
    powerAnalysis: String(parsed.powerAnalysis || ""),
    counterArguments: normaliseList(parsed.counterArguments),
    openQuestions: normaliseList(parsed.openQuestions),
    monitoringQueries: normaliseList(parsed.monitoringQueries),
    noVideoUntil: normaliseList(parsed.noVideoUntil),
    storytellingBeats: normaliseList(parsed.storytellingBeats),
    videoAngles: normaliseList(parsed.videoAngles),
    sourcePositions: normaliseList(parsed.sourcePositions),
    scoreRationale: normaliseScoreRationale(parsed.scoreRationale),
    citedUrls: uniqueStrings(
      normaliseList(parsed.citedUrls)
        .concat(compactSources.map((link) => link.url))
        .concat(sourceContexts.map((context) => context.url))
    ).slice(0, 20),
    tokenUsage: {
      promptTokens: normaliseOptionalNumber(payload.usageMetadata?.promptTokenCount),
      outputTokens: normaliseOptionalNumber(payload.usageMetadata?.candidatesTokenCount),
      totalTokens: normaliseOptionalNumber(payload.usageMetadata?.totalTokenCount),
      model,
    },
    generatedBy: "gemini",
    generatedAt: new Date().toISOString(),
  };
}

function buildPrompt(
  story: StoredStory,
  sourceLinks: StorySourceLink[],
  sourceContexts: SourceContext[]
) {
  const issueFrame = inferIssueFrame(story, sourceLinks);
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

Create a fact-first issue dossier for a newsroom research desk. This is not a newspaper summary. The output must help a political creator decide whether this issue deserves a video today. Use an original Politily explainer voice: sharp hook, clear context, historical memory, multiple perspectives, and creator-ready structure. Do not imitate any living creator or YouTube channel.

Research editor rules:
1. Separate confirmed facts, reported claims, allegations, and political framing.
2. Prefer primary documents, court records, government orders, official statements, parliamentary records, election data, exam authority records, and direct party releases over media summaries.
3. Use agencies and media as triangulation, not as final proof. If PTI/UNI/ANI or a known portal is only repeating an official line, say that.
4. Brief the whole issue cluster, not only the primary URL. Synthesize the source trail into one creator-ready issue dossier.
5. No generic filler. When evidence is missing, name the exact document, dataset, person, institution, hearing, press note, police order, ECI record, affidavit, ministry response, or local source required.
6. Keep all research fields in English. Write videoScript and cta in Roman Hindi/Hinglish only. Do not use Devanagari script.
7. No token compromise. Prefer depth, chronology, data, and hard questions over brevity.
8. Optimize for 12-15 strong daily briefs: every brief must explain whether this deserves a video, why Indian viewers would care, and what angle can travel.
9. Every headline and research field must be in English, even if an original source is in another Indian language.
10. Source positions must say what each source emphasizes, what it adds, and what its limitation is.
11. Do not imitate any living creator, channel, or protected style. Use an original serious Indian political explainer voice.
12. If source text is thin or blocked, clearly label the brief as thin and convert missing facts into a concrete verification plan.
13. If this is an ad-hoc Politily Research Brain query or an upcoming topic, do not pretend a confirmed event happened. Build a critical research memo: current source trail, what is unknown, what must be watched, what would make it video-worthy, and what must be true before spending creator time.

Before writing, ask yourself and answer inside the JSON:
- What exactly happened, where, when, who triggered it, and who responded?
- Why did this escalate now?
- Which institution had power or duty here?
- Who can resign, who cannot practically resign, who can order an inquiry, and what is the real accountability chain?
- What numbers define scale: vote margins, arrests, turnout, affected students, budget, seats, dates, court listings, district data, or legal sections?
- Which side benefits if this narrative spreads?
- What would the strongest critic say, and what would the strongest defence say?
- What primary record would prove or weaken the story?
- What should a creator avoid overclaiming?

Issue package:
Issue: ${issueFrame.label}
Likely topic: ${issueFrame.topic}
Unique sources: ${issueFrame.sourceCount}
Source mix: ${issueFrame.sourceMix}
Briefing objective: ${issueFrame.objective}

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
  "whatHappened": "180-260 words. Plain-language issue summary with exact date/place/actors/trigger/response. Combine related source headlines/excerpts into one event narrative.",
  "whyItMatters": "180-260 words. Political significance for governance, elections, party strategy, rights, public order, youth/public mood, or institution credibility.",
  "historicalContext": "220-380 words. Specific background, previous events, relevant law/policy/election history, and parallels. If unknown, name the exact missing record.",
  "geographicalContext": "places, institutions, regions, constituencies, or international context",
  "keyPeople": ["person or institution"],
  "factsAndFigures": ["8-14 verifiable facts or numbers; if unavailable, name the exact dataset/document needed and why it matters"],
  "sourceConfidence": "how reliable the available source base is",
  "evidenceGrade": "primary-backed | multi-source | reported | disputed | thin",
  "timeline": ["8-12 entries when possible: date or period - event - source/caveat"],
  "claimMatrix": ["8-12 entries: claim - who says it - evidence level - what would verify/refute it"],
  "primaryDocuments": ["official order, court record, filing, statement, dataset, or document to obtain"],
  "missingEvidence": ["specific missing source or unresolved fact"],
  "regionalContext": "state/regional/social/history context needed to understand the story",
  "verificationProtocol": ["step a researcher should do before publishing"],
  "narratives": ["major perspective or competing interpretation"],
  "whatHappensNext": ["watch item"],
  "audienceReachScore": 0,
  "audienceReachReason": "why Indian audience may or may not care",
  "researchDepthScore": 0,
  "dataPoints": ["specific data point, statistic, historical number, date, law section, constituency figure, arrest/count/case detail, or exact dataset to pull"],
  "researchQuestions": ["hard question a serious researcher should ask before scripting"],
  "institutionalContext": "who has formal power, who has political responsibility, what the accountability chain is, and what action is realistically possible",
  "accountabilityMap": ["actor/institution - formal role - political responsibility - evidence needed"],
  "stakeholderMap": ["stakeholder - incentive - public position or likely concern"],
  "powerAnalysis": "who gains, who loses, who controls information, who controls process, and why the timing matters",
  "counterArguments": ["strongest defence/counter-view and what evidence would test it"],
  "openQuestions": ["unanswered but important question"],
  "monitoringQueries": ["exact search query, source, institution, or record to monitor next"],
  "noVideoUntil": ["specific condition that must be met before this is worth a full video"],
  "storytellingBeats": ["creator beat: opening scene, setup, historical turn, evidence turn, counter-view, hard question, what next"],
  "videoAngles": ["specific video angle with hook, audience promise, and why this can/cannot go viral"],
  "sourcePositions": ["source name - what it claims or emphasizes - why it matters or its limitation"],
  "scoreRationale": {
    "noveltyScore": "why novelty score is high or low",
    "politicalWeight": "why political weight matters",
    "geopoliticalRelevance": "why geo relevance matters",
    "viralPotential": "why it can or cannot travel online",
    "audienceReach": "why this reaches Indian viewers"
  },
  "videoScript": "900-1400 words in Roman Hindi/Hinglish, not Devanagari. Structure: cold open, exact event, chronology, historical background, data, institutional accountability, strongest government/defence view, strongest critic/protester/opposition view, what is unverified, why it matters for Indian viewers, what happens next, CTA. Sound like a serious creator research script, not a school assignment.",
  "cta": "short Roman Hindi/Hinglish call to action",
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

function geminiAttempts(primaryModel: string): GeminiAttempt[] {
  const models = uniqueStrings([primaryModel, "gemini-3.5-flash", "gemini-3.1-flash-lite"]);
  const attempts: GeminiAttempt[] = [
    { model: models[0], maxOutputTokens: 8192 },
    { model: models[0], maxOutputTokens: 6144 },
  ];
  if (models[1]) {
    attempts.push({ model: models[1], maxOutputTokens: 6144 });
  }
  if (models[2]) {
    attempts.push({ model: models[2], maxOutputTokens: 4096 });
  }

  return attempts;
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

async function shortErrorBody(response: Response) {
  try {
    const text = await response.text();
    const cleaned = cleanText(text).slice(0, 140);
    return cleaned ? ` - ${cleaned}` : "";
  } catch {
    return "";
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function inferIssueFrame(story: StoredStory, sourceLinks: StorySourceLink[]) {
  const text = `${story.title} ${story.summary} ${story.tags.join(" ")}`.toLowerCase();
  const sources = uniqueStrings([story.sourceName, ...sourceLinks.map((link) => link.sourceName)]);
  const sourceMix = sources.slice(0, 8).join(", ") || story.sourceName || "unknown";

  if (hasAny(text, ["cjp", "cockroach janta party", "sansad chalo", "chalo sansad", "student protest", "paper leak", "neet"])) {
    return {
      label: "CJP / Sansad Chalo youth protest",
      topic: "Youth protest, education accountability, public order, and Parliament-facing pressure",
      sourceCount: sources.length,
      sourceMix,
      objective:
        "Build one creator-ready issue brief: what happened, what is confirmed, who is mobilising, police/government response, student demands, opposition amplification, and viral risk.",
    };
  }

  if (hasAny(text, ["bankipur", "bypoll", "by-election", "byelection", "jan suraaj", "prashant kishor"])) {
    return {
      label: "Bankipur bypoll and Bihar party strategy",
      topic: "Bypoll, BJP prestige seat, Jan Suraaj/PK challenge, RJD/opposition math, Bihar voter mood",
      sourceCount: sources.length,
      sourceMix,
      objective:
        "Build one creator-ready issue brief: why this local seat matters, what each party is trying to signal, candidate/defection story, constituency history to verify, and video virality angle.",
    };
  }

  if (hasAny(text, ["ban", "censorship", "cbfc", "film", "documentary", "public order", "takedown"])) {
    return {
      label: "Culture, censorship, and public-order politics",
      topic: "Film/culture controversy, state power, speech, identity, and propaganda/censorship claims",
      sourceCount: sources.length,
      sourceMix,
      objective:
        "Build one creator-ready issue brief: legal basis, historical/regional context, public-order claim, speech/censorship claim, affected groups, and what would prove propaganda versus verified harm.",
    };
  }

  if (hasAny(text, ["bill", "parliament", "lok sabha", "rajya sabha", "ordinance", "committee", "regulation"])) {
    return {
      label: "Parliament and policy impact",
      topic: "Legislation, policy, governance, rights, industry impact, and opposition framing",
      sourceCount: sources.length,
      sourceMix,
      objective:
        "Build one creator-ready issue brief: what the bill/order changes, who benefits, who objects, primary document checklist, and the strongest public-interest hook.",
    };
  }

  return {
    label: cleanTitle(story.title),
    topic: story.tags.length ? story.tags.join(", ") : "Indian politics",
    sourceCount: sources.length,
    sourceMix,
    objective:
      "Build one creator-ready issue brief: core event, evidence status, competing claims, political relevance, and whether it deserves a video today.",
  };
}

async function fetchSourceContexts(story: StoredStory, sourceLinks: StorySourceLink[]) {
  const targets = uniqueStrings([story.url, ...sourceLinks.map((link) => link.url)])
    .filter(Boolean)
    .slice(0, 7);
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
  const excerpt = cleanText(htmlToText(text)).slice(0, 3600);
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
  return decodeEntities(decodeEntities(value))
    .replace(/&nbsp;|&amp;nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/\bAdvertisement\b/gi, " ")
    .trim();
}

function cleanTitle(value: string) {
  return cleanText(value)
    .replace(/\s+-\s+[^-]{2,40}$/g, "")
    .slice(0, 120);
}

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
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
    researchDepthScore: sourceContexts.length ? 58 : 34,
    dataPoints: [
      `Politily total score: ${story.totalScore}/100`,
      `Political weight: ${story.politicalWeight}/100`,
      `Novelty score: ${story.noveltyScore}/100`,
      `Viral potential: ${story.viralPotential}/100`,
      `Known source trail: ${uniqueStrings([story.sourceName, ...compactSources.map((link) => link.sourceName)]).length} source(s)`,
      "Pull the primary document, official statement, police order, court record, ECI notice, ministry response, or local dataset before recording.",
    ],
    researchQuestions: inferredTopic.researchQuestions,
    institutionalContext: inferredTopic.institutionalContext,
    accountabilityMap: inferredTopic.accountabilityMap,
    stakeholderMap: inferredTopic.stakeholderMap,
    powerAnalysis: inferredTopic.powerAnalysis,
    counterArguments: inferredTopic.counterArguments,
    openQuestions: [
      "What exact primary record proves the central claim?",
      "Which side's framing is being repeated without independent verification?",
      "What number or document would change the story's conclusion?",
    ],
    monitoringQueries: [
      `"${story.title}" official statement`,
      `"${story.title}" court order police order ministry response`,
      `"${story.title}" PTI UNI Reuters Indian Express The Hindu`,
    ],
    noVideoUntil: [
      "At least one primary record or direct official statement is found.",
      "At least two independent source positions explain the same issue without copying one another.",
      "The creator angle has a clear public consequence, accountability question, or document-backed contradiction.",
    ],
    storytellingBeats: inferredTopic.storytellingBeats,
    videoAngles: inferredTopic.videoAngles,
    sourcePositions: compactSources.length
      ? compactSources.map((link) => `${link.sourceName} - emphasizes: ${cleanTitle(link.title)}. Use as a triangulation point, then verify against primary records.`)
      : [`${story.sourceName} - first detected source - needs independent corroboration.`],
    scoreRationale: {
      noveltyScore: `Novelty is ${story.noveltyScore}/100 because Politily compares this signal against recent stored stories.`,
      politicalWeight: `Political weight is ${story.politicalWeight}/100 based on institutions, parties, courts, policy, elections, and public-order terms.`,
      geopoliticalRelevance: `Geopolitical relevance is ${story.geopoliticalRelevance}/100 based on foreign affairs, cross-border, diplomatic, or global reaction signals.`,
      viralPotential: `Viral potential is ${story.viralPotential}/100 based on conflict, personalities, censorship, identity, rights, and shareable public stakes.`,
      audienceReach: `Indian audience reach is estimated at ${story.totalScore}/100 from the combined story score.`,
    },
    videoScript: buildFallbackHindiScript(story, inferredTopic, contextLead),
    cta: "Aap comment me batayein: is mudde par sabse zaroori sawaal evidence ka hai, politics ka hai, ya public impact ka?",
    caution:
      "Do not publish allegations as facts. Separate confirmed records, reported claims, and political spin.",
    citedUrls,
    tokenUsage: {
      promptTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      model: "template-fallback",
    },
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
    researchQuestions: [
      "What exactly happened, on what date, in which institution/place, and who first confirmed it?",
      "Which part is confirmed record and which part is political framing?",
      "Who has formal responsibility and who has only political accountability?",
      "What data point would prove scale or public impact?",
      "Which actor benefits if this narrative dominates the day?",
      "What is the strongest counter-argument from the other side?",
      "What primary document must be opened before recording?",
      "What should the creator avoid overclaiming?",
    ],
    institutionalContext:
      "Identify the institution with formal authority, the official with operational responsibility, the political executive facing accountability, and the record that can prove action or inaction.",
    accountabilityMap: [
      "Primary institution - formal duty - verify through order, notification, filing, or statement.",
      "Political executive/party - public accountability - verify through direct quote and official response.",
      "Affected public group - lived impact - verify through local reporting and direct evidence.",
    ],
    stakeholderMap: [
      "Government or ruling side - wants control, order, and legitimacy.",
      "Opposition or critics - wants accountability and narrative pressure.",
      "Affected public - wants remedy, clarity, and proof.",
      "Media/platform audience - wants a clear conflict and credible evidence.",
    ],
    powerAnalysis:
      "The core power question is who controls the official record, who controls the public narrative, and who pays the political cost if evidence contradicts the dominant framing.",
    counterArguments: [
      "Government/authority defence - the action may be routine, legal, or based on incomplete public information; test it against the exact order and timeline.",
      "Critic/opposition claim - the action may show accountability failure or political misuse; test it against documents, data, and independent reporting.",
    ],
    storytellingBeats: [
      "Cold open: the one fact that makes the audience stop scrolling.",
      "Event: what happened, where, when, and who is involved.",
      "History: the older tension that makes this politically loaded.",
      "Evidence: documents, data, source trail, and what is still missing.",
      "Both sides: strongest defence and strongest criticism.",
      "Hard question: what must be answered before the narrative is trusted.",
      "What next: institution, court, election, street, or party response to watch.",
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
      researchQuestions: [
        "Why did Bankipur become a prestige battle rather than a routine bypoll?",
        "What were the last assembly and Lok Sabha booth/segment margins in this seat?",
        "Who is the BJP candidate, what is their local network, and what is the anti-incumbency risk?",
        "How does Jan Suraaj or PK's entry change vote split versus actual winnability?",
        "Which caste, class, youth, trader, and urban voter blocs matter in Bankipur?",
        "What does the ECI notification and candidate affidavit confirm?",
        "Which local issue is stronger than national party branding here?",
        "What would prove that this bypoll is a state-level mood signal rather than local noise?",
      ],
      institutionalContext:
        "The Election Commission controls schedule, nomination, candidate affidavit, and result data. Parties control candidate selection, campaign resources, and booth machinery. Local voters and turnout decide whether the story is a prestige battle or only media framing.",
      accountabilityMap: [
        "Election Commission - schedule and candidate records - verify through ECI notification and affidavits.",
        "BJP state unit/candidate - seat defence and campaign claim - verify through candidate announcement, past margin, and booth data.",
        "Opposition/Jan Suraaj/RJD - challenge or vote-split claim - verify through candidate list, alliance posture, and local reporting.",
        "Local administration - code of conduct and polling management - verify through official district/ECI updates.",
      ],
      stakeholderMap: [
        "BJP - wants to protect a prestige urban seat and signal organizational control.",
        "Jan Suraaj/PK - wants proof that new politics can disturb established parties.",
        "RJD/opposition - wants anti-incumbency consolidation or BJP vote erosion.",
        "Bankipur voters - evaluate candidate credibility, local services, and party loyalty.",
      ],
      powerAnalysis:
        "The power story is not only who wins; it is who proves narrative strength. BJP needs retention, challengers need momentum, and media wants a symbolic urban Bihar test. The missing proof is vote-share history, booth data, and credible local reporting.",
      counterArguments: [
        "BJP defence: Bankipur may remain a strong organizational seat; test through past margins and booth-level strength.",
        "Challenger claim: a bypoll can expose anti-incumbency; test through candidate credibility, turnout, and vote split.",
        "Skeptical view: one bypoll may not predict Bihar mood; test by comparing similar urban seats and turnout patterns.",
      ],
      storytellingBeats: [
        "Open with why one Patna seat is suddenly being treated like a prestige test.",
        "Explain Bankipur's past result, margin, and party hold.",
        "Introduce candidates and the PK/Jan Suraaj or opposition factor.",
        "Show data needed: ECI records, turnout, vote share, affidavits.",
        "Compare BJP's strength claim with opposition's vote-split or anti-incumbency claim.",
        "End with what polling day turnout will reveal.",
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
      researchQuestions: [
        "What was the exact protest call, route, date, demand list, and organiser statement?",
        "What did Delhi Police permit, restrict, detain, or cite legally?",
        "Which education/exam grievance triggered the mobilization and what is verified?",
        "Why is the Education Minister politically accountable, and what can/cannot he directly resign over or order administratively?",
        "Which institution has formal power: ministry, NTA/exam body, court, police, Parliament, or state administration?",
        "How many students/protesters were involved according to police, organisers, and independent reporting?",
        "Who benefits politically from framing this as youth anger, law-and-order breakdown, or opposition-backed protest?",
        "What primary record would separate real grievance from propaganda or exaggeration?",
      ],
      institutionalContext:
        "Education protest accountability usually sits across multiple layers: exam authority or institution handles operational failures, the ministry faces political responsibility and can order reviews or reforms, courts can supervise legality, police control protest restrictions, and Parliament/opposition converts grievance into national pressure. A minister's resignation is political, not an automatic legal remedy; the stronger research question is what action, inquiry, or reform the institution can formally order.",
      accountabilityMap: [
        "Education Ministry - political responsibility and policy direction - verify through ministry statements, Parliament replies, inquiry orders, and reform notices.",
        "Exam authority/institution - operational accountability - verify through official notices, result/cancellation data, and grievance records.",
        "Delhi Police - public-order restrictions or detentions - verify through police order, FIR, detention count, and legal section cited.",
        "Protest organisers/students - demands and scale - verify through memorandum, route call, live footage, and independent ground reporting.",
        "Opposition parties - amplification or support - verify through direct statements and Parliament action.",
      ],
      stakeholderMap: [
        "Students - want accountability, exam fairness, jobs/education security, and dignity.",
        "Education Ministry/exam bodies - want institutional credibility and damage control.",
        "Delhi Police/administration - want public-order control and legal defensibility.",
        "Opposition - wants to turn youth anger into national accountability pressure.",
        "Ruling party - wants to avoid the story becoming a symbol of governance failure.",
      ],
      powerAnalysis:
        "The power conflict is between street pressure and institutional control. Students control moral visibility, police control physical space, the ministry controls policy response, and parties control amplification. The viral risk rises when a young-person grievance meets force, silence, or a dismissive political quote.",
      counterArguments: [
        "Government/authority defence: restrictions may be public-order measures and grievances may already be under review; test through orders and ministry records.",
        "Protester claim: the system ignores students until pressure rises; test through chronology of complaints, meetings, notices, and outcomes.",
        "Propaganda risk: party amplification may distort scale; test through independent ground reporting and direct student demands.",
      ],
      storytellingBeats: [
        "Open with the visual: students marching toward power and police/state response.",
        "Name the exact grievance and protest demand.",
        "Build chronology from exam issue to mobilisation.",
        "Explain which institution is actually accountable for what.",
        "Show both sides: public order versus youth accountability.",
        "Ask the hard question: reform, inquiry, resignation, or narrative management?",
        "End with what official action would prove seriousness.",
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
      researchQuestions: [
        "What exactly changes in the bill compared with the previous law or status quo?",
        "Which ministry introduced it and what problem does the statement of objects claim to solve?",
        "Who gains power, compliance burden, money, protection, or legal risk?",
        "Which citizen, state, company, community, or institution is directly affected?",
        "What does the opposition or civil-society critique say, and is it based on the text?",
        "Was it referred to a committee, debated, amended, or rushed?",
        "Which court judgments, earlier laws, or policy failures form the background?",
        "What line in the bill should the creator show on screen?",
      ],
      institutionalContext:
        "Parliament can pass the law, the ministry frames the objective and rules, regulators or state agencies may enforce it, courts test constitutionality, and citizens/industry experience the practical impact. The research must separate bill text from political speeches about the bill.",
      accountabilityMap: [
        "Sponsoring ministry - policy intent and rule-making - verify through bill text, statement of objects, and press note.",
        "Parliament - legislative scrutiny - verify through debate, committee referral, and amendment record.",
        "Regulator/state agency - enforcement power - verify through clauses and delegated rules.",
        "Affected public/industry - impact claim - verify through stakeholder statements and independent data.",
      ],
      stakeholderMap: [
        "Government - wants reform, regulation, or political messaging.",
        "Opposition - wants scrutiny, rights/federalism/industry concerns, or delay.",
        "Affected industry/public - wants clarity on cost, rights, compliance, and risk.",
        "Courts/legal experts - test constitutional and procedural questions.",
      ],
      powerAnalysis:
        "The power shift usually sits in enforcement, discretion, penalties, exemptions, or rule-making. A creator should show the clause that moves power, then explain who benefits and who loses bargaining power.",
      counterArguments: [
        "Government defence: the bill solves a real policy gap; test through data and the statement of objects.",
        "Critic claim: the bill may overreach or centralise power; test through exact clauses and legal precedent.",
        "Industry/public concern: compliance may harm smaller players or citizens; test through cost and affected-group data.",
      ],
      storytellingBeats: [
        "Open with one concrete life/business/governance impact.",
        "Show the exact bill change in simple language.",
        "Explain the older legal or political problem.",
        "Name winners, losers, and enforcement power.",
        "Compare government claim with strongest critique.",
        "End with committee/court/rule-making watch items.",
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

  return `Hook: Aaj ka mudda hai - ${story.title}

Pehla sawaal: yeh sirf ek headline hai, ya politics me koi real signal? Politily is story ko ${story.totalScore}/100 score deta hai, lekin score final truth nahi hota. Final video tabhi banana chahiye jab source trail, primary record, aur local impact teenon line up ho jaayein.

Kya hua: available sources ke hisaab se, ${context}

Why it matters: ${topic.whyItMatters}

History aur context: ${topic.historicalContext}

Institutional accountability: ${topic.institutionalContext}

Evidence line: abhi isse final proof mat maaniye. Pehle primary document, official statement, agency copy, aur regional reporting compare karni hogi. Agar police order, ECI notice, court record, ministry reply, ya candidate affidavit missing hai, to script me clearly bolna hoga ki evidence thin hai.

Power question: ${topic.powerAnalysis}

Donon side: Ek side kahegi ki authority ya party apna legal/political kaam kar rahi hai. Doosri side kahegi ki accountability, public anger, ya misuse of power ka sawaal hai. Creator ka kaam dono framing ko repeat karna nahi, balki document aur data se test karna hai.

Hard questions: ${topic.researchQuestions.slice(0, 4).join(" ")}

Aage kya dekhna hai: ${topic.whatHappensNext.join(" ")}

CTA: Comment me batayein, is mudde par sabse zaroori sawaal evidence ka hai, politics ka hai, ya public impact ka?`;

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
    return value.map(String).filter(Boolean).slice(0, 20);
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

function normaliseOptionalNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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
