/**
 * Durable rate limiting (SA-11).
 *
 * The previous limiter was a `Map` in middleware. On Workers each isolate has its own memory and
 * isolates are created and discarded constantly, so that limiter counted a few requests per
 * isolate and limited nothing. Buckets now live in D1, where every isolate sees the same counter.
 *
 * Fail-open or fail-closed is the caller's decision, and it is a real decision (audit P-11):
 *
 *  - **read routes fail open.** `consumeIpRateLimit` returns `allowed: true, enforced: false` when
 *    D1 is unreachable, so a database outage does not take the rock pages down with it. The limit
 *    on those routes protects the operator's RPC bill, and an outage is the wrong moment to also
 *    stop serving. `enforced: false` is in the result so a caller can log it;
 *  - **routes that spend money fail closed.** The faucet, the relayed claim, and the write routes
 *    use `requireRateLimit`, which refuses when the ledger cannot be consulted. A limiter that
 *    cannot count is not a limit, and "we could not check" must never mean "go ahead" on a path
 *    that spends gas or writes a row on someone's behalf.
 */

import { sql } from "drizzle-orm";
import { getDb, NO_DATABASE_REASON } from "@/lib/db";
import { logger } from "@/lib/telemetry";

export interface RateLimitDecision {
  /** false only when the limiter positively established that the caller is over the limit. */
  allowed: boolean;
  /** true when no durable store was reachable, so no limit could be enforced. */
  enforced: boolean;
  remaining: number;
  reason?: string;
}

/** SHA-256 of an arbitrary key. Client IPs are stored hashed; they are keys, not user records. */
export async function hashKey(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** The client IP as seen behind Cloudflare, or null when no header is present. */
export function clientIp(req: Request): string | null {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null
  );
}

/**
 * Consumes one unit from a fixed window bucket.
 *
 * The whole decision is a single upsert: the window is reset when it has expired and the count is
 * incremented otherwise, so concurrent isolates cannot both read a stale count.
 */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitDecision> {
  const db = getDb();
  if (!db) {
    return { allowed: true, enforced: false, remaining: limit, reason: NO_DATABASE_REASON };
  }

  const now = Date.now();
  const windowStart = now - (now % windowMs);

  try {
    const rows = await db.all<{ count: number }>(sql`
      INSERT INTO rate_limits (key, window_start, count)
      VALUES (${key}, ${windowStart}, 1)
      ON CONFLICT(key) DO UPDATE SET
        count = CASE WHEN rate_limits.window_start < ${windowStart} THEN 1 ELSE rate_limits.count + 1 END,
        window_start = CASE WHEN rate_limits.window_start < ${windowStart} THEN ${windowStart} ELSE rate_limits.window_start END
      RETURNING count
    `);

    const count = rows?.[0]?.count ?? 1;
    return {
      allowed: count <= limit,
      enforced: true,
      remaining: Math.max(0, limit - count),
    };
  } catch (err) {
    logger.error("Rate limit store unavailable", err, { action: "RATE_LIMIT_STORE_ERROR" });
    return {
      allowed: true,
      enforced: false,
      remaining: limit,
      reason: "Rate limit store unavailable",
    };
  }
}

/** Convenience: limits by client IP under a named scope. */
export async function consumeIpRateLimit(
  req: Request,
  scope: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitDecision> {
  const ip = clientIp(req);
  if (!ip) {
    return {
      allowed: true,
      enforced: false,
      remaining: limit,
      reason: "No client IP header present",
    };
  }
  return consumeRateLimit(`${scope}:${await hashKey(ip)}`, limit, windowMs);
}

/* -------------------------------------------------------------------------- */
/* Fail-closed variant                                                         */
/* -------------------------------------------------------------------------- */

/**
 * A rate limit that must hold, for routes that spend money or write on a caller's behalf.
 *
 * Unlike `consumeIpRateLimit`, an unreachable ledger is a refusal, not a pass: on these routes the
 * limit is the only thing between a captured credential and an unbounded bill. Returns the reason
 * to put in a 429 or a 503 body — never an error object, so nothing internal escapes (audit P-2).
 */
export interface RequiredLimitResult {
  ok: boolean;
  /** 429 when the caller is over the limit, 503 when the limiter itself could not be consulted. */
  status?: 429 | 503;
  reason?: string;
}

export async function requireRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RequiredLimitResult> {
  const decision = await consumeRateLimit(key, limit, windowMs);

  if (!decision.enforced) {
    return {
      ok: false,
      status: 503,
      reason:
        "The rate-limit ledger is unavailable, so this request cannot be accepted — it would be unlimited",
    };
  }
  if (!decision.allowed) {
    return { ok: false, status: 429, reason: "Too Many Requests" };
  }
  return { ok: true };
}

/** `requireRateLimit`, keyed on the client IP under a named scope. */
export async function requireIpRateLimit(
  req: Request,
  scope: string,
  limit: number,
  windowMs: number,
): Promise<RequiredLimitResult> {
  const ip = clientIp(req);
  if (!ip) {
    // No IP header at all means the request did not come through the edge. On a spending route
    // that is refused rather than waved through.
    return {
      ok: false,
      status: 503,
      reason: "This request carries no client address, so it cannot be rate-limited",
    };
  }
  return requireRateLimit(`${scope}:${await hashKey(ip)}`, limit, windowMs);
}
