import { NextResponse } from 'next/server';
import { getRequestContext } from "@cloudflare/next-on-pages";
import { getDb } from "@/lib/db";
import { yieldSnapshots } from "@/lib/db/schema";
import { logger } from "@/lib/telemetry";
import * as crypto from 'crypto';

export const runtime = "edge";

export async function GET(req: Request) {
  // In production, require a secure chron token matching an env var
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  
  if (process.env.CRON_SECRET && token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const env = getRequestContext().env as any;
    if (!env || !env.DB) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 });
    }
    
    const db = getDb(env);
    const now = Date.now();

    // Since this is a hackathon MVP, we don't have a robust directory of all active rocks yet.
    // In a full implementation, we would query the `rocks` table, then fetch each Rock's Safe TVL.
    // For now, we will simulate the chron indexer executing a TVL capture for Rock "1" and "2".
    
    const mockRocksToSnapshot = [
      { id: "1", currentTvl: 1250.00, currentFees: 12.40 },
      { id: "2", currentTvl: 450.00, currentFees: 1.20 }
    ];

    for (const rock of mockRocksToSnapshot) {
      // Simulate real-world drift slightly for the chart to move up
      const tvlDrift = rock.currentTvl + (Math.random() * 10 - 2); 
      const feesDrift = rock.currentFees + (Math.random() * 1);

      await db.insert(yieldSnapshots).values({
        id: crypto.randomUUID(),
        rockId: rock.id,
        timestamp: now,
        tvlUsdc: parseFloat(tvlDrift.toFixed(2)),
        feesEarnedUsdc: parseFloat(feesDrift.toFixed(2)),
      });
    }

    logger.info('Yield Snapshot Cron executed successfully', { rocksSnapshotted: mockRocksToSnapshot.length });

    return NextResponse.json({ success: true, message: "Yield snapshots captured." });
  } catch (error) {
    logger.error('Error executing Yield Snapshot Cron', error as Error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
