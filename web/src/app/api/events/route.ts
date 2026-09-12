/**
 * GET /api/events?rockId=N — indexed registry provenance (X-5).
 *
 * Returns real events, or an empty list carrying `state: "UNAVAILABLE"` and the reason when the
 * registry address is unset, the deploy block is unknown, or the RPC could not be read. An empty
 * `REAL` list means the chain really holds no events for that rock; the two cases are never
 * conflated.
 */

import { NextResponse } from "next/server";
import { getRockOnchainEvents, sanitizeRockId } from "@/lib/indexer";
import { logger } from "@/lib/telemetry";

export async function GET(req: Request) {
  const start = Date.now();
  const { searchParams } = new URL(req.url);
  const rawRockId = searchParams.get("rockId");

  if (!rawRockId || sanitizeRockId(rawRockId) === null) {
    return NextResponse.json(
      { error: "rockId is required and must be an unsigned integer" },
      { status: 400 },
    );
  }

  const rockId = sanitizeRockId(rawRockId)!;
  const result = await getRockOnchainEvents(rockId);

  const headers = {
    "Cache-Control": "public, s-maxage=15, stale-while-revalidate=45",
    "X-Content-Type-Options": "nosniff",
  };

  if (result.state === "UNAVAILABLE") {
    return NextResponse.json(
      {
        state: "UNAVAILABLE",
        reason: result.reason,
        rockId: rockId.toString(),
        count: 0,
        events: [],
      },
      { headers },
    );
  }

  logger.info("Events API served indexed logs", {
    action: "EVENTS_API_SUCCESS",
    rockId: rockId.toString(),
    count: result.value.length,
    latencyMs: Date.now() - start,
  });

  return NextResponse.json(
    {
      state: "REAL",
      rockId: rockId.toString(),
      count: result.value.length,
      events: result.value,
    },
    { headers },
  );
}
