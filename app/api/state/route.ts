import { env } from "cloudflare:workers";
import { loadDashboardState } from "../../lib/monitor";
import type { RuntimeEnv } from "../../lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await loadDashboardState(env as unknown as RuntimeEnv);
    return Response.json(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load Politily state.";
    return Response.json({ error: message }, { status: 500 });
  }
}
