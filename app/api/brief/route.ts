import { env } from "cloudflare:workers";
import { generateAndSaveBrief, generateResearchBriefForQuery, loadDashboardState } from "../../lib/monitor";
import type { RuntimeEnv } from "../../lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { storyId?: string; query?: string };
    if (!body.storyId && !body.query?.trim()) {
      return Response.json({ error: "storyId or query is required" }, { status: 400 });
    }

    const runtimeEnv = env as unknown as RuntimeEnv;
    const story = body.storyId
      ? await generateAndSaveBrief(runtimeEnv, body.storyId)
      : await generateResearchBriefForQuery(runtimeEnv, body.query || "");
    if (!story) {
      return Response.json({ error: "Story not found or storage unavailable." }, { status: 404 });
    }

    const state = await loadDashboardState(runtimeEnv);
    return Response.json({ story, state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Brief generation failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
