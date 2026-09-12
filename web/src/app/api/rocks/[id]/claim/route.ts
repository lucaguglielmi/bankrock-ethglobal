/**
 * POST /api/rocks/[id]/claim — complete a gift handover on behalf of the recipient (Flow E).
 *
 * The recipient has just tapped a rock they have never owned. Their wallet is new and holds no
 * gas; the Rock Account's Safe is still owned by the giver, so it cannot sponsor the claim
 * either. The server relays `claimHandover` from an operator key.
 *
 * Why this is not an open relay: the registry credits `att.subject`, and `att.subject` is inside
 * the signed attestation. The relayer cannot redirect the rock to itself, and this route refuses
 * any attestation that is not signed by this deployment's attester — which is only ever produced
 * by a real tap with a counter the tag has never used before. There is nothing to gain by calling
 * it without one, and the rate limit bounds the cost of trying.
 *
 * After the registry claim, the pre-signed Safe owner swap (stored at `initiateHandover`) is
 * submitted so the Rock Account follows the object. If there is none — an open handover has no
 * recipient address to pre-sign for — the claim still succeeds and the response says plainly that
 * the account hand-over did not happen.
 */

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { pendingUserOps } from "@/lib/db/schema";
import { real, unavailable, type Capability } from "@/lib/demo";
import { consumeIpRateLimit } from "@/lib/rate-limit";
import { isSignedAttestation, parseRockId, type SignedAttestation } from "@/lib/rock-account";
import {
  relayerAccount,
  submitClaimHandover,
  submitSignedUserOp,
  verifyAttestation,
  type SerializedUserOperation,
} from "@/lib/rock-account.server";
import { logger } from "@/lib/telemetry";

/** Reports whether a claim could be relayed at all, without disclosing anything about the key. */
export async function GET() {
  const relayer = relayerAccount();
  return NextResponse.json(
    relayer.state === "UNAVAILABLE"
      ? { state: "UNAVAILABLE", reason: relayer.reason }
      : { state: "REAL" },
  );
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (parseRockId(id) === null) {
    return NextResponse.json({ error: "Invalid rock id" }, { status: 400 });
  }

  const limit = await consumeIpRateLimit(req, "claim", 20, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as { attestation?: unknown };
  if (!isSignedAttestation(body.attestation)) {
    return NextResponse.json(
      { state: "UNAVAILABLE", reason: "A signed attestation from a verified tap is required" },
      { status: 400 },
    );
  }
  const attestation = body.attestation as SignedAttestation;

  const verified = await verifyAttestation(attestation, id);
  if (verified.state === "UNAVAILABLE") {
    logger.warn("Rejected handover claim", {
      action: "HANDOVER_CLAIM_REJECTED",
      rockId: id,
      reason: verified.reason,
    });
    return NextResponse.json({ state: "UNAVAILABLE", reason: verified.reason }, { status: 401 });
  }

  const claim = await submitClaimHandover(id, attestation);
  if (claim.state !== "REAL") {
    return NextResponse.json(
      {
        state: "UNAVAILABLE",
        reason: claim.state === "UNAVAILABLE" ? claim.reason : "The claim was not broadcast",
      },
      { status: 503 },
    );
  }

  const ownerSwap = await submitOwnerSwap(id, verified.value.subject);

  return NextResponse.json({
    state: "REAL",
    txHash: claim.value.txHash,
    rockAccountHandover:
      ownerSwap.state === "UNAVAILABLE"
        ? { state: "UNAVAILABLE", reason: ownerSwap.reason }
        : { state: "REAL", txHash: ownerSwap.value.txHash },
  });
}

/**
 * Submits the giver's pre-signed Safe owner swap, if there is one for this recipient.
 *
 * The stored operation names its recipient. If the rock was given openly — "whoever taps it" —
 * there is no stored operation, because there was no address to sign for at the time, and this
 * returns UNAVAILABLE with that reason rather than silently doing nothing.
 */
async function submitOwnerSwap(
  rockId: string,
  subject: string,
): Promise<Capability<{ txHash: `0x${string}` }>> {
  const db = getDb();
  if (!db) {
    return unavailable("No database, so no pre-signed Rock Account hand-over was stored");
  }

  const row = await db
    .select()
    .from(pendingUserOps)
    .where(eq(pendingUserOps.rockId, rockId))
    .get();

  if (!row) {
    return unavailable(
      "The Rock Account hand-over requires a named recipient: this gift was open, so its Safe owner was not pre-signed",
    );
  }

  if (row.recipient && row.recipient.toLowerCase() !== subject.toLowerCase()) {
    return unavailable("The stored Rock Account hand-over names a different recipient");
  }

  const result = await submitSignedUserOp(row.userOp as unknown as SerializedUserOperation);

  if (result.state !== "UNAVAILABLE") {
    // One-shot: a submitted operation must not be replayable against the next handover.
    await db.delete(pendingUserOps).where(eq(pendingUserOps.rockId, rockId));
    logger.info("Rock Account owner swapped after claim", {
      action: "ROCK_ACCOUNT_OWNER_SWAPPED",
      rockId,
      txHash: result.value.txHash,
    });
    return real({ txHash: result.value.txHash });
  }

  return unavailable(result.reason);
}
