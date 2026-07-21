import { DEFAULT_SOURCES } from "./source-library";
import type {
  DashboardState,
  PolitilyBrief,
  ScanRun,
  SignalSource,
  StorySourceLink,
  StoredStory,
  StoryStatus,
} from "./types";

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    url TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT 'global',
    category TEXT NOT NULL DEFAULT 'politics',
    priority INTEGER NOT NULL DEFAULT 50,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_checked_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS stories (
    id TEXT PRIMARY KEY,
    fingerprint TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL,
    image_url TEXT,
    article_excerpt TEXT,
    source_name TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'web',
    source_country TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT '',
    published_at TEXT,
    detected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    tags_json TEXT NOT NULL DEFAULT '[]',
    novelty_score INTEGER NOT NULL DEFAULT 0,
    political_weight INTEGER NOT NULL DEFAULT 0,
    geopolitical_relevance INTEGER NOT NULL DEFAULT 0,
    viral_potential INTEGER NOT NULL DEFAULT 0,
    total_score INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'watching',
    brief_json TEXT,
    script_text TEXT,
    email_sent_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS story_sources (
    id TEXT PRIMARY KEY,
    story_id TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    source_name TEXT NOT NULL,
    published_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS scan_runs (
    id TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    scanned_count INTEGER NOT NULL DEFAULT 0,
    created_count INTEGER NOT NULL DEFAULT 0,
    triggered_count INTEGER NOT NULL DEFAULT 0,
    emailed_count INTEGER NOT NULL DEFAULT 0,
    message TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS stories_total_score_idx ON stories (total_score DESC)`,
  `CREATE INDEX IF NOT EXISTS stories_detected_at_idx ON stories (detected_at DESC)`,
  `CREATE INDEX IF NOT EXISTS story_sources_story_id_idx ON story_sources (story_id)`,
];

const legacySourceIdsToPause = [
  "gdelt-india-politics",
  "gdelt-global-politics",
  "pib-feed-slot",
];

const storyColumnMigrations = [
  { name: "image_url", sql: "ALTER TABLE stories ADD COLUMN image_url TEXT" },
  { name: "article_excerpt", sql: "ALTER TABLE stories ADD COLUMN article_excerpt TEXT" },
];

type Row = Record<string, unknown>;

export function newId(prefix: string) {
  const random = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

export async function ensureDatabase(db: D1Database) {
  await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
  await migrateStoryColumns(db);
  await seedSources(db);
}

async function migrateStoryColumns(db: D1Database) {
  const result = await db.prepare("PRAGMA table_info(stories)").all<Row>();
  const columns = new Set(result.results.map((row) => String(row.name)));
  const missing = storyColumnMigrations.filter((migration) => !columns.has(migration.name));

  if (missing.length) {
    await db.batch(missing.map((migration) => db.prepare(migration.sql)));
  }
}

export async function markStaleRunsFailed(db: D1Database, olderThanMinutes = 10) {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000).toISOString();
  await db
    .prepare(
      `UPDATE scan_runs
      SET finished_at = ?, status = ?, message = ?
      WHERE status = ? AND started_at < ?`
    )
    .bind(
      new Date().toISOString(),
      "failed",
      "Scan timed out before completion. The next scheduled scan will continue with a smaller source batch.",
      "running",
      cutoff
    )
    .run();
}

async function seedSources(db: D1Database) {
  await db.batch(
    DEFAULT_SOURCES.map((source) =>
      db
        .prepare(
          `INSERT INTO sources
          (id, name, type, url, region, category, priority, active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            type = excluded.type,
            url = excluded.url,
            region = excluded.region,
            category = excluded.category,
            priority = excluded.priority,
            active = excluded.active`
        )
        .bind(
          source.id,
          source.name,
          source.type,
          source.url,
          source.region,
          source.category,
          source.priority,
          source.active ? 1 : 0
        )
    )
  );

  await db.batch(
    legacySourceIdsToPause.map((id) =>
      db.prepare("UPDATE sources SET active = 0 WHERE id = ?").bind(id)
    )
  );
}

export async function listSources(db: D1Database): Promise<SignalSource[]> {
  const result = await db
    .prepare("SELECT * FROM sources ORDER BY active DESC, priority DESC, name ASC")
    .all<Row>();

  return result.results.map(toSource);
}

export async function updateSourceChecked(db: D1Database, id: string) {
  await db
    .prepare("UPDATE sources SET last_checked_at = ? WHERE id = ?")
    .bind(new Date().toISOString(), id)
    .run();
}

export async function createRun(db: D1Database): Promise<ScanRun> {
  const run: ScanRun = {
    id: newId("run"),
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: "running",
    scannedCount: 0,
    createdCount: 0,
    triggeredCount: 0,
    emailedCount: 0,
    message: "",
  };

  await db
    .prepare(
      `INSERT INTO scan_runs
      (id, started_at, status, scanned_count, created_count, triggered_count, emailed_count, message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      run.id,
      run.startedAt,
      run.status,
      run.scannedCount,
      run.createdCount,
      run.triggeredCount,
      run.emailedCount,
      run.message
    )
    .run();

  return run;
}

export async function finishRun(
  db: D1Database,
  run: ScanRun,
  updates: Partial<ScanRun>
): Promise<ScanRun> {
  const finished: ScanRun = {
    ...run,
    ...updates,
    finishedAt: new Date().toISOString(),
  };

  await db
    .prepare(
      `UPDATE scan_runs
      SET finished_at = ?, status = ?, scanned_count = ?, created_count = ?,
          triggered_count = ?, emailed_count = ?, message = ?
      WHERE id = ?`
    )
    .bind(
      finished.finishedAt,
      finished.status,
      finished.scannedCount,
      finished.createdCount,
      finished.triggeredCount,
      finished.emailedCount,
      finished.message,
      finished.id
    )
    .run();

  return finished;
}

export async function getStoryByFingerprint(
  db: D1Database,
  fingerprint: string
): Promise<StoredStory | null> {
  const row = await db
    .prepare("SELECT * FROM stories WHERE fingerprint = ?")
    .bind(fingerprint)
    .first<Row>();

  return row ? toStory(row) : null;
}

export async function getStoryById(
  db: D1Database,
  id: string
): Promise<StoredStory | null> {
  const row = await db.prepare("SELECT * FROM stories WHERE id = ?").bind(id).first<Row>();
  if (!row) {
    return null;
  }

  const story = toStory(row);
  story.sourceLinks = await listStorySources(db, story.id);
  return story;
}

export async function insertStory(db: D1Database, story: StoredStory) {
  await db
    .prepare(
      `INSERT OR IGNORE INTO stories
      (id, fingerprint, title, summary, url, image_url, article_excerpt, source_name, source_type,
       source_country, language, published_at, detected_at, tags_json,
       novelty_score, political_weight, geopolitical_relevance, viral_potential,
       total_score, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      story.id,
      story.fingerprint,
      story.title,
      story.summary,
      story.url,
      story.imageUrl ?? null,
      story.articleExcerpt ?? null,
      story.sourceName,
      story.sourceType,
      story.sourceCountry,
      story.language,
      story.publishedAt,
      story.detectedAt,
      JSON.stringify(story.tags),
      story.noveltyScore,
      story.politicalWeight,
      story.geopoliticalRelevance,
      story.viralPotential,
      story.totalScore,
      story.status
    )
    .run();
}

export async function addStorySource(
  db: D1Database,
  link: Omit<StorySourceLink, "id" | "createdAt">
) {
  const existing = await db
    .prepare("SELECT id FROM story_sources WHERE story_id = ? AND url = ? AND source_name = ? LIMIT 1")
    .bind(link.storyId, link.url, link.sourceName)
    .first<Row>();

  if (existing) {
    return;
  }

  await db
    .prepare(
      `INSERT OR IGNORE INTO story_sources
      (id, story_id, title, url, source_name, published_at)
      VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(newId("src"), link.storyId, link.title, link.url, link.sourceName, link.publishedAt)
    .run();
}

export async function listStorySources(
  db: D1Database,
  storyId: string
): Promise<StorySourceLink[]> {
  const result = await db
    .prepare(
      `SELECT
        MIN(id) AS id,
        story_id,
        title,
        url,
        source_name,
        published_at,
        MIN(created_at) AS created_at
      FROM story_sources
      WHERE story_id = ?
      GROUP BY story_id, url, source_name, title, published_at
      ORDER BY created_at DESC`
    )
    .bind(storyId)
    .all<Row>();

  return result.results.map(toStorySource);
}

export async function saveBrief(
  db: D1Database,
  storyId: string,
  brief: PolitilyBrief,
  status: StoryStatus = "briefed"
) {
  await db
    .prepare(
      "UPDATE stories SET brief_json = ?, script_text = ?, status = ? WHERE id = ?"
    )
    .bind(JSON.stringify(brief), brief.videoScript, status, storyId)
    .run();
}

export async function markEmailSent(db: D1Database, storyId: string) {
  await db
    .prepare("UPDATE stories SET email_sent_at = ?, status = ? WHERE id = ?")
    .bind(new Date().toISOString(), "emailed", storyId)
    .run();
}

export async function listRecentStories(
  db: D1Database,
  limit = 60
): Promise<StoredStory[]> {
  const result = await db
    .prepare("SELECT * FROM stories ORDER BY detected_at DESC LIMIT ?")
    .bind(limit)
    .all<Row>();

  const stories = result.results.map(toStory);
  await attachSources(db, stories.slice(0, 20));
  return stories;
}

export async function listStoriesInDateRange(
  db: D1Database,
  startIso: string,
  endIso: string,
  limit = 80
): Promise<StoredStory[]> {
  await ensureDatabase(db);
  const result = await db
    .prepare(
      `SELECT * FROM stories
      WHERE COALESCE(published_at, detected_at) >= ?
        AND COALESCE(published_at, detected_at) <= ?
      ORDER BY total_score DESC, viral_potential DESC, detected_at DESC
      LIMIT ?`
    )
    .bind(startIso, endIso, limit)
    .all<Row>();

  const stories = result.results.map(toStory);
  await attachSources(db, stories);
  return stories;
}

export async function listRuns(db: D1Database, limit = 8): Promise<ScanRun[]> {
  const result = await db
    .prepare("SELECT * FROM scan_runs ORDER BY started_at DESC LIMIT ?")
    .bind(limit)
    .all<Row>();

  return result.results.map(toRun);
}

export async function getDashboardState(
  db: D1Database,
  config: DashboardState["config"]
): Promise<DashboardState> {
  await ensureDatabase(db);
  const [stories, sources, runs] = await Promise.all([
    listRecentStories(db, 80),
    listSources(db),
    listRuns(db),
  ]);

  return {
    demoMode: false,
    generatedAt: new Date().toISOString(),
    config,
    stories,
    sources,
    runs,
  };
}

async function attachSources(db: D1Database, stories: StoredStory[]) {
  await Promise.all(
    stories.map(async (story) => {
      story.sourceLinks = await listStorySources(db, story.id);
    })
  );
}

function toSource(row: Row): SignalSource {
  return {
    id: String(row.id),
    name: String(row.name),
    type: String(row.type) as SignalSource["type"],
    url: String(row.url),
    region: String(row.region ?? "global"),
    category: String(row.category ?? "politics"),
    priority: Number(row.priority ?? 50),
    active: Number(row.active ?? 1) === 1,
    createdAt: String(row.created_at ?? ""),
    lastCheckedAt: row.last_checked_at ? String(row.last_checked_at) : null,
  };
}

function toStory(row: Row): StoredStory {
  const brief = row.brief_json ? safeJson<PolitilyBrief>(String(row.brief_json)) : null;

  return {
    id: String(row.id),
    fingerprint: String(row.fingerprint),
    title: String(row.title),
    summary: String(row.summary ?? ""),
    url: String(row.url),
    imageUrl: row.image_url ? String(row.image_url) : null,
    articleExcerpt: row.article_excerpt ? String(row.article_excerpt) : null,
    sourceName: String(row.source_name),
    sourceType: String(row.source_type) as StoredStory["sourceType"],
    sourceCountry: String(row.source_country ?? ""),
    language: String(row.language ?? ""),
    publishedAt: row.published_at ? String(row.published_at) : null,
    detectedAt: String(row.detected_at),
    tags: safeJson<string[]>(String(row.tags_json ?? "[]")) ?? [],
    noveltyScore: Number(row.novelty_score ?? 0),
    politicalWeight: Number(row.political_weight ?? 0),
    geopoliticalRelevance: Number(row.geopolitical_relevance ?? 0),
    viralPotential: Number(row.viral_potential ?? 0),
    totalScore: Number(row.total_score ?? 0),
    status: String(row.status ?? "watching") as StoredStory["status"],
    brief,
    scriptText: row.script_text ? String(row.script_text) : null,
    emailSentAt: row.email_sent_at ? String(row.email_sent_at) : null,
  };
}

function toStorySource(row: Row): StorySourceLink {
  return {
    id: String(row.id),
    storyId: String(row.story_id),
    title: String(row.title),
    url: String(row.url),
    sourceName: String(row.source_name),
    publishedAt: row.published_at ? String(row.published_at) : null,
    createdAt: String(row.created_at ?? ""),
  };
}

function toRun(row: Row): ScanRun {
  return {
    id: String(row.id),
    startedAt: String(row.started_at),
    finishedAt: row.finished_at ? String(row.finished_at) : null,
    status: String(row.status ?? "complete") as ScanRun["status"],
    scannedCount: Number(row.scanned_count ?? 0),
    createdCount: Number(row.created_count ?? 0),
    triggeredCount: Number(row.triggered_count ?? 0),
    emailedCount: Number(row.emailed_count ?? 0),
    message: String(row.message ?? ""),
  };
}

function safeJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}
