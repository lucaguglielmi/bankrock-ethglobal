import { NextResponse } from "next/server";
import { getRockOnchainEvents, sanitizeRockId } from "@/lib/indexer";
import { logger } from "@/lib/telemetry";

export async function GET(req: Request) {
  const start = Date.now();

  try {
    const { searchParams } = new URL(req.url);
    const rawRockId = searchParams.get("rockId");

    if (!rawRockId) {
      logger.warn("Events API request missing rockId parameter", {
        action: "EVENTS_API_BAD_REQUEST",
        statusCode: 400,
      });
      return NextResponse.json(
        { error: "rockId parameter is required and must be a valid positive integer" },
        { status: 400 }
      );
    }

    const rockId = sanitizeRockId(rawRockId);
    if (rockId === null) {
      logger.warn("Events API rejected malformed rockId", {
        action: "EVENTS_API_INVALID_INPUT",
        rawRockId: rawRockId.slice(0, 50),
        statusCode: 400,
      });
      return NextResponse.json(
        { error: "Invalid rockId format. Must be an unsigned integer." },
        { status: 400 }
      );
    }

    const events = await getRockOnchainEvents(rockId);

    const latencyMs = Date.now() - start;
    logger.info("Events API served on-chain logs", {
      action: "EVENTS_API_SUCCESS",
      rockId: rockId.toString(),
      count: events.length,
      latencyMs,
    });

    return NextResponse.json(
      {
        success: true,
        rockId: rockId.toString(),
        count: events.length,
        events,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=15, stale-while-revalidate=45",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  } catch (error) {
    const latencyMs = Date.now() - start;
    logger.error("Events API internal error", error, {
      action: "EVENTS_API_ERROR",
      latencyMs,
    });

    // Do not leak stack traces to client
    return NextResponse.json(
      { error: "Internal server error while indexing on-chain events." },
      { status: 500 }
    );
  }
}
