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
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": env.GEMINI_API_KEY,
    },
    body: JSON.stringify({
      model,
      input: buildPrompt(story, sourceLinks),
      generation_config: {
        temperature: 0.45,
        thinking_level: "low",
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
    narratives: normaliseList(parsed.narratives),
    whatHappensNext: normaliseList(parsed.whatHappensNext),
    citedUrls: normaliseList(parsed.citedUrls).concat(sourceLinks.map((link) => link.url)).slice(0, 12),
    generatedBy: "gemini",
    generatedAt: new Date().toISOString(),
  };
}

function buildPrompt(story: StoredStory, sourceLinks: StorySourceLink[]) {
  const sources = sourceLinks
    .map((link, index) => `${index + 1}. ${link.sourceName}: ${link.title} - ${link.url}`)
    .join("\n");

  return `You are Politily, an original political education and narrative research assistant for a creator in India.

Create a fact-first, source-aware political brief. Use an original Politily explainer voice: sharp hook, clear context, historical memory, multiple perspectives, and creator-ready structure. Do not imitate any living creator or YouTube channel.

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
  "narratives": ["major perspective or competing interpretation"],
  "whatHappensNext": ["watch item"],
  "videoScript": "structured creator script with hook, context, history, evidence, multiple perspectives, what next, CTA",
  "cta": "short call to action",
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
  const citedUrls = [story.url, ...sourceLinks.map((link) => link.url)].filter(Boolean).slice(0, 10);

  return {
    briefTitle: story.title,
    hook: `This is not just another headline. The political question is who gains power, who loses leverage, and what changes next.`,
    whatHappened: story.summary || `A political signal was detected from ${story.sourceName}.`,
    whyItMatters:
      "The story crossed Politily's scoring threshold, meaning it has a notable mix of novelty, political weight, wider relevance, and narrative potential.",
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
    videoScript:
      `Hook: ${story.title}\n\nContext: Explain what happened, who is involved, and why it matters now.\n\nHistorical background: Compare this with earlier political or institutional moments.\n\nEvidence: Put primary documents and direct statements before commentary.\n\nMultiple perspectives: Show the ruling side, opposition side, institutional view, and citizen impact.\n\nWhat next: End with the next event, decision, or document to watch.`,
    cta: "Follow Politily for political stories with context, sources, and memory.",
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
