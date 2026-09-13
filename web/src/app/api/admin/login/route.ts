/**
 * POST /api/admin/login (SA-8, D-017)
 *
 * `if (correctPassword && password === correctPassword)` meant an unset ADMIN_PASSWORD failed
 * closed by accident — every login was rejected — while ADMIN_JWT_SECRET failed *open* through
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
import { requireIpRateLimit, requireRateLimit } from "@/lib/rate-limit";
import { timingSafeEqualString, unavailableResponse } from "@/lib/secure";
import { logger } from "@/lib/telemetry";

function limitResponse(limit: { status?: 429 | 503; reason?: string }) {
  return NextResponse.json(
    limit.status === 503
      ? { state: "UNAVAILABLE", reason: limit.reason }
      : { error: limit.reason ?? "Too Many Requests" },
    { status: limit.status ?? 429 },
  );
}

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

  // Both limits fail closed (security review 2026-09-13, R-10): a limiter that cannot count is
  // not a limit on a password prompt, and "the ledger is unreachable" must not mean "unlimited
  // guesses". The per-IP bucket bounds one client; the global bucket bounds everyone together, so
  // spreading guesses across many addresses still meets a ceiling.
  const ipLimit = await requireIpRateLimit(req, "admin-login", 10, 15 * 60 * 1000);
  if (!ipLimit.ok) return limitResponse(ipLimit);

  const globalLimit = await requireRateLimit("admin-login:global", 50, 15 * 60 * 1000);
  if (!globalLimit.ok) return limitResponse(globalLimit);

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
