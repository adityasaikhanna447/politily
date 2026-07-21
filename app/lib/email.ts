import type { PolitilyBrief, RuntimeEnv, StoredStory, StorySourceLink } from "./types";

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

  const storyLink = env.APP_BASE_URL
    ? `${env.APP_BASE_URL.replace(/\/$/, "")}/?story=${encodeURIComponent(story.id)}`
    : story.url;

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

export async function sendTestEmail(env: RuntimeEnv) {
  if (!env.RESEND_API_KEY || !env.ALERT_EMAIL || !env.ALERT_FROM_EMAIL) {
    return {
      sent: false,
      message:
        "Email test skipped. Set RESEND_API_KEY, ALERT_EMAIL, and ALERT_FROM_EMAIL first.",
    };
  }

  const appLink = env.APP_BASE_URL || "https://politily.adityakhanna-tcc.workers.dev/";
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
  const appLink = env.APP_BASE_URL || "https://politily.adityakhanna-tcc.workers.dev/";
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
    ? issues.map((issue, index) => buildDigestIssueHtml(issue, index + 1, appLink)).join("")
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
        <p style="color:#c7ccca;line-height:1.6;margin:0 0 20px;">Strategic issue queue from stored open-source signals. This digest does not use Gemini tokens; generate a deep brief only for the stories you want to script.</p>
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

function buildDigestIssueHtml(issue: DigestIssue, rank: number, appLink: string) {
  const lead = issue.lead;
  const storyLink = `${appLink.replace(/\/$/, "")}/?story=${encodeURIComponent(lead.id)}`;
  const sources = issue.sourceLinks.slice(0, 7)
    .map((link) => `<li><a href="${escapeHtml(link.url)}" style="color:#8dbdff;">${escapeHtml(cleanEmailText(link.sourceName))}</a> - ${escapeHtml(cleanEmailText(link.title))}</li>`)
    .join("");
  const sourceNames = issue.sources.slice(0, 8).map((source) => escapeHtml(source)).join(", ");

  return `<section style="border:1px solid #263135;border-radius:12px;padding:18px;background:#0f1517;margin:0 0 14px;">
    <p style="margin:0 0 8px;color:#d5c9b6;font-weight:700;">#${rank} | Score ${issue.score}/100 | ${escapeHtml(topicForStory(lead))} | ${issue.sources.length} sources | ${issue.stories.length} reports</p>
    <h2 style="font-size:22px;line-height:1.25;margin:0 0 10px;color:#fffaf0;">${escapeHtml(issue.label)}</h2>
    <p style="color:#d9dddc;line-height:1.55;margin:0 0 12px;">${escapeHtml(snippetForStory(lead))}</p>
    <div style="border-left:3px solid #3b9cff;padding-left:12px;margin:0 0 12px;color:#f2eee6;">
      <strong>Creator angle:</strong> ${escapeHtml(videoAngleForEmail(lead))}
    </div>
    <p style="color:#b7bdbe;line-height:1.55;margin:0 0 8px;"><strong>Verification:</strong> ${escapeHtml(verificationForEmail(issue))}</p>
    <p style="color:#b7bdbe;line-height:1.55;margin:0 0 8px;"><strong>Source mix:</strong> ${sourceNames || escapeHtml(lead.sourceName)}</p>
    ${sources ? `<ul style="color:#b7bdbe;line-height:1.55;margin:8px 0 14px;padding-left:18px;">${sources}</ul>` : ""}
    <p style="margin:0;"><a href="${escapeHtml(storyLink)}" style="color:#8dbdff;">Open issue in Politily</a></p>
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

  issues.forEach((issue, index) => {
    const lead = issue.lead;
    lines.push(
      `#${index + 1} ${issue.label}`,
      `Score: ${issue.score}/100 | Topic: ${topicForStory(lead)} | Sources: ${issue.sources.length} | Reports: ${issue.stories.length}`,
      `What happened: ${snippetForStory(lead)}`,
      `Creator angle: ${videoAngleForEmail(lead)}`,
      `Verification: ${verificationForEmail(issue)}`,
      `Source mix: ${issue.sources.join(", ") || lead.sourceName}`,
      `Open: ${appLink.replace(/\/$/, "")}/?story=${encodeURIComponent(lead.id)}`,
      ""
    );
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
    const existing = issues.find((issue) => issue.id === key);
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

function issueKeyForEmail(story: StoredStory) {
  const text = `${story.title} ${story.summary} ${story.tags.join(" ")}`.toLowerCase();
  if (/cjp|cockroach janta party|chalo sansad|sansad chalo/.test(text)) {
    return "issue:cjp-sansad-chalo";
  }
  if (/bankipur|bypoll|by-election|byelection/.test(text)) {
    return "issue:bankipur-bypoll";
  }
  if (/jailed leaders|removing jailed leaders|office.*jailed/.test(text)) {
    return "issue:jailed-leaders-bill";
  }

  return `${topicForStory(story).toLowerCase()}:${tokenizeIssue(story.title).slice(0, 5).join("-") || story.id}`;
}

function issueLabelForEmail(story: StoredStory) {
  const text = `${story.title} ${story.summary}`.toLowerCase();
  if (/cjp|cockroach janta party|chalo sansad|sansad chalo/.test(text)) {
    return "CJP / Sansad Chalo protest";
  }
  if (/bankipur|bypoll|by-election|byelection/.test(text)) {
    return "Bankipur bypoll and Bihar party strategy";
  }
  if (/jailed leaders|removing jailed leaders/.test(text)) {
    return "Bill on jailed leaders holding office";
  }

  return cleanEmailText(story.title).replace(/\s+-\s+[^-]{2,40}$/g, "");
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
  return value.length > 260 ? `${value.slice(0, 257)}...` : value;
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
