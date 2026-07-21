import type { StoredStory } from "./types";

interface ZipEntry {
  name: string;
  content: Uint8Array;
}

const encoder = new TextEncoder();

export function makeBriefDocx(story: StoredStory) {
  const documentXml = buildDocumentXml(story);
  return zipStore([
    {
      name: "[Content_Types].xml",
      content: textBytes(`<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`),
    },
    {
      name: "_rels/.rels",
      content: textBytes(`<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`),
    },
    {
      name: "word/document.xml",
      content: textBytes(documentXml),
    },
  ]);
}

export function docxFileName(story: StoredStory) {
  const safeTitle = story.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);

  return `politily-${safeTitle || story.id}.docx`;
}

function buildDocumentXml(story: StoredStory) {
  const brief = story.brief;
  const sections: Array<[string, string[]]> = [
    ["Generation status", [generationStatus(brief)]],
    ["What happened", [brief?.whatHappened || story.summary || "No brief generated yet."]],
    ["Why this matters", [brief?.whyItMatters || "Generate a brief for political significance."]],
    ["Indian audience reach", [`${brief?.audienceReachScore ?? story.totalScore}/100`, brief?.audienceReachReason || "Reach is estimated from story score and political relevance."]],
    ["Research depth score", [typeof brief?.researchDepthScore === "number" ? `${brief.researchDepthScore}/100` : "Regenerate this brief to get the new deep-research score."]],
    ["Evidence grade", [brief?.evidenceGrade || "thin"]],
    ["Historical context", [brief?.historicalContext || "Generate a brief for historical context."]],
    ["Regional context", [brief?.regionalContext || brief?.geographicalContext || "Generate a brief for regional context."]],
    ["Institutional and accountability context", [brief?.institutionalContext || "Generate a brief for institutional accountability context."]],
    ["Power analysis", [brief?.powerAnalysis || "Generate a brief for power and incentive analysis."]],
    ["Source confidence", [brief?.sourceConfidence || "Source confidence not assessed yet."]],
    ["Timeline", brief?.timeline?.length ? brief.timeline : ["No timeline generated yet."]],
    ["Facts and figures", brief?.factsAndFigures?.length ? brief.factsAndFigures : ["No facts and figures generated yet."]],
    ["Data points and datasets", brief?.dataPoints?.length ? brief.dataPoints : ["No deeper data points generated yet."]],
    ["Deep research questions", brief?.researchQuestions?.length ? brief.researchQuestions : ["No hard research questions generated yet."]],
    ["Accountability map", brief?.accountabilityMap?.length ? brief.accountabilityMap : ["No accountability map generated yet."]],
    ["Stakeholder map", brief?.stakeholderMap?.length ? brief.stakeholderMap : ["No stakeholder map generated yet."]],
    ["Counter-arguments", brief?.counterArguments?.length ? brief.counterArguments : ["No counter-arguments generated yet."]],
    ["Open questions", brief?.openQuestions?.length ? brief.openQuestions : ["No open questions generated yet."]],
    ["Monitoring queries", brief?.monitoringQueries?.length ? brief.monitoringQueries : ["No monitoring queries generated yet."]],
    ["No video until", brief?.noVideoUntil?.length ? brief.noVideoUntil : ["No no-video conditions generated yet."]],
    ["Storytelling beats", brief?.storytellingBeats?.length ? brief.storytellingBeats : ["No storytelling beats generated yet."]],
    ["Video angles", brief?.videoAngles?.length ? brief.videoAngles : ["Generate a brief for video angles."]],
    ["Source positions", brief?.sourcePositions?.length ? brief.sourcePositions : ["No source positions generated yet."]],
    ["Claim matrix", brief?.claimMatrix?.length ? brief.claimMatrix : ["No claim matrix generated yet."]],
    ["Primary documents to verify", brief?.primaryDocuments?.length ? brief.primaryDocuments : ["No primary document checklist generated yet."]],
    ["Missing evidence", brief?.missingEvidence?.length ? brief.missingEvidence : ["No missing evidence list generated yet."]],
    ["Verification protocol", brief?.verificationProtocol?.length ? brief.verificationProtocol : ["No verification protocol generated yet."]],
    ["Narrative map", brief?.narratives?.length ? brief.narratives : ["No narrative map generated yet."]],
    ["What happens next", brief?.whatHappensNext?.length ? brief.whatHappensNext : ["No watch items generated yet."]],
    ["Score rationale", scoreRationaleItems(brief, story)],
    ["Roman Hindi creator script", [brief?.videoScript || story.scriptText || "Generate a brief for the Roman Hindi script."]],
    ["Caution", [brief?.caution || "Do not publish allegations as facts."]],
    ["Cited URLs", brief?.citedUrls?.length ? brief.citedUrls : [story.url]],
  ];

  const body = [
    paragraph("Politily Research Brief", "Title"),
    paragraph(story.title, "Heading1"),
    paragraph(`Detected: ${formatDate(story.detectedAt)} | Source: ${story.sourceName} | Score: ${story.totalScore}/100`),
    paragraph(`Novelty ${story.noveltyScore}/100 | Political ${story.politicalWeight}/100 | Geo ${story.geopoliticalRelevance}/100 | Viral ${story.viralPotential}/100`),
    ...(brief?.hook ? [paragraph(brief.hook, "Subtitle")] : []),
    ...sections.flatMap(([heading, items]) => [
      paragraph(heading, "Heading2"),
      ...items.flatMap((item) => textParagraphs(item)),
    ]),
  ].join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${body}
    <w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="900" w:right="900" w:bottom="900" w:left="900"/></w:sectPr>
  </w:body>
</w:document>`;
}

function generationStatus(brief: StoredStory["brief"]) {
  if (!brief) {
    return "No generated brief yet.";
  }

  const tokens = brief.tokenUsage?.totalTokens;
  const tokenText = typeof tokens === "number" ? `${tokens} Gemini tokens reported` : "Gemini token usage not reported";
  if (brief.generatedBy === "template") {
    return `Template fallback draft. Gemini did not complete the deep brief; retry before using this for a hot video. ${tokenText}.`;
  }

  return `Gemini generated brief using ${brief.tokenUsage?.model || "configured model"}. ${tokenText}.`;
}

function scoreRationaleItems(brief: StoredStory["brief"], story: StoredStory) {
  return [
    brief?.scoreRationale?.noveltyScore || `Novelty: ${story.noveltyScore}/100`,
    brief?.scoreRationale?.politicalWeight || `Political weight: ${story.politicalWeight}/100`,
    brief?.scoreRationale?.geopoliticalRelevance || `Geopolitical relevance: ${story.geopoliticalRelevance}/100`,
    brief?.scoreRationale?.viralPotential || `Viral potential: ${story.viralPotential}/100`,
    brief?.scoreRationale?.audienceReach || `Indian audience reach: ${brief?.audienceReachScore ?? story.totalScore}/100`,
  ];
}

function textParagraphs(value: string) {
  return value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => paragraph(line))
    .join("");
}

function paragraph(text: string, style?: "Title" | "Heading1" | "Heading2" | "Subtitle") {
  const styleXml = style ? `<w:pStyle w:val="${style}"/>` : "";
  const bold = style ? "<w:b/>" : "";
  const size = style === "Title" ? "36" : style === "Heading1" ? "28" : style === "Heading2" ? "22" : "20";
  return `<w:p><w:pPr>${styleXml}</w:pPr><w:r><w:rPr>${bold}<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function textBytes(value: string) {
  return encoder.encode(value);
}

function zipStore(entries: ZipEntry[]) {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = textBytes(entry.name);
    const crc = crc32(entry.content);
    const local = new Uint8Array(30 + name.length);
    const localView = new DataView(local.buffer);
    writeHeader(localView, 0x04034b50);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, entry.content.length, true);
    localView.setUint32(22, entry.content.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    chunks.push(local, entry.content);

    const centralEntry = new Uint8Array(46 + name.length);
    const centralView = new DataView(centralEntry.buffer);
    writeHeader(centralView, 0x02014b50);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, entry.content.length, true);
    centralView.setUint32(24, entry.content.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    centralEntry.set(name, 46);
    central.push(centralEntry);

    offset += local.length + entry.content.length;
  }

  const centralOffset = offset;
  const centralSize = central.reduce((size, entry) => size + entry.length, 0);
  chunks.push(...central);

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  writeHeader(endView, 0x06054b50);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, centralOffset, true);
  chunks.push(end);

  return concatBytes(chunks);
}

function writeHeader(view: DataView, value: number) {
  view.setUint32(0, value, true);
}

function concatBytes(chunks: Uint8Array[]) {
  const total = chunks.reduce((size, chunk) => size + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }

  return output;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }

  return crc >>> 0;
});
