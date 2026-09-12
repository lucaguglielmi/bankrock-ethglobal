/**
 * GET /api/admin/stats — operator dashboard figures from D1 (N-7).
 *
 * The admin dashboard was a `setTimeout` returning $1,254,300 TVL, 42 rocks and 8 Gelato tasks.
 * This reads what the database actually holds and says so when it holds nothing. There is no
 * POST: this endpoint answers questions, it does not accept figures.
 *
 * Requires the admin session cookie (the same credential the /admin pages use).
 */

import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { requireAdminSession } from "@/lib/auth";
import { getDb, NO_DATABASE_REASON } from "@/lib/db";
import { logger } from "@/lib/telemetry";

export async function GET(req: Request) {
  const admin = await requireAdminSession(req);
  if (!admin.ok) return admin.response;

  const db = getDb();
  if (!db) {
    return NextResponse.json({ state: "UNAVAILABLE", reason: NO_DATABASE_REASON }, { status: 503 });
  }

  try {
    const [rockCount, eventCount, snapshotCount, subscriberCount, contactCount] = await Promise.all(
      [
        db.get<{ n: number }>(sql`SELECT COUNT(*) AS n FROM rocks`),
        db.get<{ n: number }>(sql`SELECT COUNT(*) AS n FROM rock_events`),
        db.get<{ n: number }>(sql`SELECT COUNT(*) AS n FROM yield_snapshots`),
        db.get<{ n: number }>(sql`SELECT COUNT(*) AS n FROM subscribers`),
        db.get<{ n: number }>(sql`SELECT COUNT(*) AS n FROM contact_requests`),
      ],
    );

    // The latest snapshot per rock, summed. Null when nothing has ever been snapshotted — a zero
    // would read as "we measured zero TVL", which is a different claim.
    const tvlRow = await db.get<{ tvl: number | null; measured_at: number | null }>(sql`
      SELECT SUM(s.tvl_usdc) AS tvl, MAX(s.timestamp) AS measured_at
      FROM yield_snapshots s
      JOIN (
        SELECT rock_id, MAX(timestamp) AS latest FROM yield_snapshots GROUP BY rock_id
      ) latest_per_rock
        ON latest_per_rock.rock_id = s.rock_id AND latest_per_rock.latest = s.timestamp
    `);

    return NextResponse.json({
      state: "REAL",
      rocks: rockCount?.n ?? 0,
      events: eventCount?.n ?? 0,
      yieldSnapshots: snapshotCount?.n ?? 0,
      subscribers: subscriberCount?.n ?? 0,
      contactRequests: contactCount?.n ?? 0,
      tvlUsdc: tvlRow?.tvl ?? null,
      tvlMeasuredAt: tvlRow?.measured_at ? new Date(tvlRow.measured_at).toISOString() : null,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Admin stats query failed", error, { action: "ADMIN_STATS_FAILED" });
    return NextResponse.json(
      { state: "UNAVAILABLE", reason: "The statistics could not be read from the database" },
      { status: 503 },
    );
  }
}
