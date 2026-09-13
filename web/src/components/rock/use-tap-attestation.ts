"use client";

/**
 * The NFC tap, verified server-side exactly once per page load (spec 15 D-018, F-1, F-7).
 *
 * Nothing in this file - and nothing that consumes it - can set `verified`. The only producer is
 * `verifyNtagSignature`, which runs on the server and returns true only after a real CMAC match
 * and a monotonic counter advance. The demo switcher cannot reach this state at all.
 *
 * Verifying a tap *consumes its counter*, so the call may happen only once and it must happen at
 * the moment its result is most useful:
 *
 *  - on a **dormant** rock or a rock **waiting to be claimed**, opened by a signed-out visitor,
 *    the call is **held**. Awakening and claiming both need an attestation bound to the visitor's
 *    wallet, and only the same single verification can produce one - so the page says "tap
 *    detected, sign in first" and runs the one verification after sign-in, with `subject` known;
 *  - everywhere else (an awake rock, an archived one, a signed-in visitor) it runs as soon as the
 *    rock's state and the signed-in wallet are known.
 *
 * `tap-gate.ts` decides which of those it is, and says why.
 *
 * The verifier also says which rock the tag really belongs to (`effectiveRockId`) and how it
 * decided (`resolution`). When that differs from the URL the page navigates there, and the answer
 * is recalled from `tap-store` on the other side rather than asked for again.
 */

import { useEffect, useRef, useState } from "react";
import { verifyNtagSignature } from "@/actions/verify-ntag";
import type { AttestationResult } from "@/lib/nfc/attestation";
import { sameAddress } from "@/components/rock/util";
import { recallTap, rememberTap } from "@/components/rock/tap-store";
import type { TapGate } from "@/components/rock/tap-gate";

export interface TapParams {
  e?: string;
  c?: string;
  enc?: string;
}

/**
 * How the verifier decided which rock this tag belongs to:
 * `bound` - the tag is bound to a rock on-chain; `url` - the id in the URL was used;
 * `next_free` - the bound rock was retired, so a fresh id was allocated;
 * `registry_unavailable` - the registry could not be read.
 */
export type TapResolution = "bound" | "url" | "next_free" | "registry_unavailable";

/** The gate itself lives in `tap-gate.ts`, which is pure and unit-tested. */
export type { TapGate, TapGateInput } from "@/components/rock/tap-gate";
export { tapGateFor, tapNeedsSubject } from "@/components/rock/tap-gate";

export type TapAttestation =
  /** The page was opened without tap parameters - a link, a bookmark, a share. */
  | { status: "absent" }
  | { status: "waiting" }
  | { status: "held" }
  | { status: "checking" }
  | {
      status: "checked";
      verified: boolean;
      reason?: string;
      message?: string;
      attestation?: AttestationResult;
      counter?: number;
      /** The rock this tag actually belongs to, per the registry. */
      effectiveRockId?: string;
      resolution?: TapResolution;
    };

export interface UseTapAttestationInput {
  rockId: string;
  params: TapParams;
  /** The signed-in wallet, bound into the attestation. Absent until sign-in resolves. */
  subject?: string;
  gate: TapGate;
}

const RESOLUTIONS: TapResolution[] = ["bound", "url", "next_free", "registry_unavailable"];

/**
 * Reads the rock resolution off the verifier's answer.
 *
 * Deliberately defensive: these two fields decide whether the page navigates, and navigating on a
 * malformed value would be worse than staying put.
 */
function readResolution(verification: unknown): {
  effectiveRockId?: string;
  resolution?: TapResolution;
} {
  const value = verification as { effectiveRockId?: unknown; resolution?: unknown };
  const effectiveRockId =
    typeof value.effectiveRockId === "string" && /^\d+$/.test(value.effectiveRockId)
      ? value.effectiveRockId
      : undefined;
  const resolution = RESOLUTIONS.find((candidate) => candidate === value.resolution);
  return { effectiveRockId, resolution };
}

export function useTapAttestation({
  rockId,
  params,
  subject,
  gate,
}: UseTapAttestationInput): TapAttestation {
  const hasTap = Boolean(params.e && params.c);
  const [result, setResult] = useState<Extract<TapAttestation, { status: "checked" }> | null>(() =>
    recallTap(rockId),
  );
  const started = useRef(false);

  useEffect(() => {
    if (!hasTap || gate !== "verify" || started.current) return;
    started.current = true;

    let cancelled = false;
    verifyNtagSignature({
      rockId,
      e: params.e,
      c: params.c,
      enc: params.enc,
      subject,
    })
      .then((verification) => {
        if (cancelled) return;
        const { effectiveRockId, resolution } = readResolution(verification);
        const checked: Extract<TapAttestation, { status: "checked" }> = {
          status: "checked",
          verified: verification.verified,
          reason: verification.reason,
          message: verification.message,
          attestation: verification.attestation,
          counter: verification.counter,
          effectiveRockId,
          resolution,
        };
        // Remembered against the rock it resolved to, so it survives the navigation there.
        rememberTap({ rockId: effectiveRockId ?? rockId, result: checked });
        setResult(checked);
      })
      .catch(() => {
        if (cancelled) return;
        setResult({ status: "checked", verified: false, reason: "verifier_error" });
      });

    return () => {
      cancelled = true;
    };
  }, [hasTap, gate, rockId, params.e, params.c, params.enc, subject]);

  // Derived, not stored: only the verifier's answer is state, so nothing here can drift from it.
  if (result) return result;
  if (!hasTap) return { status: "absent" };
  if (gate === "hold") return { status: "held" };
  if (gate === "verify") return { status: "checking" };
  return { status: "waiting" };
}

/**
 * The server-signed attestation for this tap, or null.
 *
 * Null unless the tap verified, the server signed an attestation for it, and that attestation
 * names `subject` - the wallet that is about to send the transaction. Anything less is not a
 * usable authorisation for awakening or claiming.
 */
export function signedAttestation(
  tap: TapAttestation,
  subject?: string,
): Extract<AttestationResult, { state: "SIGNED" }> | null {
  if (tap.status !== "checked" || !tap.verified) return null;
  const attestation = tap.attestation;
  if (!attestation || attestation.state !== "SIGNED") return null;
  if (!sameAddress(attestation.message.subject, subject)) return null;
  return attestation;
}

/** Plain-English reason a tap did not verify. Only the reasons a visitor can act on are named. */
export function tapReasonText(reason?: string, fallback?: string): string | null {
  switch (reason) {
    case "stale_counter":
      return "This link was already used";
    case "invalid_cmac":
      return "This link is not from the rock";
    case "unconfigured":
      return "Verification is not configured";
    default:
      return fallback ?? null;
  }
}
