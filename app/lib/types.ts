export type SourceType =
  | "gdelt"
  | "rss"
  | "official"
  | "press"
  | "party"
  | "html"
  | "research"
  | "factcheck"
  | "legal";

export type StoryStatus = "watching" | "triggered" | "briefed" | "emailed";

export interface RuntimeEnv {
  DB?: D1Database;
  GEMINI_API_KEY?: string;
  GEMINI_MODEL?: string;
  RESEND_API_KEY?: string;
  ALERT_EMAIL?: string;
  ALERT_FROM_EMAIL?: string;
  APP_BASE_URL?: string;
  POLITILY_SCORE_THRESHOLD?: string;
  POLITILY_MAX_DEEP_BRIEFS_PER_RUN?: string;
  POLITILY_MAX_SOURCES_PER_RUN?: string;
  POLITILY_FETCH_TIMEOUT_MS?: string;
  POLITILY_MIN_STORY_DATE?: string;
}

export interface SignalSource {
  id: string;
  name: string;
  type: SourceType;
  url: string;
  region: string;
  category: string;
  priority: number;
  active: boolean;
  createdAt?: string;
  lastCheckedAt?: string | null;
}

export interface RawSignal {
  title: string;
  summary: string;
  url: string;
  imageUrl?: string | null;
  articleExcerpt?: string | null;
  sourceName: string;
  sourceType: SourceType;
  sourceCountry?: string;
  language?: string;
  publishedAt?: string | null;
  sourceId: string;
  sourcePriority: number;
}

export interface StoryScores {
  noveltyScore: number;
  politicalWeight: number;
  geopoliticalRelevance: number;
  viralPotential: number;
  totalScore: number;
  tags: string[];
}

export interface StoredStory extends StoryScores {
  id: string;
  fingerprint: string;
  title: string;
  summary: string;
  url: string;
  imageUrl?: string | null;
  articleExcerpt?: string | null;
  sourceName: string;
  sourceType: SourceType;
  sourceCountry: string;
  language: string;
  publishedAt: string | null;
  detectedAt: string;
  status: StoryStatus;
  brief?: PolitilyBrief | null;
  scriptText?: string | null;
  emailSentAt?: string | null;
  sourceLinks?: StorySourceLink[];
}

export interface StorySourceLink {
  id: string;
  storyId: string;
  title: string;
  url: string;
  sourceName: string;
  publishedAt: string | null;
  createdAt?: string;
}

export interface PolitilyBrief {
  briefTitle: string;
  hook: string;
  whatHappened: string;
  whyItMatters: string;
  historicalContext: string;
  geographicalContext: string;
  keyPeople: string[];
  factsAndFigures: string[];
  sourceConfidence: string;
  evidenceGrade: "primary-backed" | "multi-source" | "reported" | "disputed" | "thin";
  timeline: string[];
  claimMatrix: string[];
  primaryDocuments: string[];
  missingEvidence: string[];
  regionalContext: string;
  verificationProtocol: string[];
  narratives: string[];
  whatHappensNext: string[];
  audienceReachScore?: number;
  audienceReachReason?: string;
  videoAngles?: string[];
  sourcePositions?: string[];
  scoreRationale?: {
    noveltyScore?: string;
    politicalWeight?: string;
    geopoliticalRelevance?: string;
    viralPotential?: string;
    audienceReach?: string;
  };
  videoScript: string;
  cta: string;
  caution: string;
  citedUrls: string[];
  generatedBy: "gemini" | "template";
  generatedAt: string;
}

export interface ScanRun {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "complete" | "failed";
  scannedCount: number;
  createdCount: number;
  triggeredCount: number;
  emailedCount: number;
  message: string;
}

export interface DashboardState {
  demoMode: boolean;
  generatedAt: string;
  config: {
    threshold: number;
    geminiReady: boolean;
    emailReady: boolean;
    storageReady: boolean;
    model: string;
  };
  stories: StoredStory[];
  sources: SignalSource[];
  runs: ScanRun[];
}

export interface ScanResult {
  run: ScanRun;
  triggeredStories: StoredStory[];
  errors: string[];
}
