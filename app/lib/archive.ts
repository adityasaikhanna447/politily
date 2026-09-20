import { ensureDatabase } from "./storage";

type Row = Record<string, unknown>;
export function archiveWindow(start: string, end: string) {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!valid(start) || !valid(end) || start > end) throw new Error("Choose valid start and end dates.");
  const first = Date.parse(`${start}T00:00:00+05:30`);
  const last = Date.parse(`${end}T23:59:59.999+05:30`);
  if (last - first > 31 * 86400000) throw new Error("Export up to 31 days at a time. Repeat for older months.");
  return { start: new Date(first).toISOString(), end: new Date(Math.min(last, Date.now())).toISOString() };
}

export async function readArchivePage(db: D1Database, params: URLSearchParams) {
  await ensureDatabase(db);
  const window = archiveWindow(params.get("start") || "", params.get("end") || "");
  const table = params.get("table") || "stories";
  if (table === "sources") {
    const rows = await db.prepare("SELECT * FROM sources ORDER BY id LIMIT 200").all<Row>();
    return { rows: rows.results, next: null };
  }
  if (table === "parents") {
    const ids = [...new Set((params.get("ids") || "").split(",").filter(Boolean))];
    if (!ids.length || ids.length > 40) throw new Error("Request 1 to 40 parent issues at a time.");
    const rows = await db.prepare(`SELECT * FROM stories WHERE id IN (${ids.map(() => "?").join(",")})`).bind(...ids).all<Row>();
    return { rows: rows.results, next: null };
  }
  const columns: Record<string, string> = { stories: "detected_at", story_sources: "created_at" };
  const column = columns[table];
  if (!column) throw new Error("Unknown archive collection.");
  const legacy = params.get("format") === "legacy";
  const date = (value: string) => legacy ? value.replace("T", " ").slice(0, 19) : value;
  const cursor = params.get("cursor") ? JSON.parse(params.get("cursor")!) : null;
  if (cursor && (!Array.isArray(cursor) || cursor.length !== 2 || cursor.some(v => typeof v !== "string"))) throw new Error("Invalid archive cursor.");
  const result = await db.prepare(`SELECT * FROM ${table} WHERE ${column} >= ? AND ${column} <= ?
    ${cursor ? `AND (${column}, id) > (?, ?)` : ""} ORDER BY ${column}, id LIMIT 101`)
    .bind(date(window.start), date(window.end), ...(cursor || [])).all<Row>();
  const rows = result.results.slice(0, 100);
  const last = rows.at(-1);
  return { rows, next: result.results.length > 100 && last ? JSON.stringify([last[column], last.id]) : null };
}
