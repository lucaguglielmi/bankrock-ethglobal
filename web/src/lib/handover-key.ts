/**
 * The hand-over key: the Safe owner swap a giver pre-signs, and whether the server really has it
 * (Flow E step 3, D-027, D-032).
 *
 * A gift is two halves. `initiateHandover` puts the object's half on chain, and that receipt is
 * the one the giver's sheet used to celebrate with. The other half is a UserOperation that swaps
 * the Rock Account's Safe owner to the recipient, which **only the giver can sign** and only while
 * they are still the Safe's owner - so it is signed at the same moment and stored server-side
 * until the claim.
 *
 * If that store did not happen, the claim route refuses the gift **forever**:
 * `"no pre-signed Rock Account hand-over is stored for this rock"`
 * (`app/api/rocks/[id]/claim/route.ts`). The gift is on chain and unclaimable, and the only person
 * who can repair it is the giver - who has by then been told the gift is waiting and has walked
 * away. So "the gift is waiting" must mean the server has confirmed the key, and nothing less.
 *
 * This module is the pure half of that confirmation: it turns `GET /api/rocks/[id]/pending-userop`
 * into the one of three states spec 15 Part 3 allows, with a reason a giver can act on. It is
 * deliberately free of React, Privy and viem so the rule can be tested as a rule.
 */

import { real, unavailable, type Capability } from "@/lib/demo";

/** REAL only when the server has the giver's own signed owner swap for this rock. */
export type HandoverKeyResult = Capability<{ confirmed: true }>;

/** The gift is on chain; the key that moves the account with it is not stored. */
export const NO_HANDOVER_KEY_REASON =
  "The gift is on chain, but the key that hands over its account was not stored - a claim would be refused until it is signed again";

/** A row exists, but it belongs to another account, so it is not this giver's to rely on. */
export const FOREIGN_HANDOVER_KEY_REASON =
  "Another account's hand-over key is stored for this rock, so this gift cannot rely on it";

/** The confirmation itself could not be made - which is not the same as "there is none". */
export const UNCONFIRMED_HANDOVER_KEY_REASON =
  "The hand-over key could not be confirmed, so the gift is not proven claimable";

/** An open gift cannot have one at all: there is no address to sign for (D-032). */
export const OPEN_GIFT_HAS_NO_KEY_REASON =
  "An open gift has no named recipient, so no hand-over key can be signed for it";

/** The shape `GET /api/rocks/[id]/pending-userop` answers with. Nothing is trusted about it. */
export interface PendingUserOpBody {
  state?: unknown;
  reason?: unknown;
  pending?: unknown;
}

/**
 * Whether the server holds *this giver's* pre-signed owner swap.
 *
 * Three things must all be true, and each failure says which one was not:
 *
 *  - the read succeeded (`ok`, `state: "REAL"`) - a 503 is "we do not know", not "there is none";
 *  - a row exists and it is a `swap_owner` operation;
 *  - it is **mine**. The route reports `mine` by comparing the row's creator DID to the caller's,
 *    and a row somebody else wrote is one this gift must not count on: only its creator can
 *    replace it, so the giver could not repair it even if they tried.
 */
export function handoverKeyFromPendingResponse(
  ok: boolean,
  body: PendingUserOpBody | null | undefined,
): HandoverKeyResult {
  const reason = typeof body?.reason === "string" ? body.reason : null;

  if (!ok || body?.state !== "REAL") {
    return unavailable(reason ?? UNCONFIRMED_HANDOVER_KEY_REASON);
  }

  const pending = body.pending;
  if (!pending || typeof pending !== "object") {
    return unavailable(NO_HANDOVER_KEY_REASON);
  }

  const { kind, mine } = pending as { kind?: unknown; mine?: unknown };
  if (kind !== "swap_owner") {
    return unavailable(NO_HANDOVER_KEY_REASON);
  }
  if (mine !== true) {
    return unavailable(FOREIGN_HANDOVER_KEY_REASON);
  }

  return real({ confirmed: true });
}
