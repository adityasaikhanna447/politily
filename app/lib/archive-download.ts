type Row = Record<string, unknown>;
export function archiveCsv(stories: Row[]) {
  const fields = ["id", "title", "summary", "source_name", "url", "published_at", "detected_at", "total_score", "status", "brief_json", "script_text"];
  const cell = (value: unknown) => {
    let text = String(value ?? "");
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return "\ufeff" + [fields.join(","), ...stories.map(story => fields.map(field => cell(story[field])).join(","))].join("\r\n");
}
export async function downloadArchive(start: string, end: string, format: "json" | "csv", progress: (message: string) => void) {
  const collections: Record<string, Row[]> = { stories: [], story_sources: [], sources: [] };
  async function page(params: Record<string, string>) {
    const response = await fetch(`/api/archive?${new URLSearchParams({ start, end, ...params })}`, { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Archive failed. No complete file has been downloaded.");
    return body as { rows: Row[]; next: string | null };
  }
  for (const table of ["stories", "story_sources"]) {
    const seen = new Map<string, Row>();
    for (const timestampFormat of ["iso", "legacy"]) {
      let cursor = "";
      do {
        const result = await page({ table, format: timestampFormat, cursor });
        for (const row of result.rows) seen.set(String(row.id), row);
        cursor = result.next || "";
        progress(`Exporting ${table === "stories" ? "issues" : "source reports"}: ${seen.size}`);
      } while (cursor);
    }
    collections[table] = [...seen.values()];
  }
  const stories = new Map(collections.stories.map(row => [String(row.id), row]));
  const missing = [...new Set(collections.story_sources.map(row => String(row.story_id)))].filter(id => !stories.has(id));
  for (let index = 0; index < missing.length; index += 40) {
    const result = await page({ table: "parents", ids: missing.slice(index, index + 40).join(",") });
    for (const row of result.rows) stories.set(String(row.id), row);
  }
  collections.stories = [...stories.values()];
  collections.sources = (await page({ table: "sources" })).rows;
  const payload = format === "csv" ? archiveCsv(collections.stories) : JSON.stringify({
    version: 1, exportedAt: new Date().toISOString(), rangeIST: { start, end },
    scope: "Issues first captured and source reports captured in the selected dates; current parent issues and saved briefs included. A live application export, not a transaction-consistent database backup.",
    ...collections,
  }, null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: format === "csv" ? "text/csv;charset=utf-8" : "application/json" }));
  const link = document.createElement("a");
  link.href = url; link.download = `politily-${start}-to-${end}.${format}`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return `${collections.stories.length} issues exported. ${format === "json" ? `${collections.story_sources.length} source reports included. ` : "JSON also includes the source-report tables. "}Stored data has not been deleted.`;
}
