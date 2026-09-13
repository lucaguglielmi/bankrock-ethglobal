/**
 * POST /api/admin/login (SA-8, D-017)
 *
 * `if (correctPassword && password === correctPassword)` meant an unset ADMIN_PASSWORD failed
 * closed by accident - every login was rejected - while ADMIN_JWT_SECRET failed *open* through
 * its fallback string. Both now fail closed explicitly: an unset secret is a 503 UNAVAILABLE, and
 * the password comparison is constant-time.
 *
 * The edge runtime export is removed: the deployment adapter is OpenNext, whose worker
 * serves route handlers itself, and the Node runtime is what `node:crypto` and the D1 binding
 * expect (D-016).
 */

import { NextResponse } from "next/server";
import { createAdminSession } from "@/lib/auth";
import { MissingEnvError, requireEnv } from "@/lib/demo";
import { consumeIpRateLimit } from "@/lib/rate-limit";
import { timingSafeEqualString, unavailableResponse } from "@/lib/secure";
import { logger } from "@/lib/telemetry";

export async function POST(req: Request) {
  let expected: string;
  try {
    expected = requireEnv("ADMIN_PASSWORD");
    // Verified here too: without it no session could be signed, and there is no fallback secret.
    requireEnv("ADMIN_JWT_SECRET");
  } catch (err) {
    if (err instanceof MissingEnvError) {
      return unavailableResponse(
        `${err.variable} is not configured, so the admin console cannot be used`,
      );
    }
    throw err;
  }

  const limit = await consumeIpRateLimit(req, "admin-login", 10, 15 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }

  try {
    const { password } = (await req.json()) as { password?: string };
    const userAgent = req.headers.get("user-agent") || "unknown";

    if (typeof password !== "string" || !timingSafeEqualString(password, expected)) {
      logger.warn("Rejected admin login", { action: "ADMIN_LOGIN_REJECTED" });
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await createAdminSession(userAgent);
    logger.info("Admin session created", { action: "ADMIN_LOGIN_OK" });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Admin login failed", error, { action: "ADMIN_LOGIN_ERROR" });
    return NextResponse.json({ error: "Bad Request" }, { status: 400 });
  }
}
