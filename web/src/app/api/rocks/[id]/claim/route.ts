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
 * by a real tap with a counter the tag has never used before.
 *
 * What the perimeter audit added on top of that (P-1), because a valid attestation is a bearer
 * token for its ten-minute TTL and every acceptance spends real gas:
 *
 *   1. the registry is read *before* broadcasting — the rock must have an unexpired handover, and
 *      a named recipient must be the attestation's subject. Previously the registry was the only
 *      thing that decided, after the gas had already been committed;
 *   2. three claims per rock per hour, alongside the per-IP limit, both fail-closed: a limiter
 *      that cannot count is not a limit on a route that spends money;
 *   3. a daily spend cap, reserved before the send and enforced in one atomic statement. Unset
 *      means relaying is off, not uncapped.
 *
 * And P-2: no failure reason here is built from an exception. viem puts the RPC URL — which
 * carries the provider's API key — into its error text, and this endpoint is unauthenticated.
 * Reasons come from a fixed set; the detail goes to telemetry, which redacts before it buffers.
 */

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { pendingUserOps } from "@/lib/db/schema";
import { real, unavailable, type Capability } from "@/lib/demo";
import { requireIpRateLimit, requireRateLimit } from "@/lib/rate-limit";
import {
  isSignedAttestation,
  parseRockId,
  readRock,
  type SignedAttestation,
} from "@/lib/rock-account";
import {
  RELAYED_CLAIM_COST_ESTIMATE_WEI,
  relayerAccount,
  releaseRelayerSpend,
  reserveRelayerSpend,
  submitClaimHandover,
  submitSignedUserOp,
  verifyAttestation,
  type SerializedUserOperation,
} from "@/lib/rock-account.server";
import { logger } from "@/lib/telemetry";

/** Three relayed claims per rock per hour. A genuine claim happens once. */
const CLAIMS_PER_ROCK = 3;
const CLAIM_WINDOW_MS = 60 * 60 * 1000;

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

  // Both limits fail closed (audit P-11): this route spends gas, so "the ledger is unreachable"
  // must not mean "unlimited".
  const ipLimit = await requireIpRateLimit(req, "claim", 20, CLAIM_WINDOW_MS);
  if (!ipLimit.ok) return limitResponse(ipLimit);

  const rockLimit = await requireRateLimit(`claim-rock:${id}`, CLAIMS_PER_ROCK, CLAIM_WINDOW_MS);
  if (!rockLimit.ok) return limitResponse(rockLimit);

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

  // The registry decides whether this claim can succeed — ask it before paying for the attempt.
  const claimable = await isClaimable(id, verified.value.subject);
  if (claimable.state === "UNAVAILABLE") {
    logger.warn("Refused a relayed claim that the registry would reject", {
      action: "HANDOVER_CLAIM_NOT_CLAIMABLE",
      rockId: id,
      reason: claimable.reason,
    });
    return NextResponse.json({ state: "UNAVAILABLE", reason: claimable.reason }, { status: 409 });
  }

  // Reserve the cost before broadcasting. Unset cap means relaying is off (audit P-1).
  const reservation = await reserveRelayerSpend(RELAYED_CLAIM_COST_ESTIMATE_WEI);
  if (reservation.state === "UNAVAILABLE") {
    return NextResponse.json(
      { state: "UNAVAILABLE", reason: reservation.reason },
      { status: 503 },
    );
  }

  const claim = await submitClaimHandover(id, attestation);
  if (claim.state !== "REAL") {
    // Nothing was broadcast, so nothing was spent.
    await releaseRelayerSpend(reservation.value.day, reservation.value.reservedWei);
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

function limitResponse(limit: { status?: 429 | 503; reason?: string }) {
  return NextResponse.json(
    limit.status === 503
      ? { state: "UNAVAILABLE", reason: limit.reason }
      : { error: limit.reason ?? "Too Many Requests" },
    { status: limit.status ?? 429 },
  );
}

/**
 * Whether the registry would accept this claim.
 *
 * Three ways it would not, each of which would burn gas on a reverting transaction: the rock has
 * no outstanding handover, the handover has expired, or it names someone other than the tap's
 * subject. The reasons are written here, never derived from an exception (audit P-2).
 */
async function isClaimable(rockId: string, subject: string): Promise<Capability<true>> {
  const rock = await readRock(rockId);
  if (rock.state === "UNAVAILABLE") {
    return unavailable("The registry could not be read, so this claim was not attempted");
  }

  const handover = rock.value.handover;
  if (rock.value.state !== "handover_pending" || !handover) {
    return unavailable("This rock has no gift waiting to be claimed");
  }
  if (handover.expiresAt * 1000 <= Date.now()) {
    return unavailable("This gift has expired");
  }
  if (handover.recipient && handover.recipient.toLowerCase() !== subject.toLowerCase()) {
    return unavailable("This gift was offered to a different wallet");
  }

  return real(true);
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
