/**
 * Edge middleware: admin route protection and API CORS.
 *
 * Rate limiting (SA-11) used to live here as a `Map`. On Workers every isolate has its own
 * memory and isolates are created and discarded constantly, so that limiter counted a handful of
 * requests per isolate and limited nothing at all. It is removed rather than left in place
 * looking like a control.
 *
 * The replacement is `lib/rate-limit.ts`, a D1-backed fixed-window limiter applied inside the
 * route handlers (faucet, contact, vanity, newsletter, admin login). It lives there rather than
 * here because middleware runs in the edge runtime, where the Cloudflare context — and therefore
 * the D1 binding — is not reliably reachable, while a route handler always has it.
 *
 * CORS uses NEXT_PUBLIC_APP_URL (D-022); the hardcoded fallback origin is gone.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://bank-rock.com").replace(/\/+$/, "");

async function hashUserAgent(userAgent: string): Promise<string> {
  const data = new TextEncoder().encode(userAgent || "unknown");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(request: NextRequest) {
  const url = request.nextUrl.pathname;

  if (url.startsWith("/admin") && url !== "/admin/login") {
    // D-017: with no ADMIN_JWT_SECRET there is nothing to verify a session against, so the admin
    // area is closed. It is never opened by a missing secret.
    const secret = process.env.ADMIN_JWT_SECRET;
    if (!secret) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }

    const token = request.cookies.get("bankrock_sentinel_session")?.value;
    if (!token) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }

    try {
      const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
      if (payload.role !== "admin") {
        throw new Error("Invalid role");
      }

      const currentUah = await hashUserAgent(request.headers.get("user-agent") || "unknown");
      if (typeof payload.uah !== "string" || payload.uah !== currentUah) {
        throw new Error("User-Agent mismatch");
      }
    } catch {
      const response = NextResponse.redirect(new URL("/admin/login", request.url));
      response.cookies.delete("bankrock_sentinel_session");
      return response;
    }
  }

  const response = NextResponse.next();

  if (url.startsWith("/api/")) {
    response.headers.set("Access-Control-Allow-Origin", APP_URL);
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.headers.set(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, x-alchemy-signature, x-admin-key, x-cron-secret",
    );
    response.headers.set("Vary", "Origin");
  }

  return response;
}

export const config = {
  matcher: ["/api/:path*", "/admin/:path*"],
};
