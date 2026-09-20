import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sources = sqliteTable("sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  url: text("url").notNull(),
  region: text("region").notNull().default("global"),
  category: text("category").notNull().default("politics"),
  biasLean: text("bias_lean").notNull().default("unknown"),
  verificationMethod: text("verification_method").notNull().default(""),
  language: text("language").notNull().default("English"),
  sourceLane: text("source_lane").notNull().default("portal"),
  priority: integer("priority").notNull().default(50),
  active: integer("active").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastCheckedAt: text("last_checked_at"),
  lastError: text("last_error").notNull().default(""),
  lastSuccessAt: text("last_success_at"),
  lastSignalCount: integer("last_signal_count").notNull().default(0),
});

export const stories = sqliteTable("stories", {
  id: text("id").primaryKey(),
  fingerprint: text("fingerprint").notNull().unique(),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  url: text("url").notNull(),
  imageUrl: text("image_url"),
  articleExcerpt: text("article_excerpt"),
  sourceName: text("source_name").notNull(),
  sourceType: text("source_type").notNull().default("web"),
  sourceCountry: text("source_country").notNull().default(""),
  language: text("language").notNull().default(""),
  publishedAt: text("published_at"),
  detectedAt: text("detected_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  tagsJson: text("tags_json").notNull().default("[]"),
  noveltyScore: integer("novelty_score").notNull().default(0),
  politicalWeight: integer("political_weight").notNull().default(0),
  geopoliticalRelevance: integer("geopolitical_relevance").notNull().default(0),
  viralPotential: integer("viral_potential").notNull().default(0),
  sentimentScore: integer("sentiment_score").notNull().default(50),
  totalScore: integer("total_score").notNull().default(0),
  scoringBreakdownJson: text("scoring_breakdown_json").notNull().default("{}"),
  verificationMethod: text("verification_method").notNull().default(""),
  status: text("status").notNull().default("watching"),
  briefJson: text("brief_json"),
  scriptText: text("script_text"),
  emailSentAt: text("email_sent_at"),
});

export const storySources = sqliteTable("story_sources", {
  id: text("id").primaryKey(),
  storyId: text("story_id").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  sourceName: text("source_name").notNull(),
  biasLean: text("bias_lean").notNull().default("unknown"),
  verificationMethod: text("verification_method").notNull().default(""),
  sourceLane: text("source_lane").notNull().default("portal"),
  publishedAt: text("published_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const scanRuns = sqliteTable("scan_runs", {
  id: text("id").primaryKey(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at"),
  status: text("status").notNull().default("running"),
  scannedCount: integer("scanned_count").notNull().default(0),
  createdCount: integer("created_count").notNull().default(0),
  triggeredCount: integer("triggered_count").notNull().default(0),
  emailedCount: integer("emailed_count").notNull().default(0),
  message: text("message").notNull().default(""),
});

export const emailDigests = sqliteTable("email_digests", {
  id: text("id").primaryKey(),
  digestKey: text("digest_key").notNull().unique(),
  slot: text("slot").notNull(),
  sentAt: text("sent_at").notNull(),
  startIso: text("start_iso").notNull(),
  endIso: text("end_iso").notNull(),
  issueCount: integer("issue_count").notNull().default(0),
  storyCount: integer("story_count").notNull().default(0),
  message: text("message").notNull().default(""),
});

export const appLocks = sqliteTable("app_locks", {
  name: text("name").primaryKey(), owner: text("owner").notNull(), expiresAt: text("expires_at").notNull(),
});

export const emailOutbox = sqliteTable("email_outbox", {
  id: text("id").primaryKey(), kind: text("kind").notNull(), storyId: text("story_id"),
  subject: text("subject").notNull(), payloadJson: text("payload_json").notNull(),
  status: text("status").notNull().default("queued"), attempts: integer("attempts").notNull().default(0),
  providerId: text("provider_id"), lastError: text("last_error").notNull().default(""),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(), nextAttemptAt: text("next_attempt_at").notNull(),
  leaseUntil: text("lease_until"), acceptedAt: text("accepted_at"),
});
