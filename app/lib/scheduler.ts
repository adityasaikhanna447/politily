import { acquireLease, releaseLease, retryPendingEmails } from "./delivery";
import { groupIssues, sendSignalEmail } from "./email";
import { sendDueScheduledDigests } from "./monitor";
import { istDate } from "./presentation";
import { attachStorySources, ensureDatabase, listRecentStories } from "./storage";
import type { RuntimeEnv } from "./types";
import { freeMode, remainingQueries } from "./database-protection";

export function priorityTarget(now = new Date()) {
  const hour = new Date(now.getTime() + 330 * 60000).getUTCHours();
  return [10, 12, 14, 17, 20].filter(checkpoint => hour >= checkpoint).length;
}

export async function runMailScheduler(env: RuntimeEnv, now = new Date()) {
  if (!env.DB) throw new Error("Mail scheduler: D1 is not configured");
  const db = env.DB;
  await ensureDatabase(db);
  const owner = await acquireLease(db, "mail-scheduler", 180);
  if (!owner) return;
  try {
    await retryPendingEmails(env);
    await sendDueScheduledDigests(env, now);
    if (remainingQueries() < 16) return;
    const start = new Date(`${istDate(now)}T00:00:00+05:30`).toISOString();
    const sent = await db.prepare("SELECT story_id, status FROM email_outbox WHERE created_at>=? AND kind IN ('priority','urgent')")
      .bind(start).all<{ story_id: string; status: string }>();
    const ids = new Set(sent.results.map(row => row.story_id));
    const candidates = groupIssues((await listRecentStories(db, 160, 0)).filter(story => {
      const age = now.getTime() - Date.parse(story.publishedAt || story.detectedAt);
      return age >= 0 && age < 24 * 3600000 && !story.emailSentAt && !ids.has(story.id) && story.totalScore >= 60;
    }));
    const urgent = Number(env.POLITILY_ALERT_MIN_SCORE || 82);
    let remaining = Math.max(0, priorityTarget(now) - ids.size);
    const selected = candidates.filter(story => story.totalScore >= urgent || remaining-- > 0)
      .sort((a, b) => b.totalScore - a.totalScore).slice(0, freeMode(env) ? 1 : 5);
    await attachStorySources(db, selected);
    for (const story of selected) await sendSignalEmail(env, story, story.totalScore >= urgent ? "urgent" : "priority");
  } finally {
    await releaseLease(db, "mail-scheduler", owner);
  }
}
