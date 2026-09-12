/**
 * GET /api/rocks/[id]/yield (N-2, D-004, D-016)
 *
 *  - 200 with an empty series when D1 is absent or has no rows for this rock. It returned a
 *    hardcoded three-point history and `currentAPY: 18.5` in both cases, and 500 in production
 *    because it used the wrong Cloudflare adapter (R-2, R-3);
 *  - `currentAPY` is gone entirely. Decision D-004 forbids the claim regardless of data quality,
 *    so APY is removed rather than staged (spec 15, Part 3);
 *  - `state` tells the client which of the three capability states the data is in. "no data" is
 *    never an error.
 */

import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { getDb, NO_DATABASE_REASON } from "@/lib/db";
import { consumeIpRateLimit } from "@/lib/rate-limit";
import { yieldSnapshots } from "@/lib/db/schema";
import { logger } from "@/lib/telemetry";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // 60 reads a minute per IP. The middleware limiter this replaces was a per-isolate Map and
  // counted nothing (SA-11).
  const limit = await consumeIpRateLimit(req, "rock-read", 60, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }

  try {
    const db = getDb();
    if (!db) {
      return NextResponse.json({
        state: "UNAVAILABLE",
        reason: NO_DATABASE_REASON,
        rockId: id,
        tvl: null,
        historicalData: [],
      });
    }

    const rows = await db
      .select()
      .from(yieldSnapshots)
      .where(eq(yieldSnapshots.rockId, id))
      .orderBy(asc(yieldSnapshots.timestamp))
      .limit(30);

    const historicalData = rows.map((row) => ({
      date: new Date(row.timestamp).toISOString().split("T")[0],
      timestamp: row.timestamp,
      tvl: row.tvlUsdc,
      fees: row.feesEarnedUsdc,
    }));

    return NextResponse.json({
      state: "REAL",
      rockId: id,
      tvl: historicalData.length > 0 ? historicalData[historicalData.length - 1].tvl : null,
      historicalData,
    });
  } catch (error) {
    logger.error("Error reading yield snapshots", error, { rockId: id });
    return NextResponse.json({
      state: "UNAVAILABLE",
      reason: "The yield history could not be read from the application database",
      rockId: id,
      tvl: null,
      historicalData: [],
    });
  }
}
