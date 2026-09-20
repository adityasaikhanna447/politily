import { env } from "cloudflare:workers";
import { loadDashboardState, runPolitilyScan } from "../../lib/monitor";
import type { RuntimeEnv } from "../../lib/types";
import { errorResponse, freeMode, withDatabaseProtection } from "../../lib/database-protection";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const runtimeEnv = env as unknown as RuntimeEnv;
    const result = await withDatabaseProtection(runtimeEnv, "manual-scan", runPolitilyScan);
    const state = freeMode(runtimeEnv) ? undefined : await withDatabaseProtection(runtimeEnv, "dashboard-after-scan", loadDashboardState);
    return Response.json({ result, state });
  } catch (error) {
    return errorResponse(error);
  }
}
