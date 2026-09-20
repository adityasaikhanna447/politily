import { env } from "cloudflare:workers";
import { sendTestEmail } from "../../lib/email";
import type { RuntimeEnv } from "../../lib/types";
import { errorResponse, withDatabaseProtection } from "../../lib/database-protection";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const runtimeEnv = env as unknown as RuntimeEnv;
    const result = await withDatabaseProtection(runtimeEnv, "test-email", sendTestEmail);
    return Response.json(
      {
        ...result,
        checks: {
          resendKey: Boolean(runtimeEnv.RESEND_API_KEY),
          alertEmail: Boolean(runtimeEnv.ALERT_EMAIL),
          alertFromEmail: Boolean(runtimeEnv.ALERT_FROM_EMAIL),
          appBaseUrl: Boolean(runtimeEnv.APP_BASE_URL),
        },
      },
      { status: result.sent ? 200 : 400 }
    );
  } catch (error) {
    return errorResponse(error);
  }
}
