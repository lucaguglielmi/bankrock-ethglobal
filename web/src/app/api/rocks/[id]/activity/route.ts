import { NextResponse } from 'next/server';
import { getRequestContext } from "@cloudflare/next-on-pages";
import { logger } from "@/lib/telemetry";

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

    // Real D1 SQL query
    const stmt = db.prepare(`
      SELECT id, type, title, timestamp, txHash 
      FROM Events 
      WHERE rockId = ? 
      ORDER BY timestamp DESC 
      LIMIT 50
    `);
    
    const { results } = await stmt.bind(id).all();

    return NextResponse.json({
      events: results
    });
  } catch (error) {
    logger.error('Error fetching activity data', error as Error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
