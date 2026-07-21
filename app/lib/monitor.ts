import { getDemoState } from "./demo-data";
import { sendBriefEmail } from "./email";
import { generateBriefWithGemini } from "./gemini";
import { fingerprintFor, scoreSignal, titleSimilarity } from "./scoring";
import {
  addStorySource,
  createRun,
  ensureDatabase,
  finishRun,
  getDashboardState as getStoredDashboardState,
  getStoryByFingerprint,
  getStoryById,
  insertStory,
  listRecentStories,
  listSources,
  listStorySources,
  markEmailSent,
  markStaleRunsFailed,
  newId,
  saveBrief,
  updateSourceChecked,
} from "./storage";
import type {
  DashboardState,
  RawSignal,
  RuntimeEnv,
  ScanResult,
  SignalSource,
  StoredStory,
} from "./types";

export function getRuntimeConfig(env: RuntimeEnv): DashboardState["config"] {
  return {
    threshold: numberEnv(env.POLITILY_SCORE_THRESHOLD, 72),
    geminiReady: Boolean(env.GEMINI_API_KEY),
    emailReady: Boolean(env.RESEND_API_KEY && env.ALERT_EMAIL && env.ALERT_FROM_EMAIL),
    storageReady: Boolean(env.DB),
    model: env.GEMINI_MODEL || "gemini-3.5-flash",
  };
}

export async function loadDashboardState(env: RuntimeEnv): Promise<DashboardState> {
  if (!env.DB) {
    return getDemoState();
  }

  const config = getRuntimeConfig(env);
  return getStoredDashboardState(env.DB, config);
}

export async function runPolitilyScan(env: RuntimeEnv): Promise<ScanResult> {
  if (!env.DB) {
    const demo = getDemoState();
    return {
      run: demo.runs[0],
      triggeredStories: demo.stories,
      errors: ["Persistent storage is not connected. Scan returned demo data."],
    };
  }

  await ensureDatabase(env.DB);
  await markStaleRunsFailed(env.DB);
  const run = await createRun(env.DB);
  const errors: string[] = [];

  try {
    const threshold = numberEnv(env.POLITILY_SCORE_THRESHOLD, 72);
    const maxBriefs = numberEnv(env.POLITILY_MAX_DEEP_BRIEFS_PER_RUN, 1);
    const maxSources = Math.min(numberEnv(env.POLITILY_MAX_SOURCES_PER_RUN, 8), 12);
    const fetchTimeoutMs = Math.min(numberEnv(env.POLITILY_FETCH_TIMEOUT_MS, 9000), 12000);
    const scanDeadline = Date.now() + 42000;
    const sources = rotateSources(
      (await listSources(env.DB)).filter((source) => source.active)
    ).slice(0, Math.max(1, maxSources));
    const recentStories = await listRecentStories(env.DB, 160);
    const triggeredStories: StoredStory[] = [];
    let scannedCount = 0;
    let createdCount = 0;
    let emailedCount = 0;

    const fetchResults = await Promise.allSettled(
      sources.map(async (source) => {
        try {
          return {
            source,
            signals: await fetchSignals(source, fetchTimeoutMs),
          };
        } catch (error) {
          await updateSourceChecked(env.DB!, source.id);
          throw new Error(`${source.name}: ${errorMessage(error)}`);
        }
      })
    );

    for (const result of fetchResults) {
      if (Date.now() > scanDeadline) {
        errors.push("Scan budget reached. Remaining fetched signals will continue in the next run.");
        break;
      }

      if (result.status === "rejected") {
        errors.push(errorMessage(result.reason));
        continue;
      }

      const { source, signals } = result.value;
      scannedCount += signals.length;
      await updateSourceChecked(env.DB, source.id);

      for (const signal of signals) {
        const fingerprint = fingerprintFor(signal);
        const existing = await getStoryByFingerprint(env.DB, fingerprint);
        const related = existing ?? findRelatedStory(signal, recentStories);

        if (related) {
          await addStorySource(env.DB, {
            storyId: related.id,
            title: signal.title,
            url: signal.url,
            sourceName: signal.sourceName,
            publishedAt: signal.publishedAt ?? null,
          });
          continue;
        }

        const scores = scoreSignal(signal, recentStories);
        const story: StoredStory = {
          id: newId("story"),
          fingerprint,
          title: signal.title,
          summary: signal.summary,
          url: signal.url,
          imageUrl: signal.imageUrl ?? null,
          articleExcerpt: signal.articleExcerpt || signal.summary,
          sourceName: signal.sourceName,
          sourceType: signal.sourceType,
          sourceCountry: signal.sourceCountry ?? "",
          language: signal.language ?? "",
          publishedAt: signal.publishedAt ?? null,
          detectedAt: new Date().toISOString(),
          status: scores.totalScore >= threshold ? "triggered" : "watching",
          ...scores,
        };

        await insertStory(env.DB, story);
        await addStorySource(env.DB, {
          storyId: story.id,
          title: story.title,
          url: story.url,
          sourceName: story.sourceName,
          publishedAt: story.publishedAt,
        });
        recentStories.unshift(story);
        createdCount += 1;

        if (story.status === "triggered") {
          triggeredStories.push(story);
        }
      }
    }

    for (const story of triggeredStories.slice(0, maxBriefs)) {
      const updated = await generateAndSaveBrief(env, story.id);
      if (updated?.brief) {
        const email = await sendBriefEmail(env, updated, updated.brief);
        if (email.sent && env.DB) {
          await markEmailSent(env.DB, updated.id);
          emailedCount += 1;
        } else if (!email.sent) {
          errors.push(email.message);
        }
      }
    }

    const finished = await finishRun(env.DB, run, {
      status: "complete",
      scannedCount,
      createdCount,
      triggeredCount: triggeredStories.length,
      emailedCount,
      message: errors.length ? errors.slice(0, 3).join(" | ") : "Scan complete.",
    });

    return { run: finished, triggeredStories, errors };
  } catch (error) {
    const failed = await finishRun(env.DB, run, {
      status: "failed",
      message: errorMessage(error),
    });
    return { run: failed, triggeredStories: [], errors: [errorMessage(error)] };
  }
}

export async function generateAndSaveBrief(env: RuntimeEnv, storyId: string) {
  if (!env.DB) {
    return null;
  }

  await ensureDatabase(env.DB);
  const story = await getStoryById(env.DB, storyId);
  if (!story) {
    return null;
  }

  const sourceLinks = await listStorySources(env.DB, story.id);
  const brief = await generateBriefWithGemini(env, story, sourceLinks);
  await saveBrief(env.DB, story.id, brief);

  return {
    ...story,
    brief,
    scriptText: brief.videoScript,
    status: "briefed" as const,
    sourceLinks,
  };
}

async function fetchSignals(source: SignalSource, timeoutMs: number): Promise<RawSignal[]> {
  const response = await fetchWithTimeout(source.url, {
    headers: {
      "User-Agent": "Politily/0.1 political-signal-monitor",
      Accept: source.type === "gdelt" ? "application/json" : "application/rss+xml,text/xml,text/html,application/xhtml+xml",
    },
  }, timeoutMs);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  if (source.type === "gdelt") {
    const data = (await response.json()) as {
      articles?: Array<Record<string, unknown>>;
    };

    return (data.articles ?? []).map((article) => ({
      title: clean(String(article.title ?? "")),
      summary: summariseGdeltArticle(article, source),
      url: String(article.url ?? ""),
      imageUrl: clean(String(article.socialimage ?? article.image ?? "")) || null,
      articleExcerpt: clean(String(article.title ?? "")),
      sourceName: clean(String(article.domain ?? source.name)),
      sourceType: source.type,
      sourceCountry: clean(String(article.sourcecountry ?? "")),
      language: clean(String(article.language ?? "")),
      publishedAt: parseGdeltDate(String(article.seendate ?? "")),
      sourceId: source.id,
      sourcePriority: source.priority,
    })).filter((signal) => isUsableSignal(signal.title, signal.summary, signal.language) && !isNoiseSignal(signal.title, signal.summary));
  }

  const text = await response.text();
  if (source.type === "html") {
    return parseHtmlPage(text, source);
  }

  return parseFeed(text, source);
}

function rotateSources(sources: SignalSource[]) {
  return [...sources].sort((a, b) => {
    const aHot = a.category.toLowerCase().includes("hot topic") ? 1 : 0;
    const bHot = b.category.toLowerCase().includes("hot topic") ? 1 : 0;
    if (aHot !== bHot) {
      return bHot - aHot;
    }

    const aChecked = a.lastCheckedAt ? Date.parse(a.lastCheckedAt) : 0;
    const bChecked = b.lastCheckedAt ? Date.parse(b.lastCheckedAt) : 0;
    if (aChecked !== bChecked) {
      return aChecked - bChecked;
    }

    return b.priority - a.priority;
  });
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`Timed out after ${timeoutMs}ms`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function parseFeed(xml: string, source: SignalSource): RawSignal[] {
  const items = Array.from(xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)).slice(0, 18);
  const entries = items.length
    ? items.map((match) => match[0])
    : Array.from(xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)).slice(0, 18).map((match) => match[0]);

  return entries
    .map((entry) => {
      const title = clean(extractTag(entry, "title"));
      const summary = clean(extractTag(entry, "description") || extractTag(entry, "summary"));
      const link = clean(extractTag(entry, "link")) || extractHref(entry);
      const imageUrl = extractImageUrl(entry);
      const sourceName = clean(extractTag(entry, "source")) || source.name;
      const publishedAt = parseDate(
        extractTag(entry, "pubDate") || extractTag(entry, "published") || extractTag(entry, "updated")
      );

      return {
        title,
        summary,
        url: link,
        imageUrl,
        articleExcerpt: summary || title,
        sourceName,
        sourceType: source.type,
        sourceCountry: source.region,
        language: "",
        publishedAt,
        sourceId: source.id,
        sourcePriority: source.priority,
      };
    })
    .filter((signal) => isUsableSignal(signal.title, signal.summary, signal.language) && !isNoiseSignal(signal.title, signal.summary))
    .slice(0, 12);
}

function findRelatedStory(signal: RawSignal, recentStories: StoredStory[]) {
  const titleTokens = signal.title.split(/\s+/).filter((word) => word.length > 3);
  if (titleTokens.length < 4) {
    return null;
  }

  let best: { story: StoredStory; similarity: number } | null = null;
  for (const story of recentStories.slice(0, 100)) {
    const similarity = titleSimilarity(signal.title, story.title);
    if (!best || similarity > best.similarity) {
      best = { story, similarity };
    }
  }

  if (best && best.similarity >= 0.72) {
    return best.story;
  }

  return null;
}

function extractTag(value: string, tag: string) {
  const match = value.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match?.[1] ?? "";
}

function extractHref(value: string) {
  const match = value.match(/<link[^>]+href=["']([^"']+)["']/i);
  return match?.[1] ?? "";
}

function extractImageUrl(value: string) {
  const candidates = [
    value.match(/<media:content[^>]+url=["']([^"']+)["']/i)?.[1],
    value.match(/<media:thumbnail[^>]+url=["']([^"']+)["']/i)?.[1],
    value.match(/<enclosure[^>]+url=["']([^"']+)["'][^>]*type=["']image\//i)?.[1],
    value.match(/<img[^>]+src=["']([^"']+)["']/i)?.[1],
  ];

  return clean(candidates.find(Boolean) ?? "") || null;
}

function extractImageNearLink(linkHtml: string, pageHtml: string, baseUrl: URL) {
  const inlineImage = extractImageUrl(linkHtml);
  if (inlineImage) {
    return resolveUrl(inlineImage, baseUrl) || inlineImage;
  }

  const index = pageHtml.indexOf(linkHtml);
  const nearby = index >= 0 ? pageHtml.slice(Math.max(0, index - 700), index + linkHtml.length + 700) : "";
  const nearbyImage = nearby ? extractImageUrl(nearby) : null;
  if (!nearbyImage) {
    return null;
  }

  return resolveUrl(nearbyImage, baseUrl) || nearbyImage;
}

function parseHtmlPage(html: string, source: SignalSource): RawSignal[] {
  const withoutNoise = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ");
  const baseUrl = new URL(source.url);
  const seen = new Set<string>();

  return Array.from(
    withoutNoise.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)
  )
    .map((match): RawSignal | null => {
      const href = clean(String(match[1] ?? ""));
      const title = clean(String(match[2] ?? ""));
      if (!href || !title || title.length < 18) {
        return null;
      }

      const url = resolveUrl(href, baseUrl);
      if (!url || seen.has(url) || !looksPolitical(title) || isNoiseSignal(title, "") || !isUsableSignal(title, "", "")) {
        return null;
      }

      seen.add(url);
      return {
        title,
        summary: `Official page item from ${source.name}. Verify the linked document before publication.`,
        url,
        imageUrl: extractImageNearLink(match[0], withoutNoise, baseUrl),
        articleExcerpt: `Official page item from ${source.name}. Verify the linked document before publication.`,
        sourceName: source.name,
        sourceType: source.type,
        sourceCountry: source.region,
        language: "",
        publishedAt: null,
        sourceId: source.id,
        sourcePriority: source.priority,
      };
    })
    .filter((signal): signal is RawSignal => Boolean(signal))
    .slice(0, 18);
}

function resolveUrl(value: string, baseUrl: URL) {
  try {
    const url = new URL(value, baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) {
      return "";
    }
    return url.toString();
  } catch {
    return "";
  }
}

function looksPolitical(title: string) {
  const text = title.toLowerCase();
  const terms = [
    "press",
    "release",
    "statement",
    "minister",
    "parliament",
    "election",
    "court",
    "judgment",
    "policy",
    "bill",
    "government",
    "party",
    "commission",
    "india",
    "foreign",
    "official",
    "notification",
    "advisory",
    "ban",
    "rights",
  ];

  return terms.some((term) => text.includes(term));
}

function isNoiseSignal(title: string, summary: string) {
  const text = `${title} ${summary}`.toLowerCase();
  const noiseTerms = [
    "test post",
    "hello world",
    "court masters and moderators",
    "helpline numbers",
    "telephone directory",
    "tender notice",
    "recruitment notice",
  ];

  return noiseTerms.some((term) => text.includes(term));
}

function parseGdeltDate(value: string) {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T?(\d{2})?(\d{2})?/);
  if (!match) {
    return parseDate(value);
  }

  const [, year, month, day, hour = "00", minute = "00"] = match;
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:00Z`).toISOString();
}

function summariseGdeltArticle(article: Record<string, unknown>, source: SignalSource) {
  const domain = clean(String(article.domain ?? source.name));
  const country = clean(String(article.sourcecountry ?? source.region));
  const date = parseGdeltDate(String(article.seendate ?? ""));
  const seen = date ? new Date(date).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) : "recently";
  return `Reported by ${domain || source.name} (${country || source.region}) on ${seen}. Use this as a signal, then verify with primary documents, agency copy, and regional context before scripting.`;
}

function parseDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function clean(value: string) {
  return decodeMojibake(decodeEntities(value))
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsableSignal(title: string, summary: string, language?: string) {
  if (!title || !title.trim()) {
    return false;
  }

  if (language && language.toLowerCase() !== "english" && language.toLowerCase() !== "en") {
    return false;
  }

  const text = `${title} ${summary}`;
  if (/[\u0900-\u097f]/.test(text) || /[à¤à¥ÃÂâ]/.test(text)) {
    return false;
  }

  return /[a-z]/i.test(title);
}

function decodeMojibake(value: string) {
  if (!/[ÃÂà¤à¥â]/.test(value)) {
    return value;
  }

  try {
    const bytes = Uint8Array.from(value, (char) => char.charCodeAt(0) & 0xff);
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return value;
  }
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

function numberEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected error";
}
