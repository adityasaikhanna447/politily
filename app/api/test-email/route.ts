import { env } from "cloudflare:workers";
import { sendTestEmail } from "../../lib/email";
import type { RuntimeEnv } from "../../lib/types";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const runtimeEnv = env as unknown as RuntimeEnv;
    const result = await sendTestEmail(runtimeEnv);
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
    const message = error instanceof Error ? error.message : "Test email failed.";
    return Response.json({ sent: false, message }, { status: 500 });
  }
}
