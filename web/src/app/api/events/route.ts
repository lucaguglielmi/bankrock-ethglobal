/**
 * GET /api/events?rockId=N — a rock's indexed provenance (X-5).
 *
 * Returns the decoded registry events with the block's own timestamp and the transaction hash, or
 * an empty list carrying `state: "UNAVAILABLE"` and a reason when the registry address is unset,
 * the deploy block is unknown, or the RPC could not be read. An empty `REAL` list means the chain
 * really holds no events for that rock; the two are never conflated.
 */

import { NextResponse } from "next/server";
import { getRockOnchainEvents, sanitizeRockId } from "@/lib/indexer";
import { consumeIpRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/telemetry";

export async function GET(req: Request) {
  const start = Date.now();

  const limit = await consumeIpRateLimit(req, "events", 60, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const rawRockId = searchParams.get("rockId");
  const rockId = rawRockId === null ? null : sanitizeRockId(rawRockId);

  if (rockId === null) {
    return NextResponse.json(
      { error: "rockId is required and must be an unsigned integer" },
      { status: 400 },
    );
  }

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
