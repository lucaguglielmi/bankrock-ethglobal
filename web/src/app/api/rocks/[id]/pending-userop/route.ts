/**
 * The pre-signed Safe owner swap for a handover (Flow E step 7).
 *
 * A gift moves two things: the object, in the registry, and control of the Rock Account, in the
 * Safe. The registry half is proven by the recipient's tap. The Safe half can only be authorised
 * by the Safe's current owner - the giver - who is not present when the recipient taps. So the
 * giver signs that one operation when they open the gift, and it waits here until the claim.
 *
 * What stops this being a way to plant an operation against someone else's Safe: the stored
 * operation's `sender` must be the Rock Account the registry reports for this rock, and the
 * bundler will only execute an operation the Safe's own owner signed. A stranger can neither
 * choose the sender nor produce the signature.
 *
 * It is one-shot and it is revocable: the claim route deletes it after submitting, and
 * `{ discard: true }` - sent when a handover is cancelled - deletes it too. A cancelled gift whose
 * owner-swap operation survived would be a live path to hand the account away.
 *
 * Revocable **by its creator only** (audit P-5). A Privy token proves *an account*, not *this
 * rock's owner*, and Privy sign-up is open - so checking merely that the caller is signed in let
 * any stranger discard or overwrite another rock's pre-signed hand-over, leaving the recipient
 * with the registry claim and no Rock Account. The DID that stored the row is kept with it, and
 * only that DID may replace or delete it. The claim route reads it without a DID, because by then
 * the attestation has already proved the claim.
 *
 * ## Why the operation is simulated before it is stored
 *
 * First-writer-wins plus "the sender is the rock's account" is not enough on its own, and the two
 * combine into a denial of service on the gift itself. Everything the route could check about a
 * submitted operation was public - the rock id is in the URL and the Rock Account is in the
 * registry - so any signed-in Privy account could store a row of nonsense against any rock, take
 * the row's creator DID, and lock the real giver out with the 403 above. The recipient would then
 * be handed a gift the claim route submits and fails on, with the one person who could repair it
 * refused every time they tried.
 *
 * So two things are checked before a row is written, and both are stated with their limits:
 *
 *   1. **the operation must be the hand-over it claims to be.** Its `callData` has to contain
 *      exactly `swapOwner(SENTINEL, <the rock's registered owner>, <the named recipient>)`, both
 *      addresses taken from the registry and the body the route already validates. A row that does
 *      not carry that call cannot become one by being stored;
 *   2. **the bundler must accept it.** `eth_estimateUserOperationGas` runs the operation's
 *      validation and execution without submitting or spending anything, so a malformed operation,
 *      a spent nonce, an account with no code and a paymaster that will not sponsor are all caught
 *      here rather than at the claim. Both ways of not getting an answer refuse (D-017): "the
 *      bundler said no" and "the bundler could not be asked" are reported with different words,
 *      and neither stores a row.
 *
 * **What this does not close:** ERC-4337 bundlers deliberately *skip signature validation* during
 * estimation, so a well-formed squatted operation carrying a forged signature still passes step 2.
 * It can no longer be an arbitrary operation - step 1 forces it to be this exact owner swap - but
 * the giver can still be locked out of their own row by a stranger who gets there first. Closing
 * that needs the caller's *wallet*, and a Privy token carries a DID, not an address. Recorded so
 * it is a known residual rather than an assumed fix.
 *
 * TEMPORARY - WILL BE FIXED BEFORE MAINNET (security review 2026-09-13, R-3). Because the row is
 * first-writer-wins on a Privy DID and nothing binds a DID to the rock's on-chain owner, any
 * signed-in account can pre-store a forged row for any rock and lock its real owner out of
 * gifting until the row is removed by hand. The fix is to prove the wallet before accepting a
 * write - a signature from `rock.owner` over (rockId, recipient, userOpHash), or Privy's
 * linked-wallet lookup - and to let the on-chain owner overwrite or discard regardless of
 * `creatorDid`. Left as is for the testnet demo.
 */

import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getAddress, isAddress } from "viem";
import { requirePrivyIdentity } from "@/lib/auth/privy";
import { getDb, NO_DATABASE_REASON } from "@/lib/db";
import { pendingUserOps } from "@/lib/db/schema";
import { consumeIpRateLimit } from "@/lib/rate-limit";
import { encodeSwapOwner, parseRockId, readRock } from "@/lib/rock-account";
import {
  simulateSignedUserOp,
  type SerializedUserOperation,
} from "@/lib/rock-account.server";
import { logger } from "@/lib/telemetry";

const KINDS = new Set(["swap_owner"]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (parseRockId(id) === null) {
    return NextResponse.json({ error: "Invalid rock id" }, { status: 400 });
  }

  const auth = await requirePrivyIdentity(req);
  if (!auth.ok) return auth.response;

  const limit = await consumeIpRateLimit(req, "pending-userop", 30, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ state: "UNAVAILABLE", reason: NO_DATABASE_REASON }, { status: 503 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    discard?: boolean;
    kind?: string;
    recipient?: string;
    userOp?: Record<string, string>;
  };

  const existing = await db
    .select()
    .from(pendingUserOps)
    .where(eq(pendingUserOps.rockId, id))
    .get();

  // A row with no creator predates this column; treat it as unowned and let the first writer
  // claim it, rather than stranding it forever.
  if (existing?.creatorDid && existing.creatorDid !== auth.identity.did) {
    return NextResponse.json(
      {
        state: "UNAVAILABLE",
        reason: "This rock's pending hand-over was stored by another account",
      },
      { status: 403 },
    );
  }

  if (body.discard) {
    await db.delete(pendingUserOps).where(eq(pendingUserOps.rockId, id));
    logger.info("Discarded pending Rock Account hand-over", {
      action: "PENDING_USEROP_DISCARDED",
      rockId: id,
    });
    return NextResponse.json({ state: "REAL", discarded: true });
  }

  const kind = String(body.kind ?? "");
  if (!KINDS.has(kind)) {
    return NextResponse.json({ error: 'kind must be "swap_owner"' }, { status: 400 });
  }

  const userOp = body.userOp;
  if (
    !userOp ||
    typeof userOp !== "object" ||
    typeof userOp.sender !== "string" ||
    typeof userOp.signature !== "string"
  ) {
    return NextResponse.json(
      { error: "userOp must be a signed operation with a sender" },
      { status: 400 },
    );
  }

  const recipient = typeof body.recipient === "string" ? body.recipient : null;
  if (!recipient || !/^0x[0-9a-fA-F]{40}$/.test(recipient)) {
    return NextResponse.json(
      { error: "A named recipient is required to pre-sign the Rock Account hand-over" },
      { status: 400 },
    );
  }

  // The registry decides which Safe belongs to this rock; the client does not.
  const rock = await readRock(id);
  if (rock.state === "UNAVAILABLE") {
    return NextResponse.json({ state: "UNAVAILABLE", reason: rock.reason }, { status: 503 });
  }
  if (userOp.sender.toLowerCase() !== rock.value.smartAccount.toLowerCase()) {
    return NextResponse.json(
      {
        state: "UNAVAILABLE",
        reason: "The operation's sender is not this rock's Rock Account",
      },
      { status: 409 },
    );
  }

  // The operation must carry the one call this row is for. Both addresses come from the registry
  // and from the body already checked above, never from the operation itself.
  //
  // TEMPORARY - TO BE FIXED BEFORE MAINNET (security review 2026-09-13, R-4 and R-13): this is
  // a substring match, so a batch that carries extra calls alongside the swap passes, and the
  // operation is signed without a `validUntil`. Before mainnet, decode
  // `executeUserOp(to, value, data, operation)` and require an exact `swapOwner` payload, and
  // sign with `validUntil` set to the gift's expiry.
  if (!isAddress(rock.value.owner, { strict: false })) {
    return NextResponse.json(
      { state: "UNAVAILABLE", reason: "This rock has no readable owner to hand over from" },
      { status: 409 },
    );
  }
  const expectedSwap = encodeSwapOwner(getAddress(rock.value.owner), getAddress(recipient))
    .slice(2)
    .toLowerCase();
  const callData = typeof userOp.callData === "string" ? userOp.callData.toLowerCase() : "";
  if (!callData.includes(expectedSwap)) {
    logger.warn("Refused a pre-signed hand-over that is not this rock's owner swap", {
      action: "PENDING_USEROP_WRONG_CALL",
      rockId: id,
    });
    return NextResponse.json(
      {
        state: "UNAVAILABLE",
        reason:
          "The operation does not hand this rock's account to the named recipient, so it was not stored",
      },
      { status: 409 },
    );
  }

  // The bundler is asked next: it is the only party that can run the operation.
  const validated = await simulateSignedUserOp(userOp as unknown as SerializedUserOperation);
  if (validated.state === "UNAVAILABLE") {
    logger.warn("Refused a pre-signed hand-over the bundler would not accept", {
      action: "PENDING_USEROP_REFUSED",
      rockId: id,
      reason: validated.reason,
    });
    return NextResponse.json(
      {
        state: "UNAVAILABLE",
        reason: `The pre-signed Rock Account hand-over was not stored: ${validated.reason}`,
      },
      { status: 409 },
    );
  }

  try {
    await db
      .insert(pendingUserOps)
      .values({
        rockId: id,
        kind,
        creatorDid: auth.identity.did,
        recipient,
        userOp,
        createdAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: pendingUserOps.rockId,
        set: {
          kind,
          creatorDid: auth.identity.did,
          recipient,
          userOp,
          createdAt: Date.now(),
        },
      });

    logger.info("Stored pre-signed Rock Account hand-over", {
      action: "PENDING_USEROP_STORED",
      rockId: id,
    });
    return NextResponse.json({ state: "REAL", persisted: true });
  } catch (error) {
    logger.error("Failed to store pre-signed hand-over", error, { rockId: id });
    return NextResponse.json(
      {
        state: "UNAVAILABLE",
        reason: "The pre-signed Rock Account hand-over could not be stored",
      },
      { status: 503 },
    );
  }
}

/** Whether a hand-over is waiting, for the giver's own confirmation UI. No operation is returned. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requirePrivyIdentity(req);
  if (!auth.ok) return auth.response;

  const db = getDb();
  if (!db) {
    return NextResponse.json({ state: "UNAVAILABLE", reason: NO_DATABASE_REASON }, { status: 503 });
  }

  const row = await db
    .select({
      kind: pendingUserOps.kind,
      recipient: pendingUserOps.recipient,
      creatorDid: pendingUserOps.creatorDid,
    })
    .from(pendingUserOps)
    .where(eq(pendingUserOps.rockId, id))
    .get();

  // Only the creator sees the recipient it names; anyone else learns whether one exists and
  // nothing more (audit P-5).
  const isCreator = Boolean(row?.creatorDid && row.creatorDid === auth.identity.did);

  return NextResponse.json({
    state: "REAL",
    pending: row
      ? { kind: row.kind, recipient: isCreator ? row.recipient : null, mine: isCreator }
      : null,
  });
}
