import { env } from "cloudflare:workers";
import { readArchivePage } from "../../lib/archive";
import { errorResponse, withDatabaseProtection } from "../../lib/database-protection";
import type { RuntimeEnv } from "../../lib/types";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const result = await withDatabaseProtection(env as unknown as RuntimeEnv, "archive-page", async safe => {
      if (!safe.DB) throw new Error("The archive needs the existing D1 database.");
      return readArchivePage(safe.DB, new URL(request.url).searchParams);
    });
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
