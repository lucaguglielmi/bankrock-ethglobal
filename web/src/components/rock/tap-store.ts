/**
 * The one verified tap of this browsing session, kept in memory.
 *
 * Verifying a tap consumes its counter, so it can happen exactly once. When the verifier reports
 * that the tag actually belongs to a different rock than the URL claimed, the page navigates
 * there - and the result has to survive that navigation without the SDM parameters travelling in
 * the new URL, where they could be copied, shared or replayed.
 *
 * Module scope, not `sessionStorage`: this must die with the tab, never be readable later, and
 * never be writable by anything but the verifier's own answer.
 */

import type { TapAttestation } from "@/components/rock/use-tap-attestation";

export type CheckedTap = Extract<TapAttestation, { status: "checked" }>;

export interface RememberedTap {
  /** The rock the verifier resolved this tag to. */
  rockId: string;
  result: CheckedTap;
}

let remembered: RememberedTap | null = null;

export function rememberTap(tap: RememberedTap): void {
  remembered = tap;
}

/** The remembered verification for this rock, or null. Never returns another rock's tap. */
export function recallTap(rockId: string): CheckedTap | null {
  return remembered && remembered.rockId === rockId ? remembered.result : null;
}

/** Test seam. */
export function forgetTap(): void {
  remembered = null;
}
