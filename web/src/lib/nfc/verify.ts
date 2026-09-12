/**
 * The single NFC verifier (D-018).
 *
 * `/api/nfc/verify` and `actions/verify-ntag.ts` both call `verifyTap`. There
 * is no second implementation and no client-side path that can produce a
 * verified result (F-1, F-7).
 *
 * `verified: true` requires both a real CMAC match and a successful
 * strictly-monotonic counter advance in durable storage. Nothing else sets it.
 */

import { isAddress } from "viem";

import { isHex, loadSdmKeyConfig } from "./config";
import { resolveCounterStore, type CounterStoreKind } from "./counter-store";
import { signAttestation, type AttestationResult } from "./attestation";
import { PICC_DATA_LENGTH, SDM_MAC_LENGTH, verifySdm } from "./sdm";

export type VerifyFailureReason =
  /** `e` or `c` missing or not the right length of hex. HTTP 400. */
  | "malformed_request"
  /** `NXP_MASTER_KEY` is not set. Fails closed (D-017/D-018). */
  | "unconfigured"
  /** PICCData decrypted to an unsupported PICCDataTag — wrong key or forged `e`. */
  | "invalid_picc_data"
  /** The truncated SDM CMAC did not match. */
  | "invalid_cmac"
  /** No durable counter store; replay protection is impossible, so fail closed. */
  | "counter_store_unavailable"
  /** The counter did not exceed the last accepted value for this UID — a replay. */
  | "stale_counter"
  /** Unexpected server-side failure. */
  | "verifier_error";

export interface VerifyTapInput {
  /** Rock identifier from the URL path. Bound into the attestation. */
  rockId?: string;
  /** Encrypted PICCData: the `e` (or `picc_data`) parameter. */
  e?: string;
  /** Truncated SDM CMAC: the `c` (or `cmac`) parameter. */
  c?: string;
  /** SDMENCFileData: the optional `enc` parameter. */
  enc?: string;
  /**
   * The wallet this tap authorises, bound into the EIP-712 attestation so the
   * transaction can be relayed or sent from a sponsored Safe without the
   * relayer being able to redirect the rock.
   *
   * Client-supplied, and that is acceptable: the physical tap is the
   * authorisation. `subject` only names who the person holding the rock is
   * giving it to, which is a choice that person already has. It is never a
   * substitute for the tap — an invalid CMAC or a stale counter produces no
   * attestation no matter what `subject` says.
   *
   * Absent: verification runs and the attestation is `UNAVAILABLE`.
   * Present but not an address: the whole request is `malformed_request`.
   */
  subject?: string;
}

export interface VerifyTapResponse {
  verified: boolean;
  reason?: VerifyFailureReason;
  /**
   * Last two bytes of the tag UID, uppercase hex. The full UID is never
   * returned or logged: it is a stable physical identifier (spec 06 public
   * scan behaviour, and SA-2 on UID leakage through telemetry).
   */
  uid?: string;
  counter?: number;
  attestation?: AttestationResult;
}

export interface VerifyTapOutcome {
  status: number;
  body: VerifyTapResponse;
  /** Which store answered. Diagnostics only; never part of the HTTP body. */
  counterStore?: CounterStoreKind;
}

/** Number of trailing UID bytes disclosed to the client. */
const UID_SUFFIX_BYTES = 2;

export function uidSuffix(uid: Buffer): string {
  return uid.subarray(uid.length - UID_SUFFIX_BYTES).toString("hex").toUpperCase();
}

function normaliseHexParam(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

/**
 * Verify one tap.
 *
 * The amount of work is bounded and the same for every request that carries
 * well-formed parameters: one AES-CBC block decryption, three AES-CMACs, one
 * constant-time comparison and at most one database statement. There are no
 * retries, no loops over attacker-controlled lengths and no network calls, so
 * this endpoint is cheap to rate-limit in front of.
 *
 * The counter store is only touched after the CMAC matches, so forged requests
 * never reach the database.
 */
export async function verifyTap(input: VerifyTapInput): Promise<VerifyTapOutcome> {
  const e = normaliseHexParam(input.e);
  const c = normaliseHexParam(input.c);
  const enc = normaliseHexParam(input.enc);
  const subject = normaliseHexParam(input.subject);

  if (!e || !c || !isHex(e, PICC_DATA_LENGTH) || !isHex(c, SDM_MAC_LENGTH)) {
    return { status: 400, body: { verified: false, reason: "malformed_request" } };
  }
  if (enc !== undefined && !isHex(enc)) {
    return { status: 400, body: { verified: false, reason: "malformed_request" } };
  }
  if (subject !== undefined && !isAddress(subject, { strict: false })) {
    return { status: 400, body: { verified: false, reason: "malformed_request" } };
  }

  const keys = loadSdmKeyConfig();
  if (!keys.ok) {
    return { status: 200, body: { verified: false, reason: "unconfigured" } };
  }

  let sdm;
  try {
    sdm = verifySdm({
      piccData: Buffer.from(e, "hex"),
      cmac: Buffer.from(c, "hex"),
      encFileData: enc,
      keys: keys.config,
    });
  } catch {
    return { status: 500, body: { verified: false, reason: "verifier_error" } };
  }

  if (!sdm.ok) {
    const reason: VerifyFailureReason =
      sdm.reason === "unexpected_picc_tag" ? "invalid_picc_data" : "invalid_cmac";
    return { status: 200, body: { verified: false, reason } };
  }

  const store = await resolveCounterStore();
  if (!store.available) {
    return { status: 200, body: { verified: false, reason: "counter_store_unavailable" } };
  }

  const advanced = await store.store.advance(sdm.uid.toString("hex"), sdm.readCounter);
  if (!advanced) {
    return {
      status: 200,
      counterStore: store.kind,
      body: {
        verified: false,
        reason: "stale_counter",
        uid: uidSuffix(sdm.uid),
        counter: sdm.readCounter,
      },
    };
  }

  const attestation = await signAttestation({
    rockId: input.rockId ?? "",
    uid: sdm.uid,
    counter: sdm.readCounter,
    subject,
  });

  return {
    status: 200,
    counterStore: store.kind,
    body: {
      verified: true,
      uid: uidSuffix(sdm.uid),
      counter: sdm.readCounter,
      attestation,
    },
  };
}
