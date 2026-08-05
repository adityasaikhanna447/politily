import type { StorySourceLink } from "./types";

interface WireOriginInput {
  title: string;
  summary?: string;
  url?: string;
  sourceName?: string;
  verificationMethod?: string;
  sourceLinks?: StorySourceLink[];
}

interface AgencyPattern {
  agency: string;
  pattern: RegExp;
}

const agencyPatterns: AgencyPattern[] = [
  {
    agency: "ANI",
    pattern: /\bani\b|aninews\.in|asian news international|\/author\/ani\b|by\s+ani\b/i,
  },
  {
    agency: "PTI",
    pattern: /\bpti\b|press trust of india|\/author\/pti\b|by\s+pti\b/i,
  },
  {
    agency: "UNI",
    pattern: /\buni\b|united news of india|\/author\/uni\b|by\s+uni\b/i,
  },
  {
    agency: "Reuters",
    pattern: /\breuters\b|reuters\.com|by\s+reuters\b/i,
  },
  {
    agency: "AP",
    pattern: /associated press|apnews\.com|ap news/i,
  },
];

export interface WireOriginReport {
  agency: string | null;
  label: string;
  verificationWarning: string;
  independentSourceCount: number;
}

export function buildWireOriginReport(input: WireOriginInput): WireOriginReport {
  const links = input.sourceLinks ?? [];
  const combinedText = [
    input.title,
    input.summary ?? "",
    input.url ?? "",
    input.sourceName ?? "",
    input.verificationMethod ?? "",
    ...links.flatMap((link) => [link.title, link.url, link.sourceName, link.verificationMethod ?? ""]),
  ].join(" ");
  const agency = agencyPatterns.find((candidate) => candidate.pattern.test(combinedText))?.agency ?? null;
  const sourceNames = uniqueCleanStrings([
    input.sourceName ?? "",
    ...links.map((link) => link.sourceName),
  ]);
  const independentSourceCount = countIndependentSourceNames(sourceNames, agency);

  if (!agency) {
    return {
      agency: null,
      label:
        independentSourceCount > 1
          ? `${independentSourceCount} visible source names; no agency wire origin detected.`
          : "No agency wire origin detected yet.",
      verificationWarning:
        "No agency wire origin detected yet; still compare primary record, credible portal, and counter-position before scripting.",
      independentSourceCount: Math.max(1, independentSourceCount),
    };
  }

  const label = `${agency} wire origin likely. Treat direct wire and portal repeats as one origin until independently confirmed.`;
  return {
    agency,
    label: `${label} Independent visible sources: ${independentSourceCount}.`,
    verificationWarning: `${agency} wire origin likely: do not count every repost as independent proof; verify with primary records and at least one non-wire report.`,
    independentSourceCount,
  };
}

export function linkWireOriginLabel(link: StorySourceLink) {
  const report = buildWireOriginReport({
    title: link.title,
    url: link.url,
    sourceName: link.sourceName,
    verificationMethod: link.verificationMethod,
    sourceLinks: [link],
  });

  return report.agency ? `wire ${report.agency}` : "";
}

function countIndependentSourceNames(sourceNames: string[], agency: string | null) {
  const independent = sourceNames.filter((name) => {
    if (!name) return false;
    const text = name.toLowerCase();
    if (/google news|wire mentions|wire watch|agency sweep|agencies/.test(text)) return false;
    if (agency) {
      const agencyPattern = agencyPatterns.find((candidate) => candidate.agency === agency)?.pattern;
      if (agencyPattern?.test(name)) return false;
    }
    return true;
  });

  return new Set(independent.map((name) => name.toLowerCase())).size;
}

function uniqueCleanStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
