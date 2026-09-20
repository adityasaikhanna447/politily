import type { PolitilyBrief, RuntimeEnv, StoredStory } from "./types";
import { deliverEmail } from "./delivery";
import { cleanText, headline, storySummary, topicLabel, istDate } from "./presentation";
import { canonicalIssueEventType } from "./issues";
import { groupIssues, linksForStory } from "./grouping";
export { groupIssues, linksForStory } from "./grouping";
export { getEmailSettings } from "./delivery";

const escape = (text: string) => cleanText(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const safeUrl = (value: string) => /^https?:\/\//i.test(value) ? escape(value) : "#";
const baseUrl = (env: RuntimeEnv) => (env.APP_BASE_URL || "https://politily.adityakhanna-tcc.workers.dev").replace(/\/$/, "");
const issueUrl = (env: RuntimeEnv, id: string, view = "issue") => `${baseUrl(env)}/?story=${encodeURIComponent(id)}&view=${view}`;

function wrapper(title: string, subtitle: string, content: string, env: RuntimeEnv) {
  return `<!doctype html><html><body style="margin:0;background:#f1f3f5;font-family:Arial,Helvetica,sans-serif;color:#18202a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="680" cellspacing="0" cellpadding="0" style="width:100%;max-width:680px;background:#ffffff;">
    <tr><td style="background:#101114;padding:28px 24px;border-top:4px solid #e54c55;color:#ffffff;">
    <p style="margin:0 0 20px;font-size:14px;font-weight:bold;">POLITILY / THE NEWSROOM</p><h1 style="margin:0;font-size:27px;line-height:1.25;">${escape(title)}</h1>
    <p style="margin:12px 0 0;font-size:14px;color:#c1c8d2;">${escape(subtitle)}</p></td></tr>
    <tr><td style="padding:24px;">${content}</td></tr>
    <tr><td style="padding:20px 24px;background:#e9edf2;font-size:12px;line-height:1.6;">Based on captured reports, not comprehensive world coverage. Publisher repetition does not establish independent verification. Scores estimate editorial priority, not truth or predicted views.<br><a href="${safeUrl(baseUrl(env))}" style="color:#1753b9;">Open the newsroom</a> &middot; Scheduled editions: 2 PM and 9 PM IST.</td></tr>
    </table></td></tr></table></body></html>`;
}

function storyRow(story: StoredStory, env: RuntimeEnv) {
  const summary = storySummary(story);
  const links = linksForStory(story);
  const names = new Set(links.map(link => link.sourceName.toLowerCase()));
  const date = story.publishedAt ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(story.publishedAt)) + " IST" : "Publication time not provided";
  return `<tr><td style="width:48px;vertical-align:top;border-bottom:1px solid #e0e4e9;padding:18px 10px 18px 0;"><strong style="font-size:23px;color:${story.totalScore >= 82 ? "#b62435" : "#1753b9"};">${story.totalScore}</strong><br><span style="font-size:10px;color:#657184;">/100</span></td>
    <td style="padding:18px 0;vertical-align:top;border-bottom:1px solid #e0e4e9;">
    <a href="${safeUrl(issueUrl(env, story.id))}" style="font-size:18px;line-height:1.35;font-weight:bold;color:#151922;text-decoration:none;">${escape(headline(story))}</a>
    <p style="font-size:14px;line-height:1.65;margin:10px 0;">${escape(summary || "This feed supplied a headline without a substantive excerpt. Read the linked reporting before drawing conclusions.")}</p>
    ${story.brief?.whyItMatters ? `<p style="font-size:14px;line-height:1.6;"><b>Saved analysis (${escape(story.brief.generatedAt)}):</b> ${escape(story.brief.whyItMatters)}</p>` : ""}
    <p style="font-size:12px;color:#647084;line-height:1.6;">${escape(date)} &middot; ${names.size} publisher${names.size === 1 ? "" : "s"} &middot; ${story.brief ? escape(story.brief.evidenceGrade) : "Reported; not independently verified"}</p>
    <p style="font-size:13px;line-height:1.8;">${links.slice(0, 6).map(link => `<a href="${safeUrl(link.url)}" style="color:#1753b9;">${escape(link.sourceName)}</a>`).join(" &middot; ")}</p>
    <a href="${safeUrl(issueUrl(env, story.id, "brief"))}" style="font-size:13px;font-weight:bold;color:#1753b9;">Open research &amp; generate brief &rarr;</a>
    </td></tr>`;
}

export async function sendSignalEmail(env: RuntimeEnv, story: StoredStory, kind: "urgent" | "priority" = "urgent") {
  const subject = `[Politily ${kind === "urgent" ? "Urgent" : "Priority pick"} ${story.totalScore}] ${headline(story)}`;
  return deliverEmail(env, { subject,
    html: wrapper(kind === "urgent" ? "Priority alert" : "Your priority pick", topicLabel(story),
      `<table width="100%" cellpadding="0" cellspacing="0">${storyRow(story, env)}</table>`, env),
    text: `${subject}\n\n${storySummary(story)}\n\n${linksForStory(story).map(l => `${l.sourceName}: ${l.url}`).join("\n")}\n\n${issueUrl(env, story.id)}`,
  }, { key: `issue-alert-${story.id}-${istDate()}-${canonicalIssueEventType(story)}`, kind, storyId: story.id });
}

export async function sendBriefEmail(env: RuntimeEnv, story: StoredStory, brief: PolitilyBrief) {
  return sendSignalEmail(env, { ...story, brief });
}

export async function sendTestEmail(env: RuntimeEnv) {
  return deliverEmail(env, { subject: "[Politily] Delivery connection test",
    html: wrapper("Your newsroom is connected", "Delivery test", "<p>If you are reading this in your inbox, this message reached you successfully.</p>", env),
    text: `Politily email connection test.\n${baseUrl(env)}`,
  }, { key: `test-${crypto.randomUUID()}`, kind: "test" });
}

export async function sendStrategicDigestEmail(env: RuntimeEnv, stories: StoredStory[], options: {
  startIso: string; endIso: string; label: string; key?: string;
}) {
  const allIssues = groupIssues(stories).sort((a, b) => b.totalScore - a.totalScore);
  const issues = allIssues.slice(0, 60);
  const sourceCount = new Set(issues.flatMap(s => linksForStory(s).map(l => l.sourceName.toLowerCase()))).size;
  const topics = [...new Set(issues.map(topicLabel))];
  const introduction = `<p style="font-size:14px;line-height:1.6;margin-top:0;">${issues.length} grouped issues &middot; ${sourceCount} publishers &middot; India &amp; world</p>
    <p style="font-size:13px;color:#657184;line-height:1.6;">${issues.length ? "A topic-by-topic reading list with source links. Full analysis is included where a research brief exists; other entries are publisher excerpts, not AI analysis." : "No reports were captured for this edition. Check Sources and scan errors in the newsroom; this does not mean no news occurred."}${allIssues.length > issues.length ? ` Showing the top ${issues.length} of ${allIssues.length} captured issues; the full list is in the newsroom.` : ""}</p>`;
  const content = introduction + topics.map(topic => `<h2 style="font-size:17px;margin:28px 0 0;padding:12px 0;border-bottom:2px solid #1c57ad;">${escape(topic)}</h2>
    <table width="100%" cellpadding="0" cellspacing="0">${issues.filter(s => topicLabel(s) === topic).map(s => storyRow(s, env)).join("")}</table>`).join("");
  const subject = `[Politily] ${options.label} | ${issues.length} issues`;
  const result = await deliverEmail(env, { subject, html: wrapper("The daily briefing", options.label, content, env),
    text: `${subject}\n\n${issues.map(s => `${topicLabel(s)} | ${s.totalScore}/100\n${headline(s)}\n${storySummary(s)}\n${linksForStory(s).map(l => `${l.sourceName}: ${l.url}`).join("\n")}\n${issueUrl(env, s.id)}`).join("\n\n")}\n\n${baseUrl(env)}`,
  }, { key: options.key || `manual-digest-${crypto.randomUUID()}`, kind: options.key ? "newsletter" : "manual" });
  return { ...result, issueCount: issues.length, storyCount: stories.length, sourceCount };
}
