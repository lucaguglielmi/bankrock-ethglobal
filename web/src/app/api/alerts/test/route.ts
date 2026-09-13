/**
 * POST /api/alerts/test — operator check that email delivery is configured (SA-1).
 *
 * This was an open email relay: any anonymous caller could make the Resend sending domain deliver
 * Bank Rock-branded mail to any address, with `to.includes("@")` as the only validation.
 *
 * It is kept, not deleted, because it still has one real purpose: an operator needs a way to
 * prove that RESEND_API_KEY and the sending domain work before relying on them. Everything else
 * about it changed:
 *
 *  - it requires the admin session;
 *  - the five fabricated presets are gone. They shipped invented transaction hashes, an invented
 *    "Maker APR 18.4%" and an invented NFC UID, all of which would have been screenshot as real
 *    (D-014, D-004);
 *  - the response reports what actually happened, because `sendAlertEmail` no longer claims
 *    success for mail it did not send (S-5).
 *
 * Alert delivery itself is intentionally sandboxed until the project is on mainnet; this route
 * only proves the sender is configured (DEMO-STATE N-2, K-9).
 */

import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth";
import { sendAlertEmail } from "@/lib/email-service";
import { logger } from "@/lib/telemetry";

export async function POST(req: Request) {
  const admin = await requireAdminSession(req);
  if (!admin.ok) return admin.response;

  const body = (await req.json().catch(() => ({}))) as { to?: string };
  const to = typeof body.to === "string" ? body.to.trim() : "";

  if (!to || !to.includes("@") || to.length > 254) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }

  const result = await sendAlertEmail({
    to,
    rockId: "—",
    topic: "configuration_test",
    topicTitle: "Email delivery test",
    severity: "info",
    summary:
      "This message confirms that Bank Rock can reach your inbox. It contains no balances, no figures and no transaction — alert delivery itself stays sandboxed on purpose until Bank Rock is on mainnet.",
  });

  logger.info("Operator email delivery test", {
    action: "EMAIL_TEST",
    recipient: to,
    sent: result.success,
  });

  return NextResponse.json(
    {
      state: result.success ? "REAL" : "UNAVAILABLE",
      sent: result.success,
      reason: result.reason,
      message: result.message,
    },
    { status: result.success ? 200 : 503 },
  );
}
