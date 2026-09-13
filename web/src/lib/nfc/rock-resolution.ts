/**
 * Which rock a tap is for, and which Rock Account it authorises.
 *
 * Both answers used to be the client's job: the page passed whatever `rockId`
 * was in the URL and whatever `smartAccount` it had derived. Neither is safe to
 * take on trust - the URL id is written on the tag at provisioning time and can
 * be stale, and a client-chosen smart account is exactly the front-running hole
 * the sixth attestation field exists to close. So the verifier resolves both,
 * after the CMAC matches, and signs what it resolved.
 *
 * Everything here reads the registry through `@/lib/rock-account`, which is the
 * one module that knows the ABI and the address (D-015).
 */

import { desc, eq } from "drizzle-orm";
import { zeroAddress, type Address, type Hex } from "viem";

import { getDb } from "@/lib/db";
import { rockEvents } from "@/lib/db/schema";
import {
  computeRockAccountAddress,
  findNextDormantRockId,
  nextFreeRockId,
  parseRockId,
  readRock,
  resolveRockForTag,
} from "@/lib/rock-account";
import type { RockRecord } from "@/lib/rock-account";

/**
 * How the effective rock id was arrived at.
 *
 * - `bound`                - the registry already maps this tag's `uidHash` to a rock.
 * - `url`                  - the tag is unbound and the id on the tag is dormant, so it is free to take.
 * - `next_free`            - the tag is unbound and the id on the tag is not available (archived, or
 *                            already awake), so the next unused id is suggested instead.
 * - `registry_unavailable` - the registry could not be read; the id on the tag is echoed back
 *                            unchanged and nothing is claimed about it.
 */
export type RockResolution = "bound" | "url" | "next_free" | "registry_unavailable";

export interface EffectiveRock {
  effectiveRockId: string;
  resolution: RockResolution;
  /** The registry record for the effective rock, when it could be read. */
  record: RockRecord | null;
}

/** States in which a rock already has a Rock Account, so a tap is a claim, not an awakening. */
const CLAIM_STATES: ReadonlySet<string> = new Set(["awake", "handover_pending"]);

/** How many indexed `awakened` events to consider when suggesting the next id. */
const AWAKENED_EVENT_SCAN_LIMIT = 1000;

/**
 * Ids that have ever been awakened, from the indexed events.
 *
 * Same source as `GET /api/rocks/next-id`, and the same caveat: the result is a
 * suggestion, not a reservation. Two taps at the same moment get the same
 * number and the registry settles it - the second `awakenRock` reverts with
 * `RockAlreadyAwakened`. With no database the list is empty, which suggests id
 * 1; the registry still settles it, so this can be optimistic but never
 * silently wrong.
 */
async function awakenedRockIds(): Promise<string[]> {
  try {
    const db = getDb();
    if (!db) return [];
    const rows = await db
      .select({ rockId: rockEvents.rockId })
      .from(rockEvents)
      .where(eq(rockEvents.eventType, "awakened"))
      .orderBy(desc(rockEvents.timestamp))
      .limit(AWAKENED_EVENT_SCAN_LIMIT);
    return rows.map((row) => row.rockId);
  } catch {
    return [];
  }
}

/**
 * Resolve the rock this tap is for.
 *
 * Order matters: the binding in the registry wins over anything written on the
 * tag, because a tag can be moved to a replacement rock and the tag itself is
 * never re-encoded.
 */
export async function resolveEffectiveRock(
  uidHash: Hex,
  urlRockId: string | undefined,
): Promise<EffectiveRock> {
  const urlId = (urlRockId ?? "").trim();

  const bound = await resolveRockForTag(uidHash);
  if (bound.state === "UNAVAILABLE") {
    return { effectiveRockId: urlId, resolution: "registry_unavailable", record: null };
  }

  if (bound.value.rockId !== null) {
    const record = await readRock(bound.value.rockId);
    return {
      effectiveRockId: bound.value.rockId,
      resolution: "bound",
      record: record.state === "UNAVAILABLE" ? null : record.value,
    };
  }

  // The tag is unbound. Is the id written on it still free to take?
  if (parseRockId(urlId) === null) {
    // Nothing usable on the tag - suggest the next id rather than guess.
    return { effectiveRockId: await nextFreeId(), resolution: "next_free", record: null };
  }

  const urlRecord = await readRock(urlId);
  if (urlRecord.state === "UNAVAILABLE") {
    // The registry stopped answering between the two reads. Echo the tag's id
    // and claim nothing about it, rather than hand out a different rock.
    return { effectiveRockId: urlId, resolution: "registry_unavailable", record: null };
  }

  if (urlRecord.value.state === "dormant") {
    return { effectiveRockId: urlId, resolution: "url", record: urlRecord.value };
  }

  // Archived, or any other non-dormant state while the tag is unbound: the id
  // on the tag belongs to a different object now and is never reused.
  return { effectiveRockId: await nextFreeId(), resolution: "next_free", record: null };
}

async function nextFreeId(): Promise<string> {
  // The mirror only says where to start looking; the registry says which id is actually free
  // (2026-09-13: the mirror is filled by viewing a rock's activity, so on a fresh Worker or right
  // after an archive it can lag the chain, and offering an archived id would make `awakenRock`
  // revert on stage).
  const suggestion = nextFreeRockId(await awakenedRockIds());
  const onChain = await findNextDormantRockId(suggestion, readRock);
  return onChain ?? suggestion;
}

/* -------------------------------------------------------------------------- */
/* Rock Account                                                                */
/* -------------------------------------------------------------------------- */

export type SmartAccountResolution =
  | { ok: true; smartAccount: Address; mode: "claim" | "awaken" }
  | { ok: false; reason: "rock_account_unavailable" };

function isZero(address: string | undefined): boolean {
  return !address || address.toLowerCase() === zeroAddress;
}

/**
 * The Rock Account this tap authorises.
 *
 * A rock that is already `awake` or `handover_pending` has one, and a claim
 * must name the account the registry already holds - deriving a fresh one there
 * would sign an attestation the registry rejects. Otherwise this is an
 * awakening, and the account is derived from the subject and the tag:
 *
 *     saltNonce = uint256(keccak256(rawUid))
 *
 * so one physical rock yields one Rock Account per owner, deterministically,
 * with no deployment and no transaction.
 */
export async function resolveSmartAccount(params: {
  subject: Address;
  uidHash: Hex;
  record: RockRecord | null;
}): Promise<SmartAccountResolution> {
  const { record } = params;

  if (record && CLAIM_STATES.has(record.state) && !isZero(record.smartAccount)) {
    return { ok: true, smartAccount: record.smartAccount, mode: "claim" };
  }

  try {
    const derived = await computeRockAccountAddress({
      ownerAddress: params.subject,
      saltNonce: BigInt(params.uidHash),
    });
    if (derived.state === "UNAVAILABLE" || isZero(derived.value)) {
      return { ok: false, reason: "rock_account_unavailable" };
    }
    return { ok: true, smartAccount: derived.value, mode: "awaken" };
  } catch {
    // Never surface the RPC error text: it can carry the endpoint URL.
    return { ok: false, reason: "rock_account_unavailable" };
  }
}
