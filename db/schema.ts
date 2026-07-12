import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sources = sqliteTable("sources", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  url: text("url").notNull(),
  region: text("region").notNull().default("global"),
  category: text("category").notNull().default("politics"),
  priority: integer("priority").notNull().default(50),
  active: integer("active").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastCheckedAt: text("last_checked_at"),
});

export const stories = sqliteTable("stories", {
  id: text("id").primaryKey(),
  fingerprint: text("fingerprint").notNull().unique(),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  url: text("url").notNull(),
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
  totalScore: integer("total_score").notNull().default(0),
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
