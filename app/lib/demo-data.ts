import type { DashboardState, PolitilyBrief, ScanRun, SignalSource, StoredStory } from "./types";
import { DEFAULT_SOURCES } from "./source-library";

const generatedAt = new Date().toISOString();

const demoBrief: PolitilyBrief = {
  briefTitle: "Election Funding Debate Returns To The National Agenda",
  hook:
    "When money enters politics quietly, the biggest story is often not the donation. It is the silence around influence.",
  whatHappened:
    "A fresh political debate has emerged around campaign finance, institutional transparency, and how parties explain their funding sources to voters.",
  whyItMatters:
    "Campaign finance stories connect elections, corporate influence, public trust, and the everyday question of whether policy is shaped by voters or donors.",
  historicalContext:
    "India and several other democracies have repeatedly struggled to balance donor privacy, party funding needs, and a citizen's right to know who finances political power.",
  geographicalContext:
    "The issue has national consequences but can play differently across states where local alliances, business groups, and caste or regional blocs shape political incentives.",
  keyPeople: ["Election officials", "party treasurers", "constitutional courts", "civil society groups"],
  factsAndFigures: [
    "Track the legal instrument involved before making any claim.",
    "Compare the current dispute with earlier court and commission positions.",
    "Separate declared party finance data from allegations and commentary.",
  ],
  sourceConfidence: "Demo brief. Replace with live Gemini generation after setting GEMINI_API_KEY.",
  narratives: [
    "Transparency versus political privacy",
    "Institutional accountability versus party autonomy",
    "Legal compliance versus public trust",
  ],
  whatHappensNext: [
    "Watch official filings and court listings.",
    "Check if parties issue formal responses.",
    "Compare how regional and national media frame the same facts.",
  ],
  videoScript:
    "Hook: Political funding is not just about money. It is about who gets heard after elections. Context: Explain the mechanism, the law, the institutions, and the timeline. Evidence: Put official records first, then add credible reporting. Multiple sides: Show why parties want funding channels and why voters demand transparency. Ending: Ask what reform would protect both democracy and accountability.",
  cta: "Follow Politily for politics explained with context, sources, and memory.",
  caution: "Do not publish allegations unless they are backed by primary documents or multiple credible sources.",
  citedUrls: ["https://www.eci.gov.in/"],
  generatedBy: "template",
  generatedAt,
};

const demoStory: StoredStory = {
  id: "demo_campaign_finance",
  fingerprint: "demo_campaign_finance",
  title: "Campaign finance transparency debate gathers political weight",
  summary:
    "A sample Politily signal showing how a story is scored, researched, and transformed into a creator-ready brief.",
  url: "https://www.eci.gov.in/",
  sourceName: "Demo Source",
  sourceType: "official",
  sourceCountry: "India",
  language: "English",
  publishedAt: generatedAt,
  detectedAt: generatedAt,
  tags: ["election", "finance", "institutions", "india"],
  noveltyScore: 84,
  politicalWeight: 92,
  geopoliticalRelevance: 48,
  viralPotential: 76,
  totalScore: 79,
  status: "briefed",
  brief: demoBrief,
  scriptText: demoBrief.videoScript,
  emailSentAt: null,
  sourceLinks: [
    {
      id: "demo_source_1",
      storyId: "demo_campaign_finance",
      title: "Election Commission of India",
      url: "https://www.eci.gov.in/",
      sourceName: "Election Commission of India",
      publishedAt: generatedAt,
      createdAt: generatedAt,
    },
  ],
};

const demoRun: ScanRun = {
  id: "demo_run",
  startedAt: generatedAt,
  finishedAt: generatedAt,
  status: "complete",
  scannedCount: 128,
  createdCount: 18,
  triggeredCount: 3,
  emailedCount: 0,
  message: "Demo state loaded because persistent storage is not connected.",
};

export function getDemoState(sources: SignalSource[] = DEFAULT_SOURCES): DashboardState {
  return {
    demoMode: true,
    generatedAt: new Date().toISOString(),
    config: {
      threshold: 72,
      geminiReady: false,
      emailReady: false,
      storageReady: false,
      model: "gemini-3.5-flash",
    },
    stories: [demoStory],
    sources,
    runs: [demoRun],
  };
}
