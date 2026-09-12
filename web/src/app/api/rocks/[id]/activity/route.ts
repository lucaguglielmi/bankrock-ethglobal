/**
 * GET /api/rocks/[id]/activity (N-2, D-014, D-016)
 *
 *  - 200 with an empty list when D1 is absent or empty. It previously invented an
 *    "Aqua Strategy Deployed" event with the tx hash "0x123...abc", and 500'd in production
 *    because of the wrong Cloudflare adapter;
 *  - a transaction hash is passed through only when it is a real 32-byte hash, so no explorer
 *    link can ever point at a placeholder (D-014).
 */

import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb, NO_DATABASE_REASON } from "@/lib/db";
import { rockEvents } from "@/lib/db/schema";
import { logger } from "@/lib/telemetry";

const TX_HASH_REGEX = /^0x[0-9a-fA-F]{64}$/;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const db = getDb();
    if (!db) {
      return NextResponse.json({
        state: "UNAVAILABLE",
        reason: NO_DATABASE_REASON,
        rockId: id,
        events: [],
      });
    }

    const rows = await db
      .select()
      .from(rockEvents)
      .where(eq(rockEvents.rockId, id))
      .orderBy(desc(rockEvents.timestamp))
      .limit(50);

    const events = rows.map((row) => ({
      id: row.id,
      type: row.eventType.toLowerCase(),
      title: row.eventType === "ALCHEMY_WEBHOOK" ? "On-chain event recorded" : row.eventType,
      timestamp: new Date(row.timestamp).toISOString(),
      txHash: TX_HASH_REGEX.test(row.txHash) ? row.txHash : undefined,
    }));

    return NextResponse.json({ state: "REAL", rockId: id, events });
  } catch (error) {
    logger.error("Error reading rock activity", error, { rockId: id });
    return NextResponse.json({
      state: "UNAVAILABLE",
      reason: "The activity history could not be read from the application database",
      rockId: id,
      events: [],
    });
  }
}
