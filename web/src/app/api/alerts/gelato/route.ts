/**
 * POST /api/alerts/gelato — operational alert from the keeper automation (SA-7).
 *
 *  - authentication was `body.source === 'gelato_keeper'`, a value the caller supplies. It now
 *    requires `x-cron-secret: <CRON_SECRET>`, compared in constant time, and an unset secret is a
 *    503 rather than a bypass (D-017);
 *  - `message` was interpolated raw into the email HTML. It is escaped (SA-7);
 *  - the route no longer answers `{ success: true, mocked: true }` when RESEND_API_KEY is unset.
 *    Nothing was sent, so it says so (S-5).
 */

import { NextResponse } from "next/server";
import { Resend } from "resend";
import { alertSender } from "@/lib/email-service";
import { optionalEnv } from "@/lib/demo";
import { escapeHtml } from "@/lib/html";
import { requireCronSecret } from "@/lib/secure";
import { logger } from "@/lib/telemetry";

export async function POST(req: Request) {
  const guard = requireCronSecret(req);
  if (!guard.ok) return guard.response;

  const body = (await req.json().catch(() => ({}))) as { message?: string };
  const message = String(body.message ?? "").slice(0, 2000);

  if (message.trim() === "") {
    return NextResponse.json({ error: "message is required" }, { status: 400 });
  }

  const resendApiKey = optionalEnv("RESEND_API_KEY");
  const alertEmail = optionalEnv("ALERT_EMAIL_ADDRESS");

  if (!resendApiKey || !alertEmail) {
    const reason = !resendApiKey
      ? "RESEND_API_KEY is not configured"
      : "ALERT_EMAIL_ADDRESS is not configured";
    logger.warn("Keeper alert could not be delivered", {
      action: "GELATO_ALERT_NOT_SENT",
      reason,
    });
    return NextResponse.json({ state: "UNAVAILABLE", reason, sent: false }, { status: 503 });
  }

  try {
    const resend = new Resend(resendApiKey);
    const data = await resend.emails.send({
      from: alertSender().from,
      to: alertEmail,
      subject: "Bank Rock: keeper automation alert",
      html: `
        <h2>Keeper automation alert</h2>
        <p>An automated rebalance operation reported a problem.</p>
        <p><strong>Details:</strong> ${escapeHtml(message)}</p>
        <p><small>Automated message from Bank Rock.</small></p>
      `,
    });

    if (!data.data?.id) {
      const reason = data.error?.message || "The mail provider rejected the message";
      return NextResponse.json({ state: "UNAVAILABLE", reason, sent: false }, { status: 503 });
    }

    logger.info("Keeper alert email accepted", { action: "GELATO_ALERT_SENT" });
    return NextResponse.json({ state: "REAL", sent: true, id: data.data.id });
  } catch (error) {
    logger.error("Keeper alert email failed", error, { action: "GELATO_ALERT_ERROR" });
    return NextResponse.json(
      { state: "UNAVAILABLE", reason: "The alert email could not be sent", sent: false },
      { status: 503 },
    );
  }
}
