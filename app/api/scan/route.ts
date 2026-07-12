import { env } from "cloudflare:workers";
import { loadDashboardState, runPolitilyScan } from "../../lib/monitor";
import type { RuntimeEnv } from "../../lib/types";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const runtimeEnv = env as unknown as RuntimeEnv;
    const result = await runPolitilyScan(runtimeEnv);
    const state = await loadDashboardState(runtimeEnv);
    return Response.json({ result, state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
