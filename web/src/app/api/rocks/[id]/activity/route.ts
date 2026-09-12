import { NextResponse } from 'next/server';
import { getRequestContext } from "@cloudflare/next-on-pages";
import { logger } from "@/lib/telemetry";
import { getDb } from "@/lib/db";
import { rockEvents } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";

export const runtime = "edge";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let db;
    try {
      db = (getRequestContext().env as any).DB;
    } catch {
      db = null;
    }

    if (!db) {
      // Mock Data for development
      return NextResponse.json({
        events: [
          {
            id: `init-${id}`,
            type: "deployment",
            title: "Aqua Strategy Deployed",
            timestamp: new Date().toISOString(),
            txHash: "0x123...abc",
          }
        ]
      });
    }

    const drizzleDb = getDb(getRequestContext().env as any);
    
    // Real D1 SQL query via Drizzle
    const results = await drizzleDb
      .select()
      .from(rockEvents)
      .where(eq(rockEvents.rockId, id))
      .orderBy(desc(rockEvents.timestamp))
      .limit(50);

    // Map to expected UI format
    const events = results.map(row => ({
      id: row.id,
      type: row.eventType.toLowerCase(),
      title: row.eventType === "ALCHEMY_WEBHOOK" ? "On-chain Event Recorded" : row.eventType,
      timestamp: new Date(row.timestamp).toISOString(),
      txHash: row.txHash,
    }));

    return NextResponse.json({
      events
    });
  } catch (error) {
    logger.error('Error fetching activity data', error as Error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
