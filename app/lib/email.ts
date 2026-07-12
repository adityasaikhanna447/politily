import type { PolitilyBrief, RuntimeEnv, StoredStory } from "./types";

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
      message: `Resend returned HTTP ${response.status}.`,
    };
  }

  return { sent: true, message: "Alert email sent." };
}

function buildHtml(story: StoredStory, brief: PolitilyBrief, storyLink: string) {
  const facts = brief.factsAndFigures.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
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
        <p><strong>Score:</strong> ${story.totalScore}/100</p>
        <p>${escapeHtml(brief.whatHappened)}</p>
        <h2>Why it matters</h2>
        <p>${escapeHtml(brief.whyItMatters)}</p>
        <h2>Context</h2>
        <p>${escapeHtml(brief.historicalContext)}</p>
        <p>${escapeHtml(brief.geographicalContext)}</p>
        <h2>Facts and figures</h2>
        <ul>${facts}</ul>
        <h2>What happens next</h2>
        <ul>${next}</ul>
        <h2>Creator script</h2>
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

function buildText(story: StoredStory, brief: PolitilyBrief, storyLink: string) {
  return `${brief.briefTitle}

${brief.hook}

Score: ${story.totalScore}/100

What happened:
${brief.whatHappened}

Why it matters:
${brief.whyItMatters}

Historical context:
${brief.historicalContext}

Script:
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
