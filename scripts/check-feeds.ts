// Read-only connectivity check. Never writes news or calls email/AI providers.
import { DEFAULT_SOURCES } from "../app/lib/source-library";
import { parseFeed } from "../app/lib/monitor";

const sources = DEFAULT_SOURCES.filter(source => source.id.endsWith("v35"));
const results = await Promise.allSettled(sources.map(async source => {
  const response = await fetch(source.url, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "Politily/3.5 RSS connectivity check" } });
  if (!response.ok) throw new Error(`${source.name}: HTTP ${response.status}`);
  const reports = parseFeed(await response.text(), source);
  if (!reports.length) throw new Error(`${source.name}: no usable RSS reports`);
  return { source: source.name, reports: reports.length, checkedAt: new Date().toISOString() };
}));
for (const result of results) console.log(JSON.stringify(result.status === "fulfilled" ? result.value : { error: String(result.reason) }));
if (results.some(result => result.status === "rejected")) process.exitCode = 1;
