import { env } from "cloudflare:workers";
import { sendStrategicDigestEmail } from "../../lib/email";
import { listStoriesInDateRange } from "../../lib/storage";
import type { RuntimeEnv } from "../../lib/types";
import { errorResponse, withDatabaseProtection } from "../../lib/database-protection";

export const dynamic = "force-dynamic";

interface DigestRequest {
  mode?: "today" | "range";
  startDate?: string;
  endDate?: string;
}

export async function POST(request: Request) {
  try {
    const runtimeEnv = env as unknown as RuntimeEnv;
    if (!runtimeEnv.DB) {
      return Response.json({ sent: false, message: "Storage is not connected." }, { status: 503 });
    }

    const body = (await request.json().catch(() => ({}))) as DigestRequest;
    const window = digestWindow(body);
    const result = await withDatabaseProtection(runtimeEnv, "manual-newsletter", async safe => {
      const stories = await listStoriesInDateRange(safe.DB!, window.startIso, window.endIso, 180);
      return sendStrategicDigestEmail(safe, stories, {
        startIso: window.startIso, endIso: window.endIso, label: window.label,
      });
    });

    return Response.json(
      {
        ...result,
        startIso: window.startIso,
        endIso: window.endIso,
        label: window.label,
      },
      { status: result.sent ? 200 : 400 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}

function digestWindow(body: DigestRequest) {
  const today = currentIstDateString();
  const startDate = body.mode === "today" ? today : safeDateInput(body.startDate) || today;
  const endDate = body.mode === "today" ? today : safeDateInput(body.endDate) || startDate;
  const orderedStart = startDate <= endDate ? startDate : endDate;
  const orderedEnd = startDate <= endDate ? endDate : startDate;
  const now = Date.now();
  const startIso = new Date(`${orderedStart}T00:00:00.000+05:30`).toISOString();
  const endOfDay = new Date(`${orderedEnd}T23:59:59.999+05:30`).getTime();
  const endIso = new Date(Math.min(endOfDay, now)).toISOString();

  return {
    startIso,
    endIso,
    label:
      orderedStart === orderedEnd
        ? `${formatHumanDate(orderedStart)} till ${formatIstTime(endIso)}`
        : `${formatHumanDate(orderedStart)} to ${formatHumanDate(orderedEnd)}`,
  };
}

function safeDateInput(value?: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "";
  }

  const parsed = Date.parse(`${value}T00:00:00.000+05:30`);
  return Number.isFinite(parsed) ? value : "";
}

function currentIstDateString() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Kolkata",
    year: "numeric",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function formatHumanDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${value}T00:00:00.000+05:30`));
}

function formatIstTime(value: string) {
  return `${new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(new Date(value))} IST`;
}
