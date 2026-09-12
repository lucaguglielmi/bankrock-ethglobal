/**
 * POST /api/rocks/[id]/vanity — claim a rock's vanity name (S-7).
 *
 * "Claim your vanity URL" used to be an 800 ms `setTimeout` that saved nothing and then showed a
 * success state. This writes to D1 and is Privy-authenticated; with no database it answers 503
 * UNAVAILABLE, and it never reports success for a request that was not persisted.
 *
 * Ownership: the first authenticated caller to claim a rock's vanity name owns it, and later
 * writes must come from the same Privy DID. Registry-based ownership replaces this in Phase 2,
 * when a rock has an on-chain owner to check against.
 */

import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";
import { requirePrivyIdentity } from "@/lib/auth/privy";
import { getDb, NO_DATABASE_REASON } from "@/lib/db";
import { rocks } from "@/lib/db/schema";
import { requireIpRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/telemetry";

const VANITY_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const auth = await requirePrivyIdentity(req);
  if (!auth.ok) return auth.response;

  const limit = await requireIpRateLimit(req, "vanity", 20, 60 * 60 * 1000);
  if (!limit.ok) {
    // Fail closed: this route claims a name on the caller's behalf (audit P-11).
    return NextResponse.json(
      limit.status === 503
        ? { state: "UNAVAILABLE", reason: limit.reason }
        : { error: limit.reason },
      { status: limit.status },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    vanityName?: string;
    socialHandle?: string;
    socialPlatform?: string;
  };

  const vanityName = String(body.vanityName ?? "").trim().toLowerCase();
  if (!VANITY_REGEX.test(vanityName)) {
    return NextResponse.json(
      {
        error:
          "A vanity name must be 3–32 characters of lowercase letters, digits and hyphens, and may not start or end with a hyphen.",
      },
      { status: 400 },
    );
  }

  const socialHandle = body.socialHandle ? String(body.socialHandle).trim().slice(0, 64) : null;
  const socialPlatform = body.socialPlatform
    ? String(body.socialPlatform).trim().slice(0, 32)
    : null;

  const db = getDb();
  if (!db) {
    return NextResponse.json({ state: "UNAVAILABLE", reason: NO_DATABASE_REASON }, { status: 503 });
  }

  try {
    const existingRock = await db.select().from(rocks).where(eq(rocks.id, id)).get();
    if (existingRock?.ownerAddress && existingRock.ownerAddress !== auth.identity.did) {
      return NextResponse.json(
        { state: "UNAVAILABLE", reason: "This rock is claimed by another account" },
        { status: 403 },
      );
    }

    const taken = await db
      .select({ id: rocks.id })
      .from(rocks)
      .where(and(eq(rocks.vanityName, vanityName), ne(rocks.id, id)))
      .get();
    if (taken) {
      return NextResponse.json({ error: "That vanity name is already taken." }, { status: 409 });
    }

    await db
      .insert(rocks)
      .values({
        id,
        ownerAddress: auth.identity.did,
        vanityName,
        socialHandle,
        socialPlatform,
        createdAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: rocks.id,
        set: { ownerAddress: auth.identity.did, vanityName, socialHandle, socialPlatform },
      });

    logger.info("Vanity name claimed", { action: "VANITY_CLAIMED", rockId: id, vanityName });

    return NextResponse.json({ state: "REAL", rockId: id, vanityName, persisted: true });
  } catch (error) {
    logger.error("Failed to persist vanity name", error, { rockId: id });
    return NextResponse.json(
      {
        state: "UNAVAILABLE",
        reason: "The vanity name could not be written to the application database",
      },
      { status: 503 },
    );
  }
}

/** GET returns the stored vanity name for a rock, or an honest empty answer. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  if (!db) {
    return NextResponse.json({ state: "UNAVAILABLE", reason: NO_DATABASE_REASON, rockId: id });
  }
  const row = await db.select().from(rocks).where(eq(rocks.id, id)).get();
  return NextResponse.json({
    state: "REAL",
    rockId: id,
    vanityName: row?.vanityName ?? null,
    socialHandle: row?.socialHandle ?? null,
    socialPlatform: row?.socialPlatform ?? null,
  });
}
