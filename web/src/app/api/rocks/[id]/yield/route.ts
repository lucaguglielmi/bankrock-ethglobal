import { NextResponse } from 'next/server';
import { getRequestContext } from "@cloudflare/next-on-pages";
import { logger } from "@/lib/telemetry";

export const runtime = "edge";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // In local dev without wrangler running, env will be empty. Fallback to mock data.
    const { id } = await params;
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
          { date: "2023-01-01", apy: 10, volume: 1000 },
          { date: "2023-02-01", apy: 12, volume: 2000 },
          { date: "2023-03-01", apy: 18.5, volume: 3500 },
        ]
      });
    }

    // Prepare and execute real D1 SQL query
    const stmt = db.prepare(`
      SELECT date, apy, volume 
      FROM DailyYield 
      WHERE rockId = ? 
      ORDER BY date ASC 
      LIMIT 30
    `);
    
    const { results } = await stmt.bind(id).all();

    // Calculate current APY and TVL from the latest record or another query
    const currentAPY = results.length > 0 ? (results[results.length - 1] as any).apy : 0;
    
    return NextResponse.json({
      rockId: id,
      currentAPY,
      tvl: 0, // Would be fetched from a RockStats table
      historicalData: results
    });
  } catch (error) {
    logger.error('Error fetching yield data', error as Error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
