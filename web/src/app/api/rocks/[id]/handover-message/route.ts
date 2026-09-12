/**
 * The gift message that accompanies a handover (Flow E).
 *
 * Only `keccak256(message)` goes on chain — a gift note is not public record. The plaintext is
 * stored here so the recipient can read it after claiming.
 *
 * POST is self-verifying rather than ownership-checked: the message is accepted only if it hashes
 * to the `messageHash` the registry already holds for this rock's outstanding handover. The owner
 * committed to that hash on chain when they opened the gift, so the only message this route can
 * store is the one they wrote. A Privy token is still required, so it is not an anonymous write.
 *
 * GET requires a Privy token and returns the message for the rock's current handover hash. It is
 * deliberately not restricted to the recipient's own DID: Privy tokens carry a DID, not a wallet
 * address, so "is this the named recipient" is not a question this route can answer honestly. A
 * signed-in reader who already knows the rock id can read a gift note; nothing more sensitive
 * than that is stored here, and the alternative — pretending to check — would be worse.
 */

import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { requirePrivyIdentity } from "@/lib/auth/privy";
import { getDb, NO_DATABASE_REASON } from "@/lib/db";
import { handoverMessages } from "@/lib/db/schema";
import { consumeIpRateLimit } from "@/lib/rate-limit";
import { messageHashFor, parseRockId, readRock } from "@/lib/rock-account";
import { logger } from "@/lib/telemetry";

const MAX_MESSAGE_LENGTH = 2000;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (parseRockId(id) === null) {
    return NextResponse.json({ error: "Invalid rock id" }, { status: 400 });
  }

  const auth = await requirePrivyIdentity(req);
  if (!auth.ok) return auth.response;

  const limit = await consumeIpRateLimit(req, "handover-message", 30, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    message?: string;
    messageHash?: string;
  };
  const message = String(body.message ?? "").trim();

  if (message === "" || message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `A message of 1 to ${MAX_MESSAGE_LENGTH} characters is required.` },
      { status: 400 },
    );
  }

  const computed = messageHashFor(message);
  if (body.messageHash && body.messageHash.toLowerCase() !== computed.toLowerCase()) {
    return NextResponse.json(
      { error: "The message does not match the hash supplied with it." },
      { status: 400 },
    );
  }

  // The on-chain record decides which message is admissible.
  const rock = await readRock(id);
  if (rock.state === "UNAVAILABLE") {
    return NextResponse.json({ state: "UNAVAILABLE", reason: rock.reason }, { status: 503 });
  }
  const handover = rock.value.handover;
  if (!handover) {
    return NextResponse.json(
      { state: "UNAVAILABLE", reason: "This rock has no outstanding handover" },
      { status: 409 },
    );
  }
  if (handover.messageHash.toLowerCase() !== computed.toLowerCase()) {
    return NextResponse.json(
      {
        state: "UNAVAILABLE",
        reason: "This message is not the one committed on chain for this handover",
      },
      { status: 409 },
    );
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ state: "UNAVAILABLE", reason: NO_DATABASE_REASON }, { status: 503 });
  }

  try {
    await db
      .insert(handoverMessages)
      .values({
        id: `${id}:${computed}`,
        rockId: id,
        messageHash: computed,
        message,
        createdAt: Date.now(),
      })
      .onConflictDoNothing();

    logger.info("Stored handover message", { action: "HANDOVER_MESSAGE_STORED", rockId: id });
    return NextResponse.json({ state: "REAL", persisted: true, messageHash: computed });
  } catch (error) {
    logger.error("Failed to store handover message", error, { rockId: id });
    return NextResponse.json(
      { state: "UNAVAILABLE", reason: "The message could not be stored, so it was not saved." },
      { status: 503 },
    );
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (parseRockId(id) === null) {
    return NextResponse.json({ error: "Invalid rock id" }, { status: 400 });
  }

  const auth = await requirePrivyIdentity(req);
  if (!auth.ok) return auth.response;

  const db = getDb();
  if (!db) {
    return NextResponse.json({ state: "UNAVAILABLE", reason: NO_DATABASE_REASON }, { status: 503 });
  }

  const rock = await readRock(id);
  const handoverHash = rock.state === "REAL" ? rock.value.handover?.messageHash : undefined;

  const row = handoverHash
    ? await db
        .select()
        .from(handoverMessages)
        .where(
          and(eq(handoverMessages.rockId, id), eq(handoverMessages.messageHash, handoverHash)),
        )
        .get()
    : await db
        .select()
        .from(handoverMessages)
        .where(eq(handoverMessages.rockId, id))
        .orderBy(desc(handoverMessages.createdAt))
        .get();

  if (!row) {
    return NextResponse.json({ state: "REAL", message: null });
  }

  return NextResponse.json({
    state: "REAL",
    message: row.message,
    messageHash: row.messageHash,
    createdAt: new Date(row.createdAt).toISOString(),
  });
}
