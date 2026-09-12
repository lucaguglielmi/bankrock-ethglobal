/**
 * /api/newsletter (N-10, D-016)
 *
 *  - POST writes to D1 and returns 503 UNAVAILABLE when there is no database. The in-memory
 *    fallback Map is gone: it reported a successful subscription that vanished with the isolate;
 *  - GET reads D1 and requires `x-admin-key: <ADMIN_API_KEY>`. It used to serve an in-memory map
 *    pre-seeded with a fabricated subscriber, and to expose the
 *    full subscriber list to anyone who guessed the bearer header.
 */

import { NextResponse } from "next/server";
import { desc, sql } from "drizzle-orm";
import { getDb, NO_DATABASE_REASON } from "@/lib/db";
import { subscribers } from "@/lib/db/schema";
import { consumeIpRateLimit } from "@/lib/rate-limit";
import { requireAdminApiKey } from "@/lib/secure";
import { logger } from "@/lib/telemetry";

const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export async function POST(req: Request) {
  const limit = await consumeIpRateLimit(req, "newsletter", 20, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as { email?: string; source?: string };
  const rawEmail = typeof body.email === "string" ? body.email.trim() : "";

  if (!rawEmail || rawEmail.length > 254 || !EMAIL_REGEX.test(rawEmail)) {
    return NextResponse.json({ error: "Please provide a valid email address." }, { status: 400 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ state: "UNAVAILABLE", reason: NO_DATABASE_REASON }, { status: 503 });
  }

  const email = rawEmail.toLowerCase();
  const source = typeof body.source === "string" ? body.source.slice(0, 64) : "landing";

  try {
    await db
      .insert(subscribers)
      .values({ email, topics: [source], createdAt: Date.now() })
      .onConflictDoNothing();

    logger.info("Newsletter subscription stored", { action: "NEWSLETTER_SUBSCRIBED", email });

    return NextResponse.json(
      { state: "REAL", persisted: true },
      { headers: { "X-Content-Type-Options": "nosniff" } },
    );
  } catch (error) {
    logger.error("Newsletter subscription failed", error, { action: "NEWSLETTER_FAILED" });
    return NextResponse.json(
      { state: "UNAVAILABLE", reason: "Your address could not be stored, so you are not signed up." },
      { status: 503 },
    );
  }
}

/** Operator view. Requires ADMIN_API_KEY; there is no public subscriber count. */
export async function GET(req: Request) {
  const guard = requireAdminApiKey(req);
  if (!guard.ok) return guard.response;

  const db = getDb();
  if (!db) {
    return NextResponse.json({ state: "UNAVAILABLE", reason: NO_DATABASE_REASON }, { status: 503 });
  }

  try {
    const countRow = await db.get<{ n: number }>(sql`SELECT COUNT(*) AS n FROM subscribers`);
    const rows = await db
      .select()
      .from(subscribers)
      .orderBy(desc(subscribers.createdAt))
      .limit(500);

    return NextResponse.json({
      state: "REAL",
      count: countRow?.n ?? rows.length,
      subscribers: rows.map((row) => ({
        email: row.email,
        topics: row.topics ?? [],
        createdAt: new Date(row.createdAt).toISOString(),
      })),
    });
  } catch (error) {
    logger.error("Newsletter read failed", error, { action: "NEWSLETTER_READ_FAILED" });
    return NextResponse.json(
      { state: "UNAVAILABLE", reason: "The subscriber list could not be read" },
      { status: 503 },
    );
  }
}
