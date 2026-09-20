import { ensureDatabase, markEmailSent } from "./storage";
import type { RuntimeEnv } from "./types";
import { freeMode } from "./database-protection";

export interface MailPayload { subject: string; html: string; text: string }
export interface MailJob { key: string; kind: string; storyId?: string }
interface OutboxRow {
  id: string; kind: string; story_id: string | null; payload_json: string;
  status: string; attempts: number; created_at: string; provider_id: string | null;
}

export function getEmailSettings(env: RuntimeEnv) {
  const first = (...values: Array<string | undefined>) => values.map(v => v?.trim()).find(Boolean) || "";
  const apiKey = first(env.RESEND_API_KEY);
  const to = first(env.ALERT_EMAIL, env.POLITILY_ALERT_EMAIL, env.EMAIL_TO);
  const from = first(env.ALERT_FROM_EMAIL, env.ALERT_FROM_MAIL, env.POLITILY_ALERT_FROM_EMAIL, env.RESEND_FROM_EMAIL);
  const missing = [!apiKey && "RESEND_API_KEY", !to && "ALERT_EMAIL", !from && "ALERT_FROM_EMAIL"].filter(Boolean);
  return { apiKey, to, from, missing, ready: missing.length === 0,
    message: missing.length ? `Missing settings: ${missing.join(", ")}` : "Email settings configured" };
}

export async function acquireLease(db: D1Database, name: string, seconds = 90) {
  const owner = crypto.randomUUID();
  const now = new Date().toISOString();
  const row = await db.prepare(`INSERT INTO app_locks (name, owner, expires_at) VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET owner=excluded.owner, expires_at=excluded.expires_at
    WHERE app_locks.expires_at <= ? RETURNING owner`)
    .bind(name, owner, new Date(Date.now() + seconds * 1000).toISOString(), now).first<{ owner: string }>();
  return row?.owner === owner ? owner : null;
}

export async function releaseLease(db: D1Database, name: string, owner: string) {
  await db.prepare("DELETE FROM app_locks WHERE name=? AND owner=?").bind(name, owner).run();
}

export async function deliverEmail(env: RuntimeEnv, payload: MailPayload, job: MailJob) {
  if (!env.DB) return { sent: false, message: "Email queue requires the D1 database." };
  await ensureDatabase(env.DB);
  const now = new Date().toISOString();
  // Freeze the payload for this idempotency key. A retry must send the same email.
  const settings = getEmailSettings(env);
  await env.DB.prepare(`INSERT OR IGNORE INTO email_outbox
    (id, kind, story_id, subject, payload_json, status, created_at, updated_at, next_attempt_at)
    VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?)`)
    .bind(job.key, job.kind, job.storyId || null, payload.subject,
      JSON.stringify({ ...payload, from: settings.from, to: settings.to ? [settings.to] : [] }), now, now, now).run();
  return attemptDelivery(env, job.key);
}

export async function attemptDelivery(env: RuntimeEnv, id: string) {
  const db = env.DB!;
  const now = new Date().toISOString();
  const existing = await db.prepare("SELECT id, status, provider_id FROM email_outbox WHERE id=?")
    .bind(id).first<OutboxRow>();
  if (existing?.status === "accepted") return { sent: true, message: "Already accepted by Resend.", providerId: existing.provider_id };
  const row = await db.prepare(`UPDATE email_outbox SET status='sending', attempts=attempts+1,
    lease_until=?, updated_at=? WHERE id=? AND attempts<8 AND next_attempt_at<=?
    AND (status IN ('queued','failed') OR (status='sending' AND lease_until<=?)) RETURNING *`)
    .bind(new Date(Date.now() + 45000).toISOString(), now, id, now, now).first<OutboxRow>();
  if (!row) return { sent: false, message: "Queued for retry or already being processed. Check Delivery." };
  try {
    if (Date.now() - Date.parse(row.created_at) >= 23 * 3600000) {
      await db.prepare("UPDATE email_outbox SET status='expired', last_error=?, updated_at=? WHERE id=?")
        .bind("Retry window expired. Check Resend before manually sending again to avoid a duplicate.", now, id).run();
      return { sent: false, message: "Retry window expired. Check Resend delivery log." };
    }
    const settings = getEmailSettings(env);
    if (!settings.ready) throw new Error(settings.message);
    const body = JSON.parse(row.payload_json);
    // Configuration can be completed after a job is queued, before its first API attempt.
    if (!body.from || !body.to?.length) {
      body.from = settings.from; body.to = [settings.to];
      await db.prepare("UPDATE email_outbox SET payload_json=? WHERE id=?").bind(JSON.stringify(body), id).run();
    }
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", signal: AbortSignal.timeout(12000),
      headers: { Authorization: `Bearer ${settings.apiKey}`, "Content-Type": "application/json", "Idempotency-Key": id },
      body: JSON.stringify(body),
    });
    const result = await response.json() as { id?: string; message?: string; name?: string };
    if (!response.ok || !result.id) throw new Error(`Resend HTTP ${response.status}: ${result.message || result.name || "No message ID returned"}`);
    await db.prepare("UPDATE email_outbox SET status='accepted', provider_id=?, accepted_at=?, updated_at=?, lease_until=NULL, last_error='' WHERE id=?")
      .bind(result.id, now, now, id).run();
    if (row.story_id) await markEmailSent(db, row.story_id);
    return { sent: true, message: "Accepted by Resend. Inbox delivery can be checked in Resend Emails.", providerId: result.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Email delivery failed";
    const delay = Math.min(3600000, 60000 * 2 ** Math.min(row.attempts, 6));
    await db.prepare("UPDATE email_outbox SET status='failed', last_error=?, next_attempt_at=?, updated_at=?, lease_until=NULL WHERE id=?")
      .bind(message.slice(0, 500), new Date(Date.now() + delay).toISOString(), now, id).run();
    console.error("Politily email failed", { id, attempt: row.attempts, message });
    return { sent: false, message: `${message}. Saved for retry; see Delivery.` };
  }
}

export async function retryPendingEmails(env: RuntimeEnv) {
  if (!env.DB) return;
  await ensureDatabase(env.DB);
  const now = new Date().toISOString();
  const rows = await env.DB.prepare(`SELECT id FROM email_outbox WHERE status IN ('queued','failed','sending')
    AND attempts<8 AND next_attempt_at<=? AND (lease_until IS NULL OR lease_until<=?)
    ORDER BY next_attempt_at LIMIT ?`).bind(now, now, freeMode(env) ? 1 : 6).all<{ id: string }>();
  for (const row of rows.results) await attemptDelivery(env, row.id);
}
