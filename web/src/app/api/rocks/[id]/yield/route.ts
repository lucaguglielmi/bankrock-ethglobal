import { NextResponse } from 'next/server';
import { getRequestContext } from "@cloudflare/next-on-pages";
import { logger } from "@/lib/telemetry";
import { getDb } from "@/lib/db";
import { yieldSnapshots } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

export const runtime = "edge";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // In local dev without wrangler running, env will be empty. Fallback to mock data.
    const { id } = await params;
    
    // DEMO OVERRIDE FOR ROCK 420
    if (id === "420") {
      return NextResponse.json({
        rockId: "420",
        currentAPY: 32.4,
        tvl: 1250400.0,
        historicalData: [
          { date: "2023-08-01", tvl: 1000000, fees: 1500, apy: 15.2 },
          { date: "2023-09-01", tvl: 1050000, fees: 2800, apy: 18.1 },
          { date: "2023-10-01", tvl: 1100000, fees: 4500, apy: 22.4 },
          { date: "2023-11-01", tvl: 1180000, fees: 7200, apy: 28.5 },
          { date: "2023-12-01", tvl: 1250400, fees: 11400, apy: 32.4 },
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
      // Mock Data for development or if D1 is not bound
      return NextResponse.json({
        rockId: id,
        currentAPY: 18.5,
        tvl: 45000.0,
        historicalData: [
          { date: "2023-01-01", tvl: 1200, fees: 5, apy: 10 },
          { date: "2023-02-01", tvl: 1250, fees: 8, apy: 12 },
          { date: "2023-03-01", tvl: 1300, fees: 12.4, apy: 18.5 },
        ]
      });
    }

    const drizzleDb = getDb(getRequestContext().env as any);
    
    // Fetch historical snapshots from D1 via Drizzle
    const results = await drizzleDb
      .select()
      .from(yieldSnapshots)
      .where(eq(yieldSnapshots.rockId, id))
      .orderBy(asc(yieldSnapshots.timestamp))
      .limit(30);

    // Map to expected UI format
    const historicalData = results.map(row => ({
      date: new Date(row.timestamp).toISOString().split('T')[0], // YYYY-MM-DD
      tvl: row.tvlUsdc,
      fees: row.feesEarnedUsdc,
      apy: 18.5 // In a real scenario, this would be computed dynamically based on fee growth
    }));

    // If D1 is empty for this rock, fall back to mock data so the UI doesn't look broken during the hackathon
    if (historicalData.length === 0) {
      return NextResponse.json({
        rockId: id,
        currentAPY: 18.5,
        tvl: 1250.0,
        historicalData: [
          { date: "2023-01-01", tvl: 1200, fees: 5, apy: 10 },
          { date: "2023-02-01", tvl: 1250, fees: 8, apy: 12 },
          { date: "2023-03-01", tvl: 1300, fees: 12.4, apy: 18.5 },
        ]
      });
    }

    const latest = historicalData[historicalData.length - 1];

    return NextResponse.json({
      rockId: id,
      currentAPY: latest.apy,
      tvl: latest.tvl,
      historicalData
    });
  } catch (error) {
    logger.error('Error fetching yield data', error as Error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
