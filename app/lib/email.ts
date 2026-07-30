import type { PolitilyBrief, RuntimeEnv, StoredStory, StorySourceLink } from "./types";
import {
  areSameIssue,
  canonicalIssueKey,
  canonicalIssueLabel,
  issueSimilarity,
} from "./issues";

interface DigestOptions {
  startIso: string;
  endIso: string;
  label: string;
}

interface DigestIssue {
  id: string;
  label: string;
  lead: StoredStory;
  stories: StoredStory[];
  sourceLinks: StorySourceLink[];
  sources: string[];
  score: number;
}

const DEFAULT_APP_BASE_URL = "https://politily.adityakhanna-tcc.workers.dev/";

export async function sendBriefEmail(
  env: RuntimeEnv,
  story: StoredStory,
  brief: PolitilyBrief
) {
  if (!env.RESEND_API_KEY || !env.ALERT_EMAIL || !env.ALERT_FROM_EMAIL) {
    return {
      sent: false,
      message:
        "Email skipped. Set RESEND_API_KEY, ALERT_EMAIL, and ALERT_FROM_EMAIL to enable alerts.",
    };
  }

  const storyLink = issueLink(env, story.id);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.ALERT_FROM_EMAIL,
      to: [env.ALERT_EMAIL],
      subject: `[Politily ${story.totalScore}] ${story.title}`,
      html: buildHtml(story, brief, storyLink),
      text: buildText(story, brief, storyLink),
    }),
  });

  if (!response.ok) {
    return {
      sent: false,
      message: `Resend returned HTTP ${response.status}${await shortResponseBody(response)}.`,
    };
  }

  return { sent: true, message: "Alert email sent." };
}

export async function sendSignalEmail(env: RuntimeEnv, story: StoredStory) {
  if (!env.RESEND_API_KEY || !env.ALERT_EMAIL || !env.ALERT_FROM_EMAIL) {
    return {
      sent: false,
      message:
        "Signal email skipped. Set RESEND_API_KEY, ALERT_EMAIL, and ALERT_FROM_EMAIL to enable alerts.",
    };
  }

  const storyLink = issueLink(env, story.id);
  const briefLink = briefPageLink(env, story.id);
  const sources = uniqueEmailStrings([
    story.sourceName,
    ...(story.sourceLinks ?? []).map((link) => link.sourceName),
  ]);

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.ALERT_FROM_EMAIL,
      to: [env.ALERT_EMAIL],
      subject: `[Politily Signal ${story.totalScore}] ${cleanEmailText(story.title)}`,
      html: buildSignalHtml(story, storyLink, briefLink, sources),
      text: buildSignalText(story, storyLink, briefLink, sources),
    }),
  });

  if (!response.ok) {
    return {
      sent: false,
      message: `Resend signal returned HTTP ${response.status}${await shortResponseBody(response)}.`,
    };
  }

  return { sent: true, message: "Signal email sent." };
}

export async function sendTestEmail(env: RuntimeEnv) {
  if (!env.RESEND_API_KEY || !env.ALERT_EMAIL || !env.ALERT_FROM_EMAIL) {
    return {
      sent: false,
      message:
        "Email test skipped. Set RESEND_API_KEY, ALERT_EMAIL, and ALERT_FROM_EMAIL first.",
    };
  }

  const appLink = appBaseUrl(env);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.ALERT_FROM_EMAIL,
      to: [env.ALERT_EMAIL],
      subject: "[Politily] Test email notification",
      html: `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#080b0d;color:#f4efe6;margin:0;padding:28px;"><main style="max-width:620px;margin:0 auto;"><p style="letter-spacing:.12em;text-transform:uppercase;color:#9aa4a8;font-size:12px;">Politily email test</p><h1 style="margin:0 0 12px;">Resend is connected</h1><p>This confirms Politily can send email alerts from Cloudflare Workers through Resend.</p><p><a href="${escapeHtml(appLink)}" style="color:#8dbdff;">Open Politily</a></p></main></body></html>`,
      text: `Politily email test\n\nResend is connected. This confirms Politily can send email alerts from Cloudflare Workers through Resend.\n\nOpen: ${appLink}`,
    }),
  });

  if (!response.ok) {
    return {
      sent: false,
      message: `Resend test returned HTTP ${response.status}${await shortResponseBody(response)}.`,
    };
  }

  return { sent: true, message: "Test email sent. Check your inbox and Resend Emails tab." };
}

export async function sendStrategicDigestEmail(
  env: RuntimeEnv,
  stories: StoredStory[],
  options: DigestOptions
) {
  if (!env.RESEND_API_KEY || !env.ALERT_EMAIL || !env.ALERT_FROM_EMAIL) {
    return {
      sent: false,
      message:
        "Digest skipped. Set RESEND_API_KEY, ALERT_EMAIL, and ALERT_FROM_EMAIL first.",
    };
  }

  const issues = buildDigestIssues(stories).slice(0, 15);
  const sourceCount = new Set(issues.flatMap((issue) => issue.sources)).size;
  const topScore = issues[0]?.score ?? 0;
  const appLink = appBaseUrl(env);
  const subject = `[Politily Digest] ${options.label}: ${issues.length} issues, top score ${topScore}`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.ALERT_FROM_EMAIL,
      to: [env.ALERT_EMAIL],
      subject,
      html: buildDigestHtml(issues, stories, options, sourceCount, appLink),
      text: buildDigestText(issues, stories, options, sourceCount, appLink),
    }),
  });

  if (!response.ok) {
    return {
      sent: false,
      message: `Resend digest returned HTTP ${response.status}${await shortResponseBody(response)}.`,
    };
  }

  return {
    sent: true,
    message: `Strategic digest sent for ${options.label}.`,
    issueCount: issues.length,
    storyCount: stories.length,
    sourceCount,
  };
}

function buildSignalHtml(story: StoredStory, storyLink: string, briefLink: string, sources: string[]) {
  const links = (story.sourceLinks ?? [])
    .slice(0, 8)
    .map((link) => `<li><a href="${escapeHtml(link.url)}" style="color:#8dbdff;">${escapeHtml(cleanEmailText(link.sourceName))}</a> - ${escapeHtml(cleanEmailText(link.title))}</li>`)
    .join("");

  return `<!doctype html>
  <html>
    <body style="margin:0;background:#050708;color:#f6efe4;font-family:Arial,sans-serif;">
      <main style="max-width:720px;margin:0 auto;padding:28px;">
        <p style="letter-spacing:.14em;text-transform:uppercase;color:#8fa0a8;font-size:12px;margin:0 0 8px;">Politily fast signal</p>
        <h1 style="font-size:26px;line-height:1.18;margin:0 0 12px;">${escapeHtml(cleanEmailText(story.title))}</h1>
        <p style="color:#d9dddc;line-height:1.55;margin:0 0 14px;">${escapeHtml(issueBioForEmail(story, sources))}</p>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:0 0 18px;">
          ${digestStat("Total", String(story.totalScore))}
          ${digestStat("Viral", String(story.viralPotential))}
          ${digestStat("Political", String(story.politicalWeight))}
          ${digestStat("Sources", String(Math.max(1, sources.length)))}
        </div>
        <p style="border-left:3px solid #3b9cff;padding-left:12px;color:#f2eee6;line-height:1.55;margin:0 0 14px;"><strong>Why this email:</strong> This crossed the instant ${escapeHtml(String(story.totalScore))}/100 signal rule or strengthened a watched issue. It is worth opening the issue page before recording.</p>
        <p style="border-left:3px solid #d6cec2;padding-left:12px;color:#f2eee6;line-height:1.55;margin:0 0 14px;"><strong>Creator next step:</strong> Open the issue page, inspect the source trail, then generate the deep brief only if the evidence is strong enough.</p>
        <p style="color:#b7bdbe;line-height:1.55;margin:0 0 8px;"><strong>Source mix:</strong> ${escapeHtml(sources.join(", ") || story.sourceName)}</p>
        ${links ? `<ul style="color:#b7bdbe;line-height:1.55;margin:8px 0 14px;padding-left:18px;">${links}</ul>` : ""}
        <p style="margin:18px 0 0;">
          <a href="${escapeHtml(storyLink)}" style="display:inline-block;background:#d6cec2;color:#050708;text-decoration:none;font-weight:800;border-radius:8px;padding:11px 14px;margin:0 8px 8px 0;">Open full issue</a>
          <a href="${escapeHtml(briefLink)}" style="display:inline-block;border:1px solid #314047;color:#f6efe4;text-decoration:none;font-weight:800;border-radius:8px;padding:10px 14px;margin:0 8px 8px 0;">Generate brief</a>
        </p>
      </main>
    </body>
  </html>`;
}

function buildSignalText(story: StoredStory, storyLink: string, briefLink: string, sources: string[]) {
  return `Politily fast signal

${cleanEmailText(story.title)}

Score: ${story.totalScore}/100
Viral: ${story.viralPotential}/100
Political: ${story.politicalWeight}/100
Sources: ${sources.join(", ") || story.sourceName}

What happened:
${issueBioForEmail(story, sources)}

Open full issue: ${storyLink}
Generate brief page: ${briefLink}`;
}

function buildHtml(story: StoredStory, brief: PolitilyBrief, storyLink: string) {
  const facts = brief.factsAndFigures.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const dataPoints = (brief.dataPoints ?? []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const questions = (brief.researchQuestions ?? []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const noVideoUntil = (brief.noVideoUntil ?? []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const sourcePositions = (brief.sourcePositions ?? []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const next = brief.whatHappensNext.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const sources = brief.citedUrls
    .map((url) => `<li><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></li>`)
    .join("");

  return `<!doctype html>
  <html>
    <body style="margin:0;background:#f6f4ee;color:#191917;font-family:Arial,sans-serif;">
      <main style="max-width:720px;margin:0 auto;padding:28px;">
        <p style="letter-spacing:.12em;text-transform:uppercase;color:#6b665d;font-size:12px;">Politily Signal</p>
        <h1 style="font-size:26px;line-height:1.2;margin:0 0 12px;">${escapeHtml(brief.briefTitle)}</h1>
        <p style="font-size:18px;line-height:1.55;margin:0 0 20px;">${escapeHtml(brief.hook)}</p>
        <p><strong>Score:</strong> ${story.totalScore}/100 ${typeof brief.researchDepthScore === "number" ? `| <strong>Research depth:</strong> ${brief.researchDepthScore}/100` : ""}</p>
        <p>${escapeHtml(brief.whatHappened)}</p>
        <h2>Why it matters</h2>
        <p>${escapeHtml(brief.whyItMatters)}</p>
        <h2>Context</h2>
        <p>${escapeHtml(brief.historicalContext)}</p>
        <p>${escapeHtml(brief.geographicalContext)}</p>
        <h2>Institutional accountability</h2>
        <p>${escapeHtml(brief.institutionalContext || "Regenerate this brief to get institutional accountability context.")}</p>
        ${dataPoints ? `<h2>Data points</h2><ul>${dataPoints}</ul>` : ""}
        ${questions ? `<h2>Hard research questions</h2><ul>${questions}</ul>` : ""}
        ${noVideoUntil ? `<h2>No video until</h2><ul>${noVideoUntil}</ul>` : ""}
        <h2>Facts and figures</h2>
        <ul>${facts}</ul>
        ${sourcePositions ? `<h2>Source positions</h2><ul>${sourcePositions}</ul>` : ""}
        <h2>What happens next</h2>
        <ul>${next}</ul>
        <h2>Roman Hindi creator script</h2>
        <pre style="white-space:pre-wrap;background:#fffdfa;border:1px solid #d9d3c3;padding:16px;border-radius:8px;">${escapeHtml(
          brief.videoScript
        )}</pre>
        <h2>Sources</h2>
        <ul>${sources}</ul>
        <p><a href="${escapeHtml(storyLink)}">Open in Politily</a></p>
      </main>
    </body>
  </html>`;
}

function buildDigestHtml(
  issues: DigestIssue[],
  stories: StoredStory[],
  options: DigestOptions,
  sourceCount: number,
  appLink: string
) {
  const issueHtml = issues.length
    ? buildDigestTableHtml(issues, appLink)
    : `<section style="border:1px solid #263135;border-radius:12px;padding:18px;background:#0f1517;">
        <h2 style="margin:0 0 8px;color:#f6efe4;">No stored stories found</h2>
        <p style="color:#b7bdbe;line-height:1.6;margin:0;">Politily did not find saved political signals for this date range. Run scan, then send the digest again.</p>
      </section>`;

  return `<!doctype html>
  <html>
    <body style="margin:0;background:#050708;color:#f6efe4;font-family:Arial,sans-serif;">
      <main style="max-width:760px;margin:0 auto;padding:28px;">
        <p style="letter-spacing:.14em;text-transform:uppercase;color:#8fa0a8;font-size:12px;margin:0 0 8px;">Politily newsroom digest</p>
        <h1 style="font-size:28px;line-height:1.15;margin:0 0 12px;">${escapeHtml(options.label)}</h1>
        <p style="color:#c7ccca;line-height:1.6;margin:0 0 20px;">Two scheduled reports only: midday and end-of-day. This table uses stored open-source signals and spends 0 Gemini tokens; generate a deep brief only for stories you want to script.</p>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:0 0 20px;">
          ${digestStat("Issues", String(issues.length))}
          ${digestStat("Reports", String(stories.length))}
          ${digestStat("Sources", String(sourceCount))}
        </div>
        ${issueHtml}
        <p style="margin:24px 0 0;"><a href="${escapeHtml(appLink)}" style="color:#8dbdff;">Open Politily dashboard</a></p>
      </main>
    </body>
  </html>`;
}

function buildDigestTableHtml(issues: DigestIssue[], appLink: string) {
  const groups = groupDigestIssuesByTopic(issues);
  let rank = 0;
  const rows = groups
    .map((group) => {
      const issueRows = group.issues
        .map((issue) => {
          rank += 1;
          return buildDigestIssueRowHtml(issue, rank, appLink);
        })
        .join("");

      return `<tr>
          <td colspan="5" style="padding:12px 10px;background:#111a1d;border-top:1px solid #263135;border-bottom:1px solid #263135;color:#d6cec2;font-weight:900;letter-spacing:.08em;text-transform:uppercase;font-size:12px;">
            ${escapeHtml(group.topic)} <span style="color:#8fa0a8;font-weight:700;">${group.issues.length} issue${group.issues.length === 1 ? "" : "s"}</span>
          </td>
        </tr>${issueRows}`;
    })
    .join("");

  return `<section style="border:1px solid #263135;border-radius:12px;background:#0f1517;overflow:hidden;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;">
      <thead>
        <tr>
          <th align="left" style="padding:12px 10px;color:#8fa0a8;background:#0b1012;border-bottom:1px solid #263135;text-transform:uppercase;font-size:11px;">Rank</th>
          <th align="left" style="padding:12px 10px;color:#8fa0a8;background:#0b1012;border-bottom:1px solid #263135;text-transform:uppercase;font-size:11px;">Issue</th>
          <th align="left" style="padding:12px 10px;color:#8fa0a8;background:#0b1012;border-bottom:1px solid #263135;text-transform:uppercase;font-size:11px;">Why it matters</th>
          <th align="left" style="padding:12px 10px;color:#8fa0a8;background:#0b1012;border-bottom:1px solid #263135;text-transform:uppercase;font-size:11px;">Source trail</th>
          <th align="left" style="padding:12px 10px;color:#8fa0a8;background:#0b1012;border-bottom:1px solid #263135;text-transform:uppercase;font-size:11px;">Action</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

function buildDigestIssueRowHtml(issue: DigestIssue, rank: number, appLink: string) {
  const lead = issue.lead;
  const storyLink = `${appLink.replace(/\/$/, "")}/?story=${encodeURIComponent(lead.id)}&view=issue`;
  const briefLink = `${appLink.replace(/\/$/, "")}/?story=${encodeURIComponent(lead.id)}&view=brief`;
  const sourceLinks = sourceLinksForEmail(issue);
  const sourceHtml = sourceLinks.length
    ? sourceLinks
        .map(
          (link) =>
            `<a href="${escapeHtml(link.url)}" style="display:block;color:#8dbdff;text-decoration:none;margin:0 0 6px;">${escapeHtml(cleanEmailText(link.sourceName))}: ${escapeHtml(truncateEmail(link.title, 76))}</a>`
        )
        .join("")
    : `<span style="color:#b7bdbe;">${escapeHtml(issue.sources.join(", ") || lead.sourceName)}</span>`;
  const related = issue.stories
    .slice(0, 3)
    .map((story) => cleanEmailText(story.title))
    .filter((title) => title && title !== issue.label)
    .map((title) => `<li style="margin:0 0 4px;">${escapeHtml(truncateEmail(title, 92))}</li>`)
    .join("");

  return `<tr>
    <td valign="top" style="padding:14px 10px;border-bottom:1px solid #263135;width:72px;">
      <div style="font-size:12px;color:#8fa0a8;font-weight:800;">#${rank}</div>
      <div style="font-size:26px;line-height:1;color:#f6efe4;font-weight:900;margin-top:4px;">${issue.score}</div>
      <div style="font-size:10px;color:#8fa0a8;text-transform:uppercase;font-weight:800;margin-top:4px;">Score</div>
    </td>
    <td valign="top" style="padding:14px 10px;border-bottom:1px solid #263135;width:25%;">
      <div style="display:inline-block;border:1px solid ${topicColor(topicForStory(lead))};color:#f6efe4;border-radius:999px;padding:3px 8px;font-size:11px;font-weight:900;text-transform:uppercase;margin:0 0 8px;">${escapeHtml(topicForStory(lead))}</div>
      <h2 style="font-size:17px;line-height:1.25;margin:0;color:#fffaf0;">${escapeHtml(issue.label)}</h2>
      <p style="color:#8fa0a8;font-size:12px;line-height:1.45;margin:8px 0 0;">${issue.sources.length} sources | ${issue.stories.length} reports</p>
    </td>
    <td valign="top" style="padding:14px 10px;border-bottom:1px solid #263135;width:31%;">
      <p style="color:#d9dddc;line-height:1.5;margin:0 0 8px;">${escapeHtml(issueBioForEmail(lead, issue.sources))}</p>
      <p style="color:#d6cec2;line-height:1.45;margin:0;"><strong>Creator angle:</strong> ${escapeHtml(truncateEmail(videoAngleForEmail(lead), 180))}</p>
      <p style="color:#b7bdbe;line-height:1.45;margin:8px 0 0;"><strong>Verification:</strong> ${escapeHtml(truncateEmail(verificationForEmail(issue), 160))}</p>
    </td>
    <td valign="top" style="padding:14px 10px;border-bottom:1px solid #263135;width:26%;">
      ${sourceHtml}
      ${related ? `<ul style="padding-left:16px;margin:8px 0 0;color:#b7bdbe;line-height:1.35;font-size:12px;">${related}</ul>` : ""}
    </td>
    <td valign="top" style="padding:14px 10px;border-bottom:1px solid #263135;width:112px;">
      <a href="${escapeHtml(storyLink)}" style="display:block;background:#d6cec2;color:#050708;text-decoration:none;font-weight:900;border-radius:8px;padding:10px 12px;text-align:center;margin:0 0 8px;">Open</a>
      <a href="${escapeHtml(briefLink)}" style="display:block;border:1px solid #314047;color:#f6efe4;text-decoration:none;font-weight:900;border-radius:8px;padding:9px 12px;text-align:center;">Brief</a>
    </td>
  </tr>`;
}

function buildDigestIssueHtml(issue: DigestIssue, rank: number, appLink: string) {
  const lead = issue.lead;
  const storyLink = `${appLink.replace(/\/$/, "")}/?story=${encodeURIComponent(lead.id)}&view=issue`;
  const briefLink = `${appLink.replace(/\/$/, "")}/?story=${encodeURIComponent(lead.id)}&view=brief`;
  const sources = issue.sourceLinks.slice(0, 7)
    .map((link) => `<li><a href="${escapeHtml(link.url)}" style="color:#8dbdff;">${escapeHtml(cleanEmailText(link.sourceName))}</a> - ${escapeHtml(cleanEmailText(link.title))}</li>`)
    .join("");
  const sourceNames = issue.sources.slice(0, 8).map((source) => escapeHtml(source)).join(", ");

  return `<section style="border:1px solid #263135;border-radius:12px;padding:18px;background:#0f1517;margin:0 0 14px;">
    <p style="margin:0 0 8px;color:#d5c9b6;font-weight:700;">#${rank} | Score ${issue.score}/100 | ${escapeHtml(topicForStory(lead))} | ${issue.sources.length} sources | ${issue.stories.length} reports</p>
    <h2 style="font-size:22px;line-height:1.25;margin:0 0 10px;color:#fffaf0;">${escapeHtml(issue.label)}</h2>
    <p style="color:#d9dddc;line-height:1.55;margin:0 0 12px;">${escapeHtml(issueBioForEmail(lead, issue.sources))}</p>
    <div style="border-left:3px solid #3b9cff;padding-left:12px;margin:0 0 12px;color:#f2eee6;">
      <strong>Creator angle:</strong> ${escapeHtml(videoAngleForEmail(lead))}
    </div>
    <p style="color:#b7bdbe;line-height:1.55;margin:0 0 8px;"><strong>Verification:</strong> ${escapeHtml(verificationForEmail(issue))}</p>
    <p style="color:#b7bdbe;line-height:1.55;margin:0 0 8px;"><strong>Source mix:</strong> ${sourceNames || escapeHtml(lead.sourceName)}</p>
    ${sources ? `<ul style="color:#b7bdbe;line-height:1.55;margin:8px 0 14px;padding-left:18px;">${sources}</ul>` : ""}
    <p style="margin:16px 0 0;">
      <a href="${escapeHtml(storyLink)}" style="display:inline-block;background:#d6cec2;color:#050708;text-decoration:none;font-weight:800;border-radius:8px;padding:10px 13px;margin:0 8px 8px 0;">Open issue</a>
      <a href="${escapeHtml(briefLink)}" style="display:inline-block;border:1px solid #314047;color:#f6efe4;text-decoration:none;font-weight:800;border-radius:8px;padding:9px 13px;margin:0 8px 8px 0;">Generate brief</a>
    </p>
  </section>`;
}

function buildDigestText(
  issues: DigestIssue[],
  stories: StoredStory[],
  options: DigestOptions,
  sourceCount: number,
  appLink: string
) {
  const lines = [
    `Politily newsroom digest: ${options.label}`,
    "",
    `Issues: ${issues.length}`,
    `Reports: ${stories.length}`,
    `Sources: ${sourceCount}`,
    "",
    "This digest uses stored open-source signals only. Gemini tokens are used only when you generate a deep brief.",
    "",
  ];

  if (!issues.length) {
    lines.push("No stored political stories found for this date range. Run scan and send the digest again.");
  }

  let rank = 0;
  groupDigestIssuesByTopic(issues).forEach((group) => {
    lines.push(`## ${group.topic}`);
    group.issues.forEach((issue) => {
      rank += 1;
      const lead = issue.lead;
      lines.push(
        `#${rank} ${issue.label}`,
        `Score: ${issue.score}/100 | Sources: ${issue.sources.length} | Reports: ${issue.stories.length}`,
        `Issue bio: ${issueBioForEmail(lead, issue.sources)}`,
        `Creator angle: ${videoAngleForEmail(lead)}`,
        `Verification: ${verificationForEmail(issue)}`,
        `Source mix: ${issue.sources.join(", ") || lead.sourceName}`,
        ...sourceLinksForEmail(issue).slice(0, 5).map((link) => `- ${link.sourceName}: ${link.title} (${link.url})`),
        `Open issue: ${appLink.replace(/\/$/, "")}/?story=${encodeURIComponent(lead.id)}&view=issue`,
        `Generate brief: ${appLink.replace(/\/$/, "")}/?story=${encodeURIComponent(lead.id)}&view=brief`,
        ""
      );
    });
  });

  lines.push(`Dashboard: ${appLink}`);
  return lines.join("\n");
}

function digestStat(label: string, value: string) {
  return `<div style="border:1px solid #263135;border-radius:10px;padding:12px;background:#0b1012;">
    <span style="display:block;color:#8fa0a8;font-size:11px;text-transform:uppercase;font-weight:700;">${escapeHtml(label)}</span>
    <strong style="display:block;font-size:24px;color:#f6efe4;margin-top:4px;">${escapeHtml(value)}</strong>
  </div>`;
}

function buildDigestIssues(stories: StoredStory[]) {
  const issues: DigestIssue[] = [];
  const sorted = stories.slice().sort((left, right) => right.totalScore - left.totalScore || right.viralPotential - left.viralPotential);

  sorted.forEach((story) => {
    const key = issueKeyForEmail(story);
    const existing =
      issues.find((issue) => issue.id === key) ||
      issues.find((issue) => areSameIssue(issue.lead, story) || issueSimilarity(issue.lead, story) >= 0.48);
    const links = uniqueEmailLinks([
      ...(story.sourceLinks ?? []),
      {
        id: story.id,
        storyId: story.id,
        title: story.title,
        url: story.url,
        sourceName: story.sourceName,
        publishedAt: story.publishedAt,
      },
    ]);
    const sources = uniqueEmailStrings([story.sourceName, ...links.map((link) => link.sourceName)]);

    if (existing) {
      existing.stories.push(story);
      existing.sourceLinks = uniqueEmailLinks(existing.sourceLinks.concat(links));
      existing.sources = uniqueEmailStrings(existing.sources.concat(sources));
      existing.score = Math.max(existing.score, story.totalScore);
      if (story.totalScore > existing.lead.totalScore) {
        existing.lead = story;
        existing.label = issueLabelForEmail(story);
      }
      return;
    }

    issues.push({
      id: key,
      label: issueLabelForEmail(story),
      lead: story,
      stories: [story],
      sourceLinks: links,
      sources,
      score: story.totalScore,
    });
  });

  return issues.sort((left, right) => right.score - left.score || right.sources.length - left.sources.length);
}

function groupDigestIssuesByTopic(issues: DigestIssue[]) {
  const groups = new Map<string, DigestIssue[]>();
  issues.forEach((issue) => {
    const topic = topicForStory(issue.lead);
    groups.set(topic, [...(groups.get(topic) ?? []), issue]);
  });

  return Array.from(groups.entries())
    .map(([topic, topicIssues]) => ({
      topic,
      issues: topicIssues.sort((left, right) => right.score - left.score || right.sources.length - left.sources.length),
    }))
    .sort((left, right) => {
      const weightDiff = topicWeight(left.topic) - topicWeight(right.topic);
      if (weightDiff !== 0) return weightDiff;
      return (right.issues[0]?.score ?? 0) - (left.issues[0]?.score ?? 0);
    });
}

function topicWeight(topic: string) {
  const weights: Record<string, number> = {
    "Youth protest": 1,
    Election: 2,
    Parliament: 3,
    Courts: 4,
    "Party politics": 5,
    Censorship: 6,
    Geopolitics: 7,
    Politics: 8,
  };
  return weights[topic] ?? 20;
}

function sourceLinksForEmail(issue: DigestIssue) {
  return issue.sourceLinks.length
    ? issue.sourceLinks.slice(0, 6)
    : [
        {
          id: issue.lead.id,
          storyId: issue.lead.id,
          title: issue.lead.title,
          url: issue.lead.url,
          sourceName: issue.lead.sourceName,
          publishedAt: issue.lead.publishedAt,
        },
      ];
}

function topicColor(topic: string) {
  const colors: Record<string, string> = {
    "Youth protest": "#3b9cff",
    Election: "#d6cec2",
    Parliament: "#a78bfa",
    Courts: "#22c55e",
    "Party politics": "#ef4444",
    Censorship: "#f97316",
    Geopolitics: "#38bdf8",
    Politics: "#64748b",
  };
  return colors[topic] ?? "#64748b";
}

function issueKeyForEmail(story: StoredStory) {
  return canonicalIssueKey(story);
}

function issueLabelForEmail(story: StoredStory) {
  return canonicalIssueLabel(story);
}

function topicForStory(story: StoredStory) {
  const text = `${story.title} ${story.summary} ${story.tags.join(" ")}`.toLowerCase();
  if (/cjp|student|protest|sansad/.test(text)) return "Youth protest";
  if (/bypoll|by-election|election|vote|campaign|candidate/.test(text)) return "Election";
  if (/parliament|lok sabha|rajya sabha|bill|ordinance/.test(text)) return "Parliament";
  if (/court|judgment|petition|constitution|rights/.test(text)) return "Courts";
  if (/ban|censorship|film|cbfc|takedown/.test(text)) return "Censorship";
  if (/foreign|border|china|pakistan|summit|brics/.test(text)) return "Geopolitics";
  if (/bjp|congress|aap|tmc|dmk|rjd|jdu|alliance|opposition/.test(text)) return "Party politics";
  return "Politics";
}

function snippetForStory(story: StoredStory) {
  const value = cleanEmailText(story.brief?.whatHappened || story.articleExcerpt || story.summary || story.title);
  return truncateEmail(value, 180);
}

function issueBioForEmail(story: StoredStory, sources: string[]) {
  const snippet = snippetForStory(story);
  const sourceCount = Math.max(1, sources.length || story.sourceLinks?.length || 1);
  const sourceText = sourceCount > 1 ? `${sourceCount} source trail` : "single-source lead";
  const angle = truncateEmail(story.brief?.whyItMatters || videoAngleForEmail(story), 150);
  return `${snippet} This is a ${sourceText} with ${story.totalScore}/100 Indian audience score. Research angle: ${angle}`;
}

function truncateEmail(value: string, limit: number) {
  const cleaned = cleanEmailText(value);
  if (cleaned.length <= limit) return cleaned;
  return `${cleaned.slice(0, Math.max(0, limit - 3)).trim()}...`;
}

function videoAngleForEmail(story: StoredStory) {
  if (story.brief?.videoAngles?.[0]) return story.brief.videoAngles[0];
  if (story.viralPotential >= 72) {
    return "High reach candidate: explain what is confirmed, why people are angry, who benefits politically, and what evidence is missing.";
  }
  if (story.politicalWeight >= 80) {
    return "Governance explainer: separate official claim, opposition claim, legal basis, and public impact.";
  }
  return "Watchlist item: wait for more source diversity or primary documents before spending creator time.";
}

function verificationForEmail(issue: DigestIssue) {
  if (issue.lead.brief?.sourceConfidence) return issue.lead.brief.sourceConfidence;
  if (issue.sources.length >= 4) return "Useful multi-source signal. Still verify primary documents before final script.";
  if (issue.sources.length >= 2) return "Early two-source trail. Generate a deep brief before publishing.";
  return "Thin source trail. Treat this as a lead, not as a confirmed creator script.";
}

function tokenizeIssue(value: string) {
  const stopWords = new Set(["about", "after", "against", "amid", "from", "india", "indian", "into", "news", "over", "that", "the", "this", "with", "what", "when", "where", "will"]);
  return cleanEmailText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 3 && !stopWords.has(token));
}

function uniqueEmailLinks(links: StorySourceLink[]) {
  const seen = new Set<string>();
  const unique: StorySourceLink[] = [];
  for (const link of links) {
    const key = `${link.url}|${link.sourceName}`.toLowerCase();
    if (!link.url || seen.has(key)) continue;
    seen.add(key);
    unique.push({ ...link, title: cleanEmailText(link.title), sourceName: cleanEmailText(link.sourceName) });
  }
  return unique;
}

function uniqueEmailStrings(values: string[]) {
  return Array.from(new Set(values.map(cleanEmailText).filter(Boolean)));
}

function buildText(story: StoredStory, brief: PolitilyBrief, storyLink: string) {
  return `${brief.briefTitle}

${brief.hook}

Score: ${story.totalScore}/100
Research depth: ${typeof brief.researchDepthScore === "number" ? `${brief.researchDepthScore}/100` : "Regenerate for depth score"}

What happened:
${brief.whatHappened}

Why it matters:
${brief.whyItMatters}

Historical context:
${brief.historicalContext}

Institutional accountability:
${brief.institutionalContext || "Regenerate this brief to get institutional accountability context."}

Data points:
${(brief.dataPoints ?? []).join("\n")}

Hard research questions:
${(brief.researchQuestions ?? []).join("\n")}

No video until:
${(brief.noVideoUntil ?? []).join("\n")}

Source positions:
${(brief.sourcePositions ?? []).join("\n")}

Roman Hindi script:
${brief.videoScript}

Sources:
${brief.citedUrls.join("\n")}

Open: ${storyLink}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function appBaseUrl(env: RuntimeEnv) {
  return (env.APP_BASE_URL || DEFAULT_APP_BASE_URL).replace(/\/$/, "");
}

function issueLink(env: RuntimeEnv, storyId: string) {
  return `${appBaseUrl(env)}/?story=${encodeURIComponent(storyId)}&view=issue`;
}

function briefPageLink(env: RuntimeEnv, storyId: string) {
  return `${appBaseUrl(env)}/?story=${encodeURIComponent(storyId)}&view=brief`;
}

function cleanEmailText(value: string) {
  return decodeEmailEntities(decodeEmailEntities(value || ""))
    .replace(/&nbsp;|&amp;nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEmailEntities(value: string) {
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

async function shortResponseBody(response: Response) {
  try {
    const text = await response.text();
    const cleaned = text.replace(/\s+/g, " ").trim().slice(0, 220);
    return cleaned ? ` - ${cleaned}` : "";
  } catch {
    return "";
  }
}
