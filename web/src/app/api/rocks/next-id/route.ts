/**
 * GET /api/rocks/next-id — the next rock id nobody has awakened.
 *
 * The awakening beat needs a number to awaken *into*, and reusing one would make a single id mean
 * two objects in the provenance history: an archived rock keeps its id forever. So this is one
 * above the highest id that has ever been awakened, read from the indexed `awakened` events.
 *
 * It is a suggestion, not a reservation. Two people asking at the same moment get the same
 * number, and the registry settles it: the second `awakenRock` reverts with `RockAlreadyAwakened`
 * and the client asks again. Handing out a number this route cannot actually reserve, and calling
 * it reserved, would be the dishonest version.
 */

import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { getDb, NO_DATABASE_REASON } from "@/lib/db";
import { rockEvents } from "@/lib/db/schema";
import { consumeIpRateLimit } from "@/lib/rate-limit";
import { nextFreeRockId } from "@/lib/rock-account";
import { logger } from "@/lib/telemetry";

export async function GET(req: Request) {
  const limit = await consumeIpRateLimit(req, "next-id", 60, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json(
      {
        state: "UNAVAILABLE",
        reason: `${NO_DATABASE_REASON}; without the indexed events there is no way to know which ids are taken`,
      },
      { status: 503 },
    );
  }

  try {
    const rows = await db
      .select({ rockId: rockEvents.rockId })
      .from(rockEvents)
      .where(eq(rockEvents.eventType, "awakened"))
      .orderBy(desc(rockEvents.timestamp))
      .limit(1000);

    const rockId = nextFreeRockId(rows.map((row) => row.rockId));

    return NextResponse.json({
      state: "REAL",
      rockId,
      basedOnAwakenedCount: rows.length,
    });
  } catch (error) {
    logger.error("Failed to compute the next rock id", error, { action: "NEXT_ROCK_ID_FAILED" });
    return NextResponse.json(
      { state: "UNAVAILABLE", reason: "The indexed events could not be read" },
      { status: 503 },
    );
  }
}
