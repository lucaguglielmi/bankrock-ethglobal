import { NextRequest, NextResponse } from "next/server";

import { evaluateAquaPosition, executeAquaRebalance } from "@/lib/aqua-keeper";
import { logger } from "@/lib/telemetry";


/**
 * GET /api/keeper?rockId=1&threshold=3.0
 * Evaluates the Aqua position and returns whether rebalancing is advised.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const rawRockId = searchParams.get("rockId") || "1";
    const rawThreshold = searchParams.get("threshold") || "3.0";

    const rockId = parseInt(rawRockId, 10);
    const threshold = parseFloat(rawThreshold);

    if (isNaN(rockId) || rockId <= 0) {
      return NextResponse.json(
        { error: "Invalid rockId. Must be a positive integer." },
        { status: 400 }
      );
    }

    const state = await evaluateAquaPosition(rockId, isNaN(threshold) ? 3.0 : threshold);

    return NextResponse.json(
      { success: true, ...state },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  } catch (error: unknown) {
    logger.error("Error in GET /api/keeper", error);
    return NextResponse.json(
      { error: "Failed to evaluate Aqua position" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/keeper
 * Body: { rockId: 1 }
 * Executes an automated keeper rebalance.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({})) as { rockId?: number | string };
    const rawRockId = body.rockId || 1;
    const rockId = parseInt(String(rawRockId), 10);

    if (isNaN(rockId) || rockId <= 0) {
      return NextResponse.json(
        { error: "Invalid rockId. Must be a positive integer." },
        { status: 400 }
      );
    }

    const result = await executeAquaRebalance(rockId);

    return NextResponse.json(result, {
      status: 200,
      headers: {
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error: unknown) {
    logger.error("Error in POST /api/keeper", error);
    return NextResponse.json(
      { error: "Failed to execute keeper rebalance" },
      { status: 500 }
    );
  }
}
