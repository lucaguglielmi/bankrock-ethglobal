/**
 * When the page is allowed to spend a tap (spec 02 Flow B and Flow E, D-018).
 *
 * Verifying a tap consumes its counter: the verifier advances the tag's read counter in durable
 * storage and the same URL can never be verified again. So the page gets exactly one chance to ask
 * the question, and the answer is only worth having if it is signed for the wallet that is about
 * to act - `subject` is inside the EIP-712 attestation, and the registry credits *that* address.
 *
 * Two of the five rock states need a subject:
 *
 *  - **dormant**: `awakenRock` needs an attestation naming the awakener;
 *  - **handover_pending**: `claimHandover` needs one naming the claimant.
 *
 * With nobody signed in, the verifier has no subject to name. It still advances the counter and
 * then reports the attestation `UNAVAILABLE` with `missing_subject` (`lib/nfc/verify.ts`), which
 * is the tap spent for nothing: the visitor signs in and is told to tap again. Spec 08's gift beat
 * is one tap - "the recipient taps it, signs in on a fresh account with no ETH, and the claim is
 * relayed" - so the tap is **held** until sign-in and spent once, afterwards.
 *
 * Everywhere else - an awake rock, an archived one, a rock the registry could not be read for -
 * the tap answers a question that needs no subject ("is this object real?"), so it is spent as
 * soon as the rock's state is known.
 *
 * This rule is a pure function because it decides something irreversible, and because a component
 * test cannot state the case that matters: a signed-out visitor on a `handover_pending` rock.
 */

/**
 * `wait`   - not enough is known yet to spend the tap.
 * `hold`   - deliberately not verified: sign-in must come first.
 * `verify` - run the single verification now.
 */
export type TapGate = "wait" | "hold" | "verify";

export interface TapGateInput {
  /** Whether the auth provider has resolved. Before that, "signed out" is not yet a fact. */
  ready: boolean;
  /** Whether the rock read has produced a record, or has finished without one. */
  rockResolved: boolean;
  /** The rock's state, when it is known. */
  state?: string;
  authenticated: boolean;
}

/**
 * The rock states whose tap is worthless without a signed-in wallet to name in the attestation.
 *
 * Keyed off the state rather than off a component, so a new state that needs a subject is a
 * one-line change here and not a bug discovered at a demo.
 */
const NEEDS_SUBJECT = new Set(["dormant", "handover_pending"]);

/** True when verifying now would produce an attestation nobody can use. */
export function tapNeedsSubject(state: string | undefined): boolean {
  return state !== undefined && NEEDS_SUBJECT.has(state);
}

export function tapGateFor(input: TapGateInput): TapGate {
  if (!input.ready || !input.rockResolved) return "wait";
  if (!input.authenticated && tapNeedsSubject(input.state)) return "hold";
  return "verify";
}
