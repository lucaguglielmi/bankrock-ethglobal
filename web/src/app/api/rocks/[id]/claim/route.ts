/**
 * POST /api/rocks/[id]/claim - complete a gift handover on behalf of the recipient (Flow E).
 *
 * The recipient has just tapped a rock they have never owned. Their wallet is new and holds no
 * gas; the Rock Account's Safe is still owned by the giver, so it cannot sponsor the claim
 * either. The server relays `claimHandover` from an operator key.
 *
 * Why this is not an open relay: the registry credits `att.subject`, and `att.subject` is inside
 * the signed attestation. The relayer cannot redirect the rock to itself, and this route refuses
 * any attestation that is not signed by this deployment's attester - which is only ever produced
 * by a real tap with a counter the tag has never used before.
 *
 * What the perimeter audit added on top of that (P-1), because a valid attestation is a bearer
 * token for its ten-minute TTL and every acceptance spends real gas:
 *
 *   1. the registry is read *before* broadcasting - the rock must have an unexpired handover, and
 *      a named recipient must be the attestation's subject. Previously the registry was the only
 *      thing that decided, after the gas had already been committed;
 *   2. three claims per rock per hour, alongside the per-IP limit, both fail-closed: a limiter
 *      that cannot count is not a limit on a route that spends money;
 *   3. a daily spend cap, reserved before the send and enforced in one atomic statement. Unset
 *      means relaying is off, not uncapped.
 *
 * And P-2: no failure reason here is built from an exception. viem puts the RPC URL - which
 * carries the provider's API key - into its error text, and this endpoint is unauthenticated.
 * Reasons come from a fixed set; the detail goes to telemetry, which redacts before it buffers.
 *
 * ## Ordering, after contract review N-1
 *
 * The re-review found that a giver who still controls the Rock Account's Safe can add the
 * recipient as a signer for one batched transaction, use the registry as its controller, and
 * remove them again - archiving or re-gifting the rock the recipient just received. The Safe's
 * owner set is writable by the Safe, so "ask the account who its owners are" is a question the
 * giver answers. The scope is the open-gift path, and the named-gift path *when the pre-signed
 * owner swap does not land*.
 *
 * So this route closes both halves off chain:
 *
 *   1. **open gifts are refused.** Nobody's address is known at the time they are opened, so no
 *      owner swap can be pre-signed for them, and the registry claim would hand over a rock whose
 *      account still belongs to the giver;
 *   2. **the Safe moves first.** The pre-signed owner swap is submitted and its receipt checked
 *      *before* `claimHandover` is broadcast. If it does not land, nothing is claimed and the cap
 *      reservation is released - the recipient is left exactly where they started rather than
 *      owning a rock whose account is someone else's.
 *
 * ## What "claimed" means (defect B4)
 *
 * Both halves are judged by a receipt, never by acceptance. `submitClaimHandover` waits for
 * `claimHandover` to be mined and reports `status: "success"` or nothing, because the recipient
 * reads this answer as "This rock is yours" - and a transaction the node accepted can still revert
 * (`AttestationExpired` behind a slow mempool, `AccountDoesNotAnswerToOwner`, `HandoverExpired`),
 * leaving the giver owning the rock. A failure after the broadcast keeps its spend reservation:
 * the gas is gone whether or not the claim landed.
 *
 * `claimHandover` rebinds `rock.smartAccount` to `att.smartAccount`, and for a named gift the
 * verifier signs the rock's existing account - which, after step 2, is the claimant's. This route
 * checks that the attestation names that same account before it does anything at all.
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

/**
 * How much life an attestation must have left before this route will start (review N-6).
 *
 * The first half of the sequence is irreversible: once the Safe owner swap lands, the account is
 * the claimant's whether or not the registry claim follows. A claimant who posts at
 * deadline-minus-seconds passes every pre-check, the swap lands during up to fifteen seconds of
 * receipt polling, and `claimHandover` is then mined past `att.deadline` and reverts
 * `AttestationExpired` - leaving the giver owning the rock and the recipient owning the Safe that
 * holds its money. Ninety seconds covers the poll window and a block or two of inclusion delay.
 *
 * Refusing costs the claimant one more tap. The failure it prevents costs someone their rock.
 */
const MIN_ATTESTATION_LIFETIME_MS = 90 * 1000;

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

  // Enough lifetime left to finish both halves (review N-6). Checked before the reservation and
  // long before the swap, so a refusal here changes nothing at all.
  const remainingMs = attestation.message.deadline * 1000 - Date.now();
  if (remainingMs < MIN_ATTESTATION_LIFETIME_MS) {
    logger.warn("Refused a claim whose attestation was about to expire", {
      action: "HANDOVER_CLAIM_TOO_CLOSE_TO_EXPIRY",
      rockId: id,
      remainingMs,
    });
    return NextResponse.json(
      { state: "UNAVAILABLE", reason: "attestation too close to expiry; tap again" },
      { status: 409 },
    );
  }

  // The registry decides whether this claim can succeed - ask it before paying for the attempt.
  const claimable = await isClaimable(id, verified.value.subject, attestation);
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

  // The Rock Account moves before the rock does (review N-1). A claim whose owner swap did not
  // land would leave the recipient owning a rock whose account is still the giver's - which is
  // exactly the authority the review found a giver can use to archive or re-gift it.
  const ownerSwap = await submitOwnerSwap(id, verified.value.subject);
  if (ownerSwap.state === "UNAVAILABLE") {
    await releaseRelayerSpend(reservation.value.day, reservation.value.reservedWei);
    logger.warn("Refused a claim whose Rock Account hand-over did not land", {
      action: "HANDOVER_CLAIM_SWAP_FAILED",
      rockId: id,
      reason: ownerSwap.reason,
    });
    return NextResponse.json(
      {
        state: "UNAVAILABLE",
        reason: `The Rock Account was not handed over, so the rock was not claimed: ${ownerSwap.reason}`,
        rockAccountHandover: { state: "UNAVAILABLE", reason: ownerSwap.reason },
      },
      { status: 503 },
    );
  }

  // Only a mined, successful `claimHandover` is a claim. `submitClaimHandover` waits for the
  // receipt, so a revert and a transaction that never mined both arrive here as failures - and
  // both of those have already spent the relayer's gas, which is why the reservation is released
  // only when nothing was broadcast at all.
  const claim = await submitClaimHandover(id, attestation);
  if (claim.state !== "REAL") {
    if (claim.broadcast === null) {
      await releaseRelayerSpend(reservation.value.day, reservation.value.reservedWei);
    }
    logger.warn("A relayed claim did not land", {
      action: "HANDOVER_CLAIM_NOT_LANDED",
      rockId: id,
      reason: claim.reason,
      broadcast: claim.broadcast !== null,
    });
    return NextResponse.json(
      {
        state: "UNAVAILABLE",
        reason: claim.reason,
        // The owner swap did land, and saying so is the honest report: the account is the
        // claimant's, the registry record is not.
        rockAccountHandover: { state: "REAL", txHash: ownerSwap.value.txHash },
        ...(claim.broadcast ? { claimTxHash: claim.broadcast.txHash } : {}),
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    state: "REAL",
    txHash: claim.value.txHash,
    rockAccountHandover: { state: "REAL", txHash: ownerSwap.value.txHash },
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
 * Whether the registry would accept this claim, and whether the app is willing to relay it.
 *
 * Five ways it is not, each of which would otherwise burn gas on a reverting transaction or hand
 * over a rock whose account stays behind:
 *
 *  - the rock has no outstanding handover, or it has expired;
 *  - the gift is **open** (`recipient == address(0)`). The app no longer supports those: a
 *    recipient who is unknown when the gift is opened cannot have an owner swap pre-signed for
 *    them, and a claim without one leaves the Safe with the giver (review N-1);
 *  - the gift names someone other than the tap's subject;
 *  - the attestation names a different Rock Account than the registry holds. `claimHandover`
 *    rebinds `rock.smartAccount` to `att.smartAccount`, so a mismatch would rebind the rock to an
 *    account nobody checked.
 *
 * Every reason is written here, never derived from an exception (audit P-2).
 */
async function isClaimable(
  rockId: string,
  subject: string,
  attestation: SignedAttestation,
): Promise<Capability<true>> {
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
  if (!handover.recipient) {
    return unavailable("open gifts are not supported by the app");
  }
  if (handover.recipient.toLowerCase() !== subject.toLowerCase()) {
    return unavailable("This gift was offered to a different wallet");
  }
  if (
    attestation.message.smartAccount.toLowerCase() !== rock.value.smartAccount.toLowerCase()
  ) {
    return unavailable("This tap names a different Rock Account than the registry holds");
  }

  return real(true);
}

/**
 * Submits the giver's pre-signed Safe owner swap, if there is one for this recipient.
 *
 * TEMPORARY - TO BE FIXED BEFORE MAINNET (security review 2026-09-13, R-4). A landed swap plus
 * the registry's `isOwner(recipient)` check proves the recipient is *a* signer, not the *only*
 * one: a giver who added a second signer or a module before gifting keeps control of the account
 * after the claim. Before mainnet, read `getOwners`, `getThreshold`, `getModulesPaginated` and
 * `getGuard` here after the receipt and refuse the claim unless the owners are exactly the
 * recipient, the threshold is 1, and there are no modules and no guard.
 *
 * The stored operation names its recipient. If the rock was given openly - "whoever taps it" -
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
      "no pre-signed Rock Account hand-over is stored for this rock - ask the giver to open the gift again",
    );
  }

  // Required, not optional (review N-1): a stored operation that names someone else would hand the
  // account to the wrong wallet, and one with no recipient at all cannot be checked.
  if (!row.recipient || row.recipient.toLowerCase() !== subject.toLowerCase()) {
    return unavailable("the stored Rock Account hand-over names a different recipient");
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
