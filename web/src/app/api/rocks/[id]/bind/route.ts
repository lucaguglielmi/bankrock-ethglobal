/**
 * POST /api/rocks/[id]/bind — record (or release) the tag → rock binding off chain.
 *
 * The registry is the authority: `rockIdForUid(uidHash)` says which rock a tag currently belongs
 * to, and archiving releases it there. This table is only a cache, so a tap can be routed without
 * a chain read on the critical path.
 *
 * Because it is only a cache, it is written by corroboration rather than by trust: the route
 * reads the registry and stores what the registry already says. A caller who lies is simply
 * refused — there is no input here that can make the database disagree with the chain. That is
 * what makes it safe to call it from the client right after an awaken, instead of inventing an
 * internal credential for a fact that is public on chain anyway.
 *
 * It stores `keccak256(uid)`, never the UID: a raw tag UID is a stable physical identifier and
 * does not belong in a database (SA-2, spec 06).
 */

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, NO_DATABASE_REASON } from "@/lib/db";
import { tagBindings } from "@/lib/db/schema";
import { consumeIpRateLimit } from "@/lib/rate-limit";
import { parseRockId, readRock, resolveRockForTag } from "@/lib/rock-account";
import { logger } from "@/lib/telemetry";

const UID_HASH_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (parseRockId(id) === null) {
    return NextResponse.json({ error: "Invalid rock id" }, { status: 400 });
  }

  const limit = await consumeIpRateLimit(req, "bind", 60, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ state: "UNAVAILABLE", reason: NO_DATABASE_REASON }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as { uidHash?: string; release?: boolean };

  if (body.release) {
    // Archiving releases the tag on chain. Only mirror that once the chain agrees.
    const rock = await readRock(id);
    if (rock.state === "UNAVAILABLE") {
      return NextResponse.json({ state: "UNAVAILABLE", reason: rock.reason }, { status: 503 });
    }
    if (rock.value.state !== "archived") {
      return NextResponse.json(
        { state: "UNAVAILABLE", reason: "This rock is not archived, so its tag is still bound" },
        { status: 409 },
      );
    }

    await db.delete(tagBindings).where(eq(tagBindings.rockId, id));
    logger.info("Released tag binding", { action: "TAG_BINDING_RELEASED", rockId: id });
    return NextResponse.json({ state: "REAL", released: true });
  }

  const uidHash = String(body.uidHash ?? "");
  if (!UID_HASH_PATTERN.test(uidHash)) {
    return NextResponse.json({ error: "uidHash must be a 32-byte hex string" }, { status: 400 });
  }

  const bound = await resolveRockForTag(uidHash as `0x${string}`);
  if (bound.state === "UNAVAILABLE") {
    return NextResponse.json({ state: "UNAVAILABLE", reason: bound.reason }, { status: 503 });
  }
  if (bound.value.rockId !== id) {
    return NextResponse.json(
      {
        state: "UNAVAILABLE",
        reason:
          bound.value.rockId === null
            ? "The registry does not bind this tag to any rock"
            : "The registry binds this tag to a different rock",
      },
      { status: 409 },
    );
  }

  try {
    await db
      .insert(tagBindings)
      .values({ uidHash: uidHash.toLowerCase(), rockId: id, updatedAt: Date.now() })
      .onConflictDoUpdate({
        target: tagBindings.uidHash,
        set: { rockId: id, updatedAt: Date.now() },
      });

    logger.info("Recorded tag binding", { action: "TAG_BINDING_RECORDED", rockId: id });
    return NextResponse.json({ state: "REAL", persisted: true });
  } catch (error) {
    logger.error("Failed to record tag binding", error, { rockId: id });
    return NextResponse.json(
      { state: "UNAVAILABLE", reason: "The tag binding could not be stored" },
      { status: 503 },
    );
  }
}
