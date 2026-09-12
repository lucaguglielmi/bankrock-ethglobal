/**
 * Admin session handling (SA-8, SA-10, D-017).
 *
 *  - `ADMIN_JWT_SECRET` has no fallback. The old `|| 'fallback-secret-do-not-use-in-prod'` made
 *    every admin session forgeable by anyone who had read the repository;
 *  - `verifyAdminSession` now checks the `uah` (user-agent hash) claim it issues. Previously only
 *    the middleware checked it, so an API route accepted a session the middleware would reject;
 *  - a missing secret produces UNAVAILABLE, never a bypass.
 */

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { MissingEnvError, requireEnv } from "@/lib/demo";
import { timingSafeEqualString } from "@/lib/secure";

export const ADMIN_SESSION_COOKIE = "bankrock_sentinel_session";

/**
 * How long an admin session lives (audit P-14).
 *
 * Twelve hours, not thirty days. There is no revocation list — a session is a signed cookie and
 * nothing server-side can retire one early — so the lifetime *is* the revocation mechanism, and a
 * month of it was the whole exposure of one stolen laptop. Twelve hours covers a working day and
 * expires overnight.
 */
export const ADMIN_SESSION_SECONDS = 12 * 60 * 60;

function secretKey(): Uint8Array {
  return new TextEncoder().encode(requireEnv("ADMIN_JWT_SECRET"));
}

export async function hashUserAgent(userAgent: string): Promise<string> {
  const data = new TextEncoder().encode(userAgent || "unknown");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createAdminSession(userAgent: string) {
  const uah = await hashUserAgent(userAgent);
  const token = await new SignJWT({ role: "admin", uah })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ADMIN_SESSION_SECONDS}s`)
    .sign(secretKey());

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: ADMIN_SESSION_SECONDS,
    path: "/",
  });
}

export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_SESSION_COOKIE);
}

export type AdminSessionResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; reason: string };

/**
 * Verifies an admin session token, including the user-agent binding (SA-10).
 *
 * @param token     the session cookie value
 * @param userAgent the request's User-Agent; the `uah` claim must match its hash
 */
export async function verifyAdminSession(
  token: string | undefined | null,
  userAgent: string,
): Promise<AdminSessionResult> {
  let key: Uint8Array;
  try {
    key = secretKey();
  } catch (err) {
    if (err instanceof MissingEnvError) {
      return {
        ok: false,
        status: 503,
        reason: "ADMIN_JWT_SECRET is not configured, so no admin session can be verified",
      };
    }
    throw err;
  }

  if (!token) {
    return { ok: false, status: 401, reason: "No admin session" };
  }

  try {
    // Pinned (audit P-8): jose already rejects `alg: none` and a key-type mismatch, but pinning
    // makes that a property of this call rather than of jose's defaults.
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (payload.role !== "admin") {
      return { ok: false, status: 401, reason: "Not an admin session" };
    }
    const expectedUah = await hashUserAgent(userAgent);
    if (typeof payload.uah !== "string" || !timingSafeEqualString(payload.uah, expectedUah)) {
      return { ok: false, status: 401, reason: "Session is bound to a different client" };
    }
    return { ok: true };
  } catch {
    return { ok: false, status: 401, reason: "Admin session is invalid or expired" };
  }
}

/** Route guard: verifies the admin cookie on a Request, or hands back the response to send. */
export async function requireAdminSession(
  req: Request,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const result = await verifyAdminSession(token, req.headers.get("user-agent") || "unknown");

  if (result.ok) return { ok: true };

  return {
    ok: false,
    response: NextResponse.json(
      result.status === 503
        ? { state: "UNAVAILABLE", reason: result.reason }
        : { error: result.reason },
      { status: result.status },
    ),
  };
}
