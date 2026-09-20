import { env } from "cloudflare:workers";
import { generateAndSaveBrief, generateResearchBriefForQuery, loadDashboardState } from "../../lib/monitor";
import type { RuntimeEnv } from "../../lib/types";
import { errorResponse, freeMode, withDatabaseProtection } from "../../lib/database-protection";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { storyId?: string; query?: string };
    if (!body.storyId && !body.query?.trim()) {
      return Response.json({ error: "storyId or query is required" }, { status: 400 });
    }

    const runtimeEnv = env as unknown as RuntimeEnv;
    const story = await withDatabaseProtection(runtimeEnv, "research", safe => body.storyId
      ? generateAndSaveBrief(safe, body.storyId)
      : generateResearchBriefForQuery(safe, body.query || ""));
    if (!story) {
      return Response.json({ error: "Story not found or storage unavailable." }, { status: 404 });
    }

    const state = freeMode(runtimeEnv) ? undefined : await withDatabaseProtection(runtimeEnv, "dashboard-after-research", loadDashboardState);
    return Response.json({ story, state });
  } catch (error) {
    return errorResponse(error);
  }
}
