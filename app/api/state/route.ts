import { env } from "cloudflare:workers";
import { loadDashboardState } from "../../lib/monitor";
import type { RuntimeEnv } from "../../lib/types";
import { createStateReader } from "../../lib/state-cache";
import { errorResponse, RELEASE, withDatabaseProtection } from "../../lib/database-protection";

export const dynamic = "force-dynamic";
const read = createStateReader();

export async function GET(request: Request) {
  try {
    const key = `${new URL(request.url).origin}/__internal/state-${RELEASE}`;
    const cache = typeof caches !== "undefined" ? (caches as CacheStorage & { default?: Cache }).default : undefined;
    const state = await read(key, () => withDatabaseProtection(env as unknown as RuntimeEnv, "dashboard", loadDashboardState), cache);
    return Response.json(state, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
