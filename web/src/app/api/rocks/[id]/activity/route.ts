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
    
    // DEMO OVERRIDE FOR ROCK 420
    if (id === "420") {
      return NextResponse.json({
        events: [
          {
            id: `rebalance-420-1`,
            type: "trade",
            title: "Gelato Keeper Rebalance",
            description: "Automatically rebalanced to maintain delta neutral. Swapped 14,500 USDC for WETH.",
            timestamp: new Date(Date.now() - 3600000).toISOString(),
            txHash: "0x4200000000000000000000000000000000000000000000000000000000000000",
          },
          {
            id: `fee-420-2`,
            type: "fee",
            title: "Yield Harvest",
            description: "Harvested 4,200 USDC from Aqua pool fees.",
            timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
            txHash: "0x4200000000000000000000000000000000000000000000000000000000000001",
          },
          {
            id: `mcp-420-3`,
            type: "update",
            title: "Strategy Updated by AI Oracle",
            description: "Agent changed rebalance threshold to 5% due to high market volatility.",
            timestamp: new Date(Date.now() - 86400000 * 5).toISOString(),
            txHash: "0x4200000000000000000000000000000000000000000000000000000000000002",
          },
          {
            id: `init-420`,
            type: "deployment",
            title: "Genesis Capital Deployed",
            description: "Initial deposit of 1,000,000 USDC.",
            timestamp: new Date(Date.now() - 86400000 * 120).toISOString(),
            txHash: "0x4200000000000000000000000000000000000000000000000000000000000003",
          }
        ]
      });
    }

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
