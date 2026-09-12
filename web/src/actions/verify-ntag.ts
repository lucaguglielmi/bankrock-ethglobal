"use server";

/**
 * Server action wrapper around the one NFC verifier (D-018, F-1).
 *
 * The previous implementation slept 400 ms and then set
 * `isValid = params.c !== "invalid_signature"`, so any `?c=` value rendered the
 * green "Verified Physical" badge. That is gone. This action now calls
 * `verifyTap` — the same code path as `/api/nfc/verify`, in-process, with no
 * HTTP round-trip — and `isAuthentic` is `verified`, which is only ever true
 * after a real CMAC match and a successful monotonic counter advance.
 */

import { verifyTap, type VerifyFailureReason } from "@/lib/nfc/verify";
import type { AttestationResult } from "@/lib/nfc/attestation";
import { logger } from "@/lib/telemetry";

export interface VerifyNtagParams {
  uid?: string;
  ctr?: string;
  /** Truncated SDM CMAC. */
  c?: string;
  /** Encrypted PICC data. */
  e?: string;
  /** Optional SDMENCFileData. */
  enc?: string;
  rockId?: string | number;
}

export interface VerifyResult {
  /** The verifier ran and produced an answer. Not a claim about the tag. */
  success: boolean;
  /** True only after a real CMAC match and a monotonic counter advance. */
  verified: boolean;
  /** Alias of `verified`, kept for the existing component contract. */
  isAuthentic: boolean;
  /** Machine-readable failure reason, identical to the route's. */
  reason?: VerifyFailureReason;
  /** Last two bytes of the UID only. The full UID never leaves the server. */
  uid?: string;
  /** Accepted SDMReadCtr. */
  counter?: number;
  /** Alias of `counter`, kept for the existing component contract. */
  readCount?: number;
  /** Server-signed EIP-712 attestation, or why it is unavailable. */
  attestation?: AttestationResult;
  /** Human-readable explanation for the UI. */
  message?: string;
  latencyMs?: number;
}

const MESSAGES: Record<VerifyFailureReason, string> = {
  malformed_request: "This link carries no NTAG 424 DNA signature parameters.",
  unconfigured: "Tag verification is not configured on this deployment.",
  invalid_picc_data: "The tag data did not decrypt to a recognised NTAG 424 DNA payload.",
  invalid_cmac: "Cryptographic signature mismatch — this URL was not produced by the rock.",
  counter_store_unavailable: "Replay protection is unavailable, so the tap cannot be trusted.",
  stale_counter: "This tap has already been used. Copied links cannot be replayed.",
  verifier_error: "The verifier could not complete this check.",
};

/**
 * Verify the physical authenticity of an NTAG 424 DNA tap.
 *
 * `params.uid` and `params.ctr` are ignored: on a real tag both are carried
 * inside the encrypted PICCData and anything supplied in the URL is attacker
 * controlled.
 */
export async function verifyNtagSignature(params: VerifyNtagParams): Promise<VerifyResult> {
  const start = Date.now();

  try {
    const outcome = await verifyTap({
      rockId: params.rockId === undefined ? undefined : String(params.rockId),
      e: params.e,
      c: params.c,
      enc: params.enc,
    });

    const { body } = outcome;
    const latencyMs = Date.now() - start;

    logger[body.verified ? "info" : "warn"](
      body.verified
        ? "NTAG 424 DNA SDM verification succeeded"
        : "NTAG 424 DNA SDM verification rejected",
      {
        action: body.verified ? "NFC_VERIFIED" : "NFC_VERIFY_REJECTED",
        rockId: params.rockId,
        uidSuffix: body.uid,
        counter: body.counter,
        reason: body.reason,
        latencyMs,
      },
    );

    return {
      success: true,
      verified: body.verified,
      isAuthentic: body.verified,
      reason: body.reason,
      uid: body.uid,
      counter: body.counter,
      readCount: body.counter,
      attestation: body.attestation,
      message: body.reason ? MESSAGES[body.reason] : undefined,
      latencyMs,
    };
  } catch (error: unknown) {
    const latencyMs = Date.now() - start;
    logger.error("NTAG verification internal error", error, {
      action: "NFC_VERIFY_ERROR",
      rockId: params.rockId,
      latencyMs,
    });

    return {
      success: false,
      verified: false,
      isAuthentic: false,
      reason: "verifier_error",
      message: MESSAGES.verifier_error,
      latencyMs,
    };
  }
}
