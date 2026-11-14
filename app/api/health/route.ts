import { env } from "cloudflare:workers";
import { getEmailSettings } from "../../lib/delivery";
import { nextD1Reset, quotaState, RELEASE } from "../../lib/database-protection";
import type { RuntimeEnv } from "../../lib/types";
import { EMAIL_SCHEDULE_IST } from "../../lib/presentation";

export const dynamic = "force-dynamic";

export async function GET() {
  const runtime = env as unknown as RuntimeEnv;
  const email = getEmailSettings(runtime);
  return Response.json({ release: RELEASE, checkedAt: new Date().toISOString(),
    workerReachable: true, databaseBound: Boolean(runtime.DB), databaseQueryAttempted: false,
    databaseStatus: quotaState(runtime.DB) ? "quota_error_observed_in_this_isolate" : "not_probed",
    nextFreeQuotaReset: nextD1Reset(), scansPaused: runtime.POLITILY_SCANS_PAUSED === "true",
    freeMode: runtime.POLITILY_FREE_MODE === "true", dataExport: "JSON and CSV, up to 31 days per download",
    email: { keyConfigured: Boolean(email.apiKey), senderConfigured: Boolean(email.from), recipientConfigured: Boolean(email.to), deliveryVerified: false },
    scheduleIST: EMAIL_SCHEDULE_IST, timezone: "Asia/Kolkata", emailProcessing: "Next five-minute mail tick, normally :01 IST; retries only 08:00–23:59 IST",
    message: "This check makes zero D1 queries. Binding/configuration presence does not prove database access or inbox delivery." },
  { headers: { "Cache-Control": "no-store" } });
}
