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

import { getAddress, isAddress } from "viem";

import { isHex, loadSdmKeyConfig } from "./config";
import { resolveCounterStore, type CounterStoreKind } from "./counter-store";
import {
  attestationConfigIssue,
  hashUid,
  signAttestation,
  type AttestationResult,
} from "./attestation";
import { resolveEffectiveRock, resolveSmartAccount, type RockResolution } from "./rock-resolution";
import { PICC_DATA_LENGTH, SDM_MAC_LENGTH, verifySdm } from "./sdm";

export type VerifyFailureReason =
  /** `e` or `c` missing or not the right length of hex. HTTP 400. */
  | "malformed_request"
  /** `NXP_MASTER_KEY` is not set. Fails closed (D-017/D-018). */
  | "unconfigured"
  /** PICCData decrypted to an unsupported PICCDataTag - wrong key or forged `e`. */
  | "invalid_picc_data"
  /** The truncated SDM CMAC did not match. */
  | "invalid_cmac"
  /** No durable counter store; replay protection is impossible, so fail closed. */
  | "counter_store_unavailable"
  /** The counter did not exceed the last accepted value for this UID - a replay. */
  | "stale_counter"
  /** Over the per-IP limit. HTTP 429. */
  | "rate_limited"
  /** The rate-limit store could not be reached, so no limit could be enforced. HTTP 503. */
  | "rate_limit_unavailable"
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
   * substitute for the tap - an invalid CMAC or a stale counter produces no
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
  /**
   * The rock this tap is actually for, resolved from the registry rather than
   * taken from the URL. The page navigates to it. Present once the CMAC matches.
   */
  effectiveRockId?: string;
  /** How `effectiveRockId` was arrived at. Present once the CMAC matches. */
  resolution?: RockResolution;
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
 * Work is bounded and identical for every request up to the CMAC comparison:
 * one AES-CBC block decryption, three AES-CMACs and one constant-time compare.
 * Nothing before that point touches the database, the registry or the RPC, so a
 * forged or replayed URL costs exactly that and no more, which is what makes
 * this endpoint cheap to rate-limit in front of.
 *
 * Only after the CMAC matches does the request become expensive: up to three
 * registry reads to resolve the rock, one indexed-events query, one Safe
 * address derivation and one database statement. Every one of those is bounded
 * and none is retried.
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

  // Resolve which rock this tap is for before advancing the counter, so a tap
  // that cannot be attributed to a rock still burns its counter exactly once.
  const uidHash = hashUid(sdm.uid);
  const rock = await resolveEffectiveRock(uidHash, input.rockId);

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
        effectiveRockId: rock.effectiveRockId,
        resolution: rock.resolution,
      },
    };
  }

  const attestation = await signTapAttestation({
    rockId: rock.effectiveRockId,
    uid: sdm.uid,
    uidHash,
    counter: sdm.readCounter,
    subject,
    record: rock.record,
  });

  return {
    status: 200,
    counterStore: store.kind,
    body: {
      verified: true,
      uid: uidSuffix(sdm.uid),
      counter: sdm.readCounter,
      effectiveRockId: rock.effectiveRockId,
      resolution: rock.resolution,
      attestation,
    },
  };
}

/**
 * Sign for the resolved rock and the resolved Rock Account.
 *
 * Checks run cheapest first: a deployment that cannot sign at all, then a
 * request that names nobody to authorise, and only then the Safe derivation,
 * which costs an RPC round trip.
 */
async function signTapAttestation(params: {
  rockId: string;
  uid: Buffer;
  uidHash: `0x${string}`;
  counter: number;
  subject: string | undefined;
  record: Awaited<ReturnType<typeof resolveEffectiveRock>>["record"];
}): Promise<AttestationResult> {
  const configIssue = attestationConfigIssue();
  if (configIssue !== null) {
    return { state: "UNAVAILABLE", reason: configIssue };
  }

  if (!params.subject || !isAddress(params.subject, { strict: false })) {
    return { state: "UNAVAILABLE", reason: "missing_subject" };
  }

  const account = await resolveSmartAccount({
    subject: getAddress(params.subject),
    uidHash: params.uidHash,
    record: params.record,
  });
  if (!account.ok) {
    return { state: "UNAVAILABLE", reason: account.reason };
  }

  return signAttestation({
    rockId: params.rockId,
    uid: params.uid,
    counter: params.counter,
    subject: params.subject,
    smartAccount: account.smartAccount,
  });
}
