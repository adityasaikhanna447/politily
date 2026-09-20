import { DEFAULT_SOURCES } from "./source-library";
import { scoreSignal } from "./scoring";
import { databaseIdentity, remainingQueries, ServiceError } from "./database-protection";
import type {
  DashboardState,
  PolitilyBrief,
  ScanRun,
  SignalSource,
  StoryScores,
  StorySourceLink,
  StoredStory,
  StoryStatus,
  RawSignal,
} from "./types";

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    url TEXT NOT NULL,
    region TEXT NOT NULL DEFAULT 'global',
    category TEXT NOT NULL DEFAULT 'politics',
    bias_lean TEXT NOT NULL DEFAULT 'unknown',
    verification_method TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT 'English',
    source_lane TEXT NOT NULL DEFAULT 'portal',
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
    sentiment_score INTEGER NOT NULL DEFAULT 50,
    total_score INTEGER NOT NULL DEFAULT 0,
    scoring_breakdown_json TEXT NOT NULL DEFAULT '{}',
    verification_method TEXT NOT NULL DEFAULT '',
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
    bias_lean TEXT NOT NULL DEFAULT 'unknown',
    verification_method TEXT NOT NULL DEFAULT '',
    source_lane TEXT NOT NULL DEFAULT 'portal',
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
  `CREATE TABLE IF NOT EXISTS email_digests (
    id TEXT PRIMARY KEY,
    digest_key TEXT NOT NULL UNIQUE,
    slot TEXT NOT NULL,
    sent_at TEXT NOT NULL,
    start_iso TEXT NOT NULL,
    end_iso TEXT NOT NULL,
    issue_count INTEGER NOT NULL DEFAULT 0,
    story_count INTEGER NOT NULL DEFAULT 0,
    message TEXT NOT NULL DEFAULT ''
  )`,
  `CREATE INDEX IF NOT EXISTS stories_total_score_idx ON stories (total_score DESC)`,
  `CREATE INDEX IF NOT EXISTS stories_detected_at_idx ON stories (detected_at DESC)`,
  `CREATE INDEX IF NOT EXISTS story_sources_story_id_idx ON story_sources (story_id)`,
  `CREATE INDEX IF NOT EXISTS story_sources_identity_idx ON story_sources (story_id, url, source_name)`,
  `CREATE INDEX IF NOT EXISTS email_digests_sent_at_idx ON email_digests (sent_at DESC)`,
  `CREATE INDEX IF NOT EXISTS scan_runs_started_idx ON scan_runs (started_at DESC)`,
  `CREATE INDEX IF NOT EXISTS scan_runs_status_started_idx ON scan_runs (status, started_at)`,
  `CREATE INDEX IF NOT EXISTS stories_report_date_idx ON stories (COALESCE(published_at, detected_at))`,
  `CREATE INDEX IF NOT EXISTS story_sources_created_idx ON story_sources (created_at, story_id)`,
  `CREATE INDEX IF NOT EXISTS story_sources_story_created_idx ON story_sources (story_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS stories_archive_idx ON stories (detected_at, id)`,
  `CREATE INDEX IF NOT EXISTS source_archive_idx ON story_sources (created_at, id)`,
  `CREATE TABLE IF NOT EXISTS app_locks (name TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS email_outbox (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, story_id TEXT,
    subject TEXT NOT NULL, payload_json TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0,
    provider_id TEXT, last_error TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, next_attempt_at TEXT NOT NULL,
    lease_until TEXT, accepted_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS email_outbox_due_idx ON email_outbox (status, next_attempt_at)`,
  `CREATE INDEX IF NOT EXISTS email_outbox_created_idx ON email_outbox (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS email_outbox_story_idx ON email_outbox (story_id, kind, created_at)`,
];

const SOURCE_CATALOG_SENTINEL_ID = "global-summits-live-v3";

const legacySourceIdsToPause = [
  "gdelt-india-politics",
  "gdelt-global-politics",
  "pib-feed-slot",
];

const storyColumnMigrations = [
  { name: "image_url", sql: "ALTER TABLE stories ADD COLUMN image_url TEXT" },
  { name: "article_excerpt", sql: "ALTER TABLE stories ADD COLUMN article_excerpt TEXT" },
  { name: "sentiment_score", sql: "ALTER TABLE stories ADD COLUMN sentiment_score INTEGER NOT NULL DEFAULT 50" },
  { name: "scoring_breakdown_json", sql: "ALTER TABLE stories ADD COLUMN scoring_breakdown_json TEXT NOT NULL DEFAULT '{}'" },
  { name: "verification_method", sql: "ALTER TABLE stories ADD COLUMN verification_method TEXT NOT NULL DEFAULT ''" },
];

const sourceColumnMigrations = [
  { name: "last_error", sql: "ALTER TABLE sources ADD COLUMN last_error TEXT NOT NULL DEFAULT ''" },
  { name: "last_success_at", sql: "ALTER TABLE sources ADD COLUMN last_success_at TEXT" },
  { name: "last_signal_count", sql: "ALTER TABLE sources ADD COLUMN last_signal_count INTEGER NOT NULL DEFAULT 0" },
  { name: "bias_lean", sql: "ALTER TABLE sources ADD COLUMN bias_lean TEXT NOT NULL DEFAULT 'unknown'" },
  { name: "verification_method", sql: "ALTER TABLE sources ADD COLUMN verification_method TEXT NOT NULL DEFAULT ''" },
  { name: "language", sql: "ALTER TABLE sources ADD COLUMN language TEXT NOT NULL DEFAULT 'English'" },
  { name: "source_lane", sql: "ALTER TABLE sources ADD COLUMN source_lane TEXT NOT NULL DEFAULT 'portal'" },
];

const storySourceColumnMigrations = [
  { name: "bias_lean", sql: "ALTER TABLE story_sources ADD COLUMN bias_lean TEXT NOT NULL DEFAULT 'unknown'" },
  { name: "verification_method", sql: "ALTER TABLE story_sources ADD COLUMN verification_method TEXT NOT NULL DEFAULT ''" },
  { name: "source_lane", sql: "ALTER TABLE story_sources ADD COLUMN source_lane TEXT NOT NULL DEFAULT 'portal'" },
];

type Row = Record<string, unknown>;
const databaseSetup = new WeakMap<object, Promise<void>>();

export function newId(prefix: string) {
  const random = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

export async function ensureDatabase(db: D1Database) {
  const key = databaseIdentity(db) as unknown as object;
  const existing = databaseSetup.get(key);
  if (existing) {
    return existing;
  }

  const setup = ensureDatabaseOnce(db).catch((error) => {
    databaseSetup.delete(key);
    throw error;
  });
  databaseSetup.set(key, setup);
  return setup;
}

async function ensureDatabaseOnce(db: D1Database) {
  try {
    if (await db.prepare("SELECT owner FROM app_locks WHERE name = 'schema:newsroom-3.2'").first()) return;
  } catch (error) {
    if (!/no such table/i.test(String(error))) throw error;
  }
  await db.prepare("CREATE TABLE IF NOT EXISTS app_locks (name TEXT PRIMARY KEY, owner TEXT NOT NULL, expires_at TEXT NOT NULL)").run();
  const stage = async (name: string, work: () => Promise<unknown>) => {
    const key = `setup:3.2:${name}`;
    if (await db.prepare("SELECT owner FROM app_locks WHERE name=?").bind(key).first()) return;
    await work();
    await db.prepare("INSERT OR IGNORE INTO app_locks (name,owner,expires_at) VALUES (?, 'complete', '9999-01-01T00:00:00Z')").bind(key).run();
    if (remainingQueries() < 35) throw new ServiceError("Preparing the database in small Free-plan batches. Please retry in a few seconds; existing data is preserved.", "DATABASE_SETUP", 5);
  };
  await stage("tables", () => db.batch(schemaStatements.map((statement) => db.prepare(statement))));
  await stage("columns", async () => {
    await migrateTableColumns(db, "stories", storyColumnMigrations);
    await migrateTableColumns(db, "sources", sourceColumnMigrations);
    await migrateTableColumns(db, "story_sources", storySourceColumnMigrations);
  });
  await seedSources(db);
  await db.prepare("INSERT OR IGNORE INTO app_locks (name, owner, expires_at) VALUES ('schema:newsroom-3.2', 'complete', '9999-01-01T00:00:00Z')").run();
  if (remainingQueries() < 35) throw new ServiceError("Database setup is complete. Retry once to open the newsroom.", "DATABASE_SETUP", 5);
}

async function migrateTableColumns(
  db: D1Database,
  tableName: string,
  migrations: Array<{ name: string; sql: string }>
) {
  const result = await db.prepare(`PRAGMA table_info(${tableName})`).all<Row>();
  const columns = new Set(result.results.map((row) => String(row.name)));
  const missing = migrations.filter((migration) => !columns.has(migration.name));

  if (missing.length) {
    try {
      await db.batch(missing.map((migration) => db.prepare(migration.sql)));
    } catch (error) {
      // Another Worker isolate can complete the same additive migration first.
      const current = await db.prepare(`PRAGMA table_info(${tableName})`).all<Row>();
      if (missing.some(migration => !current.results.some(row => row.name === migration.name))) throw error;
    }
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
  const catalogReady = await db
    .prepare("SELECT id FROM sources WHERE id = ? LIMIT 1")
    .bind(SOURCE_CATALOG_SENTINEL_ID)
    .first<Row>();

  if (catalogReady) {
    return;
  }

  const inserts: D1PreparedStatement[] = [];
  for (let offset = 0; offset < DEFAULT_SOURCES.length; offset += 8) {
    const chunk = DEFAULT_SOURCES.slice(offset, offset + 8);
    inserts.push(db.prepare(
          `INSERT INTO sources
          (id, name, type, url, region, category, bias_lean, verification_method, language, source_lane, priority, active)
          VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(",")}
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            type = excluded.type,
            url = excluded.url,
            region = excluded.region,
            category = excluded.category,
            bias_lean = excluded.bias_lean,
            verification_method = excluded.verification_method,
            language = excluded.language,
            source_lane = excluded.source_lane,
            priority = excluded.priority`
        )
        .bind(...chunk.flatMap(source => [
          source.id,
          source.name,
          source.type,
          source.url,
          source.region,
          source.category,
          source.biasLean ?? inferBiasLean(source.name, source.category, source.url),
          source.verificationMethod ?? inferSourceVerificationMethod(source.name, source.category, source.type),
          source.language ?? inferSourceLanguage(source.name, source.category, source.url),
          source.sourceLane ?? inferSourceLane(source.name, source.category, source.type, source.url),
          source.priority,
          source.active ? 1 : 0,
        ])));
  }
  await db.batch(inserts);

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

export async function updateSourceChecked(db: D1Database, id: string, error = "", count = 0) {
  await db
    .prepare("UPDATE sources SET last_checked_at = ?, last_error = ?, last_signal_count = ?, last_success_at = CASE WHEN ? = '' THEN ? ELSE last_success_at END WHERE id = ?")
    .bind(new Date().toISOString(), error.slice(0, 350), count, error, new Date().toISOString(), id)
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

export async function getDigestRunByKey(db: D1Database, digestKey: string) {
  await ensureDatabase(db);
  return db
    .prepare("SELECT id, digest_key, slot, sent_at, message FROM email_digests WHERE digest_key = ? LIMIT 1")
    .bind(digestKey)
    .first<Row>();
}

export async function recordDigestRun(
  db: D1Database,
  digest: {
    digestKey: string;
    slot: string;
    startIso: string;
    endIso: string;
    issueCount: number;
    storyCount: number;
    message: string;
  }
) {
  await ensureDatabase(db);
  await db
    .prepare(
      `INSERT OR IGNORE INTO email_digests
      (id, digest_key, slot, sent_at, start_iso, end_iso, issue_count, story_count, message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      newId("digest"),
      digest.digestKey,
      digest.slot,
      new Date().toISOString(),
      digest.startIso,
      digest.endIso,
      digest.issueCount,
      digest.storyCount,
      digest.message
    )
    .run();
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
  id: string,
  includeSources = true
): Promise<StoredStory | null> {
  const row = await db.prepare("SELECT * FROM stories WHERE id = ?").bind(id).first<Row>();
  if (!row) {
    return null;
  }

  const story = toStory(row);
  if (includeSources) {
    await attachStorySources(db, [story]);
  }
  return story;
}

export async function insertStory(db: D1Database, story: StoredStory) {
  await db
    .prepare(
      `INSERT OR IGNORE INTO stories
      (id, fingerprint, title, summary, url, image_url, article_excerpt, source_name, source_type,
       source_country, language, published_at, detected_at, tags_json,
       novelty_score, political_weight, geopolitical_relevance, viral_potential,
       sentiment_score, total_score, scoring_breakdown_json, verification_method, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      story.sentimentScore,
      story.totalScore,
      JSON.stringify(story.scoringBreakdown),
      story.verificationMethod ?? verificationMethodForStory(story, 1),
      story.status
    )
    .run();
}

export async function promoteLatestReport(db: D1Database, storyId: string, signal: RawSignal, scores: StoryScores) {
  await db.prepare(`UPDATE stories SET title=?, summary=?, url=?, source_name=?, source_type=?,
    published_at=?, article_excerpt=?, language=?, novelty_score=?, political_weight=?, geopolitical_relevance=?,
    viral_potential=?, sentiment_score=?, total_score=?, scoring_breakdown_json=?, tags_json=? WHERE id=?`)
    .bind(signal.title, signal.summary, signal.url, signal.sourceName, signal.sourceType,
      signal.publishedAt || null, signal.articleExcerpt || signal.summary, signal.language || "",
      scores.noveltyScore, scores.politicalWeight, scores.geopoliticalRelevance, scores.viralPotential,
      scores.sentimentScore, scores.totalScore, JSON.stringify(scores.scoringBreakdown), JSON.stringify(scores.tags), storyId).run();
}

export async function addStorySource(
  db: D1Database,
  link: Omit<StorySourceLink, "id" | "createdAt">
) {
  const result = await db
    .prepare(
      `INSERT INTO story_sources
      (id, story_id, title, url, source_name, bias_lean, verification_method, source_lane, published_at, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (
        SELECT 1 FROM story_sources
        WHERE story_id = ? AND url = ? AND source_name = ?
        LIMIT 1
      )`
    )
    .bind(
      newId("src"),
      link.storyId,
      link.title,
      link.url,
      link.sourceName,
      link.biasLean ?? inferBiasLean(link.sourceName, "", link.url),
      link.verificationMethod ?? inferSourceVerificationMethod(link.sourceName, "", "rss"),
      link.sourceLane ?? inferSourceLane(link.sourceName, "", "rss", link.url),
      link.publishedAt,
      new Date().toISOString(),
      link.storyId,
      link.url,
      link.sourceName
    )
    .run();

  return Number((result.meta as { changes?: number } | undefined)?.changes ?? 0) > 0;
}

export async function strengthenStoryFromSignal(
  db: D1Database,
  storyId: string,
  signal: Pick<StoredStory, "summary" | "imageUrl" | "articleExcerpt" | "status"> & StoryScores
) {
  await db
    .prepare(
      `UPDATE stories
      SET
        summary = CASE WHEN length(COALESCE(summary, '')) < length(?) THEN ? ELSE summary END,
        image_url = COALESCE(image_url, ?),
        article_excerpt = CASE WHEN length(COALESCE(article_excerpt, '')) < length(?) THEN ? ELSE article_excerpt END,
        novelty_score = MAX(novelty_score, ?),
        political_weight = MAX(political_weight, ?),
        geopolitical_relevance = MAX(geopolitical_relevance, ?),
        viral_potential = MAX(viral_potential, ?),
        sentiment_score = MAX(sentiment_score, ?),
        scoring_breakdown_json = CASE WHEN ? >= total_score THEN ? ELSE scoring_breakdown_json END,
        total_score = MAX(total_score, ?),
        verification_method = CASE WHEN length(COALESCE(verification_method, '')) < length(?) THEN ? ELSE verification_method END,
        status = CASE
          WHEN status = 'watching' AND ? = 'triggered' THEN 'triggered'
          ELSE status
        END
      WHERE id = ?`
    )
    .bind(
      signal.summary,
      signal.summary,
      signal.imageUrl ?? null,
      signal.articleExcerpt ?? "",
      signal.articleExcerpt ?? "",
      signal.noveltyScore,
      signal.politicalWeight,
      signal.geopoliticalRelevance,
      signal.viralPotential,
      signal.sentimentScore,
      signal.totalScore,
      JSON.stringify(signal.scoringBreakdown),
      signal.totalScore,
      verificationMethodForScores(signal),
      verificationMethodForScores(signal),
      signal.status,
      storyId
    )
    .run();
}

export async function listStorySources(
  db: D1Database,
  storyId: string
): Promise<StorySourceLink[]> {
  const result = await db
    .prepare(`SELECT * FROM story_sources WHERE story_id = ? ORDER BY created_at DESC LIMIT 100`)
    .bind(storyId)
    .all<Row>();

  return uniqueSourceRows(result.results).map(toStorySource);
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
  limit = 60,
  sourceLimit = 20
): Promise<StoredStory[]> {
  const result = await db
    .prepare("SELECT * FROM stories ORDER BY detected_at DESC LIMIT ?")
    .bind(limit)
    .all<Row>();

  const stories = result.results.map(toStory);
  if (sourceLimit > 0) {
    await attachStorySources(db, stories.slice(0, sourceLimit));
  }
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
      `SELECT * FROM stories WHERE id IN (
        SELECT id FROM stories WHERE COALESCE(published_at, detected_at) >= ? AND COALESCE(published_at, detected_at) <= ?
        UNION
        SELECT story_id FROM story_sources WHERE created_at >= ? AND created_at <= ?
          AND (published_at IS NULL OR published_at >= ?)
        UNION
        SELECT story_id FROM story_sources WHERE created_at >= ? AND created_at <= ?
          AND (published_at IS NULL OR published_at >= ?)
      )
      ORDER BY total_score DESC, detected_at DESC
      LIMIT ?`
    )
    .bind(startIso, endIso, startIso, endIso, startIso,
      startIso.replace("T", " ").slice(0, 19), endIso.replace("T", " ").slice(0, 19), startIso, limit)
    .all<Row>();

  const stories = result.results.map(toStory);
  await attachStorySources(db, stories);
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
  const [stories, sources, runs, deliveries] = await Promise.all([
    listRecentStories(db, 160, 160),
    listSources(db),
    listRuns(db),
    db.prepare("SELECT id, kind, story_id, subject, status, attempts, provider_id, last_error, created_at, accepted_at, next_attempt_at FROM email_outbox ORDER BY created_at DESC LIMIT 40").all<Row>(),
  ]);

  return {
    demoMode: false,
    generatedAt: new Date().toISOString(),
    config,
    stories,
    sources,
    runs,
    deliveries: deliveries.results,
  };
}

export async function attachStorySources(db: D1Database, stories: StoredStory[]) {
  if (!stories.length) {
    return;
  }

  const storiesById = new Map(stories.map((story) => [story.id, story]));
  for (const story of stories) {
    story.sourceLinks = [];
    story.sourceLinksTruncated = false;
  }

  for (let offset = 0; offset < stories.length; offset += 80) {
    const storyIds = stories.slice(offset, offset + 80).map((story) => story.id);
    // A LIMIT inside each indexed subquery bounds reads even for years-old umbrellas.
    const result = await db
      .prepare(
        storyIds.map(() => "SELECT * FROM (SELECT * FROM story_sources WHERE story_id = ? ORDER BY created_at DESC LIMIT 26)").join(" UNION ALL ")
      )
      .bind(...storyIds)
      .all<Row>();

    const rawCounts = new Map<string, number>();
    for (const row of result.results) rawCounts.set(String(row.story_id), (rawCounts.get(String(row.story_id)) || 0) + 1);
    for (const row of uniqueSourceRows(result.results)) {
      const story = storiesById.get(String(row.story_id));
      if (story) {
        story.sourceLinksTruncated = (rawCounts.get(story.id) || 0) > 25;
        if (story.sourceLinks!.length < 25) story.sourceLinks?.push(toStorySource(row));
      }
    }
  }
}

function uniqueSourceRows(rows: Row[]) {
  return [...new Map(rows.map(row => [`${row.story_id}|${row.url}|${row.source_name}`, row])).values()];
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
    biasLean: String(row.bias_lean ?? "unknown") as SignalSource["biasLean"],
    verificationMethod: String(row.verification_method ?? ""),
    language: String(row.language ?? "English"),
    sourceLane: String(row.source_lane ?? "portal") as SignalSource["sourceLane"],
    createdAt: String(row.created_at ?? ""),
    lastCheckedAt: row.last_checked_at ? String(row.last_checked_at) : null,
    lastError: String(row.last_error || ""),
    lastSuccessAt: row.last_success_at ? String(row.last_success_at) : null,
    lastSignalCount: Number(row.last_signal_count || 0),
  };
}

function toStory(row: Row): StoredStory {
  const brief = row.brief_json ? safeJson<PolitilyBrief>(String(row.brief_json)) : null;

  const story: StoredStory = {
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
    sentimentScore: Number(row.sentiment_score ?? 50),
    totalScore: Number(row.total_score ?? 0),
    scoringBreakdown:
      safeJson<StoredStory["scoringBreakdown"]>(String(row.scoring_breakdown_json ?? "{}")) ??
      fallbackScoringBreakdown(),
    status: String(row.status ?? "watching") as StoredStory["status"],
    verificationMethod: String(row.verification_method ?? ""),
    brief,
    scriptText: row.script_text ? String(row.script_text) : null,
    emailSentAt: row.email_sent_at ? String(row.email_sent_at) : null,
  };
  if (!story.scoringBreakdown?.formula?.startsWith("v3:")) {
    Object.assign(story, scoreSignal({ ...story, sourceId: story.id, sourcePriority: 0 }));
  }
  return story;
}

function toStorySource(row: Row): StorySourceLink {
  return {
    id: String(row.id),
    storyId: String(row.story_id),
    title: String(row.title),
    url: String(row.url),
    sourceName: String(row.source_name),
    biasLean: String(row.bias_lean ?? "unknown") as StorySourceLink["biasLean"],
    verificationMethod: String(row.verification_method ?? ""),
    sourceLane: String(row.source_lane ?? "portal") as StorySourceLink["sourceLane"],
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

function fallbackScoringBreakdown(): StoredStory["scoringBreakdown"] {
  return {
    noveltySignals: ["Legacy story: scoring breakdown was not stored when this row was created."],
    politicalSignals: [],
    geopoliticalSignals: [],
    viralSignals: [],
    sentimentSignals: [],
    velocitySignal: "Legacy row",
    sourceSignal: "Legacy row",
    formula: "total = novelty 24% + political 31% + geo 20% + viral 25% + hot-topic boost",
  };
}

function inferSourceLane(
  name: string,
  category: string,
  type: SignalSource["type"] | string,
  url: string
): SignalSource["sourceLane"] {
  const text = `${name} ${category} ${type} ${url}`.toLowerCase();
  if (/fact.?check|alt news|boom|factly|pib fact check/.test(text)) return "factcheck";
  if (/x\.com|twitter|reddit|youtube|social|viral/.test(text)) return "social";
  if (/regional|hindi|amar ujala|bhaskar|jagran|aaj tak|abp|lokmat|eenadu|dinamalar|anandabazar|mathrubhumi/.test(text)) return "regional";
  if (/pti|uni|ani|reuters|associated press|agency|wire/.test(text)) return "agency";
  if (/official|primary|pib|pmindia|mea|supreme court|prs|parliament|election commission|court|gov\.in/.test(text)) return "official";
  if (/research/.test(text)) return "research";
  return "portal";
}

function inferSourceLanguage(name: string, category: string, url: string) {
  const text = `${name} ${category} ${url}`.toLowerCase();
  if (/hindi|aajtak|aaj tak|amarujala|amar ujala|bhaskar|jagran|livehindustan|abplive/.test(text)) return "Hindi";
  if (/tamil|dinamalar|vikatan/.test(text)) return "Tamil";
  if (/bengali|anandabazar|bangla/.test(text)) return "Bengali";
  if (/marathi|lokmat|maharashtra/.test(text)) return "Marathi";
  if (/telugu|eenadu|sakshi/.test(text)) return "Telugu";
  if (/malayalam|mathrubhumi|manorama/.test(text)) return "Malayalam";
  if (/regional/.test(text)) return "Regional";
  if (/social|reddit|youtube|x\.com|twitter/.test(text)) return "Mixed";
  return "English";
}

function inferBiasLean(name: string, category: string, url: string): SignalSource["biasLean"] {
  const text = `${name} ${category} ${url}`.toLowerCase();
  if (/official|primary|pib|pmindia|mea|gov\.in|state-owned/.test(text)) return "state-owned";
  if (/agency|pti|uni|ani|reuters|associated press/.test(text)) return "center";
  if (/fact.?check|alt news|boom|factly/.test(text)) return "center";
  if (/social|reddit|youtube|x\.com|twitter/.test(text)) return "unknown";
  if (/international|bbc|al jazeera|guardian|new york times|washington post/.test(text)) return "center";
  return "unknown";
}

function inferSourceVerificationMethod(
  name: string,
  category: string,
  type: SignalSource["type"] | string
) {
  const text = `${name} ${category} ${type}`.toLowerCase();
  if (/fact.?check|alt news|boom|factly|pib fact check/.test(text)) {
    return "Fact-check lane: verify claim, claimant, evidence cited, and whether independent sources corroborate it.";
  }
  if (/official|primary|pib|pmindia|mea|court|prs|parliament|election commission/.test(text)) {
    return "Primary-source lane: verify directly against official order, release, court record, bill text, or notification.";
  }
  if (/agency|pti|uni|ani|reuters|associated press/.test(text)) {
    return "Agency lane: useful for speed; corroborate with at least one primary record or independent portal before scripting.";
  }
  if (/social|viral|x|reddit|youtube/.test(text)) {
    return "Social/viral lane: treat as early signal only; verify with source URL, original post, timestamp, and independent reporting.";
  }
  if (/regional|hindi/.test(text)) {
    return "Regional-language lane: useful for early/local signal; corroborate translation, local context, and one national/official source.";
  }
  return "Portal lane: verify by cross-source corroboration, primary documents, and source-position comparison.";
}

function verificationMethodForStory(story: StoredStory, sourceCount: number) {
  if (story.verificationMethod) return story.verificationMethod;
  const tags = story.tags.join(" ").toLowerCase();
  if (tags.includes("fact-check")) {
    return `Fact-check method: ${sourceCount} source(s), flagged claim terms, source trail comparison, and primary-record requirement.`;
  }
  return verificationMethodForScores(story);
}

function verificationMethodForScores(scores: Pick<StoryScores, "tags" | "scoringBreakdown" | "sentimentScore">) {
  if (scores.tags.includes("fact-check")) {
    const claims = scores.scoringBreakdown.sentimentSignals.concat(scores.scoringBreakdown.viralSignals).slice(0, 5);
    return `Fact-check method: flagged terms ${claims.join(", ") || "none stored"}; verify by cross-source corroboration and primary records.`;
  }

  return "Verification method: source trail count, source lane, bias label, score breakdown, and primary-document checklist.";
}
