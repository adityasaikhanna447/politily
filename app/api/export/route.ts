import { env } from "cloudflare:workers";
import { docxFileName, makeBriefDocx } from "../../lib/docx";
import { getStoryById } from "../../lib/storage";
import type { RuntimeEnv } from "../../lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const storyId = new URL(request.url).searchParams.get("storyId");
  if (!storyId) {
    return Response.json({ error: "storyId is required" }, { status: 400 });
  }

  const runtimeEnv = env as unknown as RuntimeEnv;
  if (!runtimeEnv.DB) {
    return Response.json({ error: "Storage is not connected." }, { status: 503 });
  }

  const story = await getStoryById(runtimeEnv.DB, storyId);
  if (!story) {
    return Response.json({ error: "Story not found." }, { status: 404 });
  }

  const file = makeBriefDocx(story);
  return new Response(file, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${docxFileName(story)}"`,
      "Cache-Control": "no-store",
    },
  });
}
