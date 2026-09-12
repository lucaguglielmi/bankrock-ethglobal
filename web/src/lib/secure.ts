/**
 * Fail-closed credential checks (D-017, SA-8, SA-9, SA-10).
 *
 * The pattern `if (SECRET && mismatch) reject` is prohibited: an unset secret must reject, not
 * bypass. Everything here treats "not configured" as a hard 503, never as "no authentication
 * required".
 */

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { MissingEnvError, requireEnv } from "@/lib/demo";

/** Constant-time string comparison. Returns false for unequal lengths without leaking more. */
export function timingSafeEqualString(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) {
    // Still burn a comparison of equal length so the fast path is not obviously shorter.
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

/** Constant-time comparison of two hex strings of the same expected byte length. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const normalise = (value: string) => value.trim().toLowerCase().replace(/^0x/, "");
  return timingSafeEqualString(normalise(a), normalise(b));
}

export type GuardFailure = { ok: false; response: NextResponse };
export type GuardSuccess = { ok: true };
export type GuardResult = GuardSuccess | GuardFailure;

export function unavailableResponse(reason: string): NextResponse {
  return NextResponse.json({ state: "UNAVAILABLE", reason }, { status: 503 });
}

export function unauthorizedResponse(reason = "Unauthorized"): NextResponse {
  return NextResponse.json({ error: reason }, { status: 401 });
}

/**
 * Requires a request header to equal a configured secret, in constant time.
 *
 * - secret unset   -> 503 UNAVAILABLE (never a bypass)
 * - header missing -> 401
 * - mismatch       -> 401
 */
export function requireHeaderSecret(
  req: Request,
  headerName: string,
  envName: string,
): GuardResult {
  let expected: string;
  try {
    expected = requireEnv(envName);
  } catch (err) {
    if (err instanceof MissingEnvError) {
      return {
        ok: false,
        response: unavailableResponse(
          `${envName} is not configured, so this endpoint cannot authenticate callers`,
        ),
      };
    }
    throw err;
  }

  const provided = req.headers.get(headerName);
  if (!provided || !timingSafeEqualString(provided, expected)) {
    return { ok: false, response: unauthorizedResponse() };
  }
  return { ok: true };
}

/** `x-admin-key: <ADMIN_API_KEY>` — operator-only read endpoints (SA-2, N-10). */
export function requireAdminApiKey(req: Request): GuardResult {
  return requireHeaderSecret(req, "x-admin-key", "ADMIN_API_KEY");
}

/** `x-cron-secret: <CRON_SECRET>` — scheduled callers (SA-6, SA-7, SA-12). */
export function requireCronSecret(req: Request): GuardResult {
  return requireHeaderSecret(req, "x-cron-secret", "CRON_SECRET");
}
