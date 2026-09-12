/**
 * Server-signed EIP-712 attestation for a verified physical tap.
 *
 * D-018: `awakenRock` and the claim path require an attestation bound to
 * `(rockId, uid, counter, subject, smartAccount)` with an expiry. F-5 replaces the previous
 * `verifiedPubKey = "0x" + e + c` string, which was neither a key nor a
 * signature. The struct definition below must match the registry contract
 * exactly.
 *
 * The signer key never holds funds (spec 16 #17) and only ever signs this one
 * struct. Attestation gates *claiming*, never *spending* (spec 06).
 */

import { getAddress, isAddress, keccak256, zeroAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const ATTESTATION_PRIMARY_TYPE = "Attestation" as const;

/** The EIP-712 type string the registry must hash into its type hash. */
export const ATTESTATION_TYPE_STRING =
  "Attestation(uint256 rockId,bytes32 uidHash,uint32 counter,uint256 deadline,address subject,address smartAccount)";

export const ATTESTATION_TYPES = {
  Attestation: [
    { name: "rockId", type: "uint256" },
    { name: "uidHash", type: "bytes32" },
    { name: "counter", type: "uint32" },
    { name: "deadline", type: "uint256" },
    { name: "subject", type: "address" },
    { name: "smartAccount", type: "address" },
  ],
} as const;

export const ATTESTATION_DOMAIN_NAME = "BankRockRegistry";
export const ATTESTATION_DOMAIN_VERSION = "1";
/** Sepolia. Overridable with `NEXT_PUBLIC_CHAIN_ID` for a different deployment. */
export const ATTESTATION_DEFAULT_CHAIN_ID = 11155111;
/** Attestations expire ten minutes after signing. */
export const ATTESTATION_TTL_SECONDS = 600;

export interface AttestationDomain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Address;
}

export interface AttestationMessage {
  /** Decimal string — the struct field is a `uint256`. */
  rockId: string;
  /** keccak256 of the raw 7-byte UID. */
  uidHash: Hex;
  counter: number;
  /** Unix seconds. */
  deadline: number;
  /**
   * The wallet this tap authorises, checksummed.
   *
   * Naming the subject in the signed struct is what lets the transaction be
   * relayed or sent from a sponsored Safe: whoever submits it, the registry
   * credits `subject`, so a bundler, paymaster or relayer cannot redirect the
   * rock to itself.
   *
   * `subject` is supplied by the client. That is deliberate and safe: the
   * physical tap is the authorisation, and `subject` only says who the person
   * holding the rock is giving it to. A caller who can choose `subject` is a
   * caller who already tapped the rock, and could equally have tapped it while
   * signed in as anyone. It grants nothing that possession did not already
   * grant. What it must never become is a substitute for the tap, which is why
   * a `subject` alone produces no signature.
   */
  subject: Address;
  /**
   * The Rock Account the tap authorises, checksummed, or the zero address.
   *
   * Without this field a front-runner who watches an attestation reach the
   * mempool can bind the rock to a Safe they deployed: `subject` alone says who
   * is credited, not which account the registry writes. Naming the smart
   * account in the signed struct closes that.
   *
   * Resolved server-side, never supplied by the client (`lib/nfc/rock-resolution`):
   * a claim signs the account the registry already holds for the rock, an
   * awakening signs the account derived from `subject` and the tag. It is the
   * zero address only when no account could be named at all, and the registry
   * must reject a zero `smartAccount` on the awaken path rather than treat it
   * as a wildcard.
   */
  smartAccount: Address;
}

export type AttestationUnavailableReason =
  | "signer_unconfigured"
  | "signer_key_invalid"
  | "registry_unconfigured"
  | "invalid_rock_id"
  | "missing_subject"
  | "invalid_smart_account"
  | "rock_account_unavailable"
  | "signing_failed";

export type AttestationResult =
  | {
      state: "SIGNED";
      signer: Address;
      signature: Hex;
      primaryType: typeof ATTESTATION_PRIMARY_TYPE;
      typeString: typeof ATTESTATION_TYPE_STRING;
      domain: AttestationDomain;
      message: AttestationMessage;
    }
  | { state: "UNAVAILABLE"; reason: AttestationUnavailableReason };

export interface SignAttestationInput {
  /** Rock identifier as it appeared in the request; must parse as a `uint256`. */
  rockId: string;
  /** Raw 7-byte tag UID. */
  uid: Buffer;
  /** SDMReadCtr accepted by the counter store. */
  counter: number;
  /**
   * The wallet the tap authorises. Client-supplied (see `AttestationMessage`).
   * Required for signing: without a valid address the attestation is
   * `UNAVAILABLE`, while verification itself still succeeds.
   */
  subject?: string;
  /**
   * The Rock Account this tap authorises, resolved server-side. Optional only
   * for a direct caller that names no account; the verifier always passes one
   * or reports `rock_account_unavailable` instead of signing.
   */
  smartAccount?: string;
  /** Override the clock, for tests. Unix seconds. */
  nowSeconds?: number;
}

const PRIVATE_KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const UINT256_MAX = BigInt(
  "115792089237316195423570985008687907853269984665640564039457584007913129639935",
);
const UINT32_MAX = 4294967295;

/**
 * Why this deployment cannot sign at all, or `null` if it can.
 *
 * Separated from `signAttestation` so a caller can find out before spending an
 * RPC round trip deriving a Rock Account for a signature it could never make.
 * `signAttestation` repeats these checks for direct callers.
 */
export function attestationConfigIssue(): AttestationUnavailableReason | null {
  const privateKey = process.env.ATTESTATION_SIGNER_PRIVATE_KEY;
  if (!privateKey) return "signer_unconfigured";
  if (!PRIVATE_KEY_PATTERN.test(privateKey)) return "signer_key_invalid";

  const registry = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS;
  if (!registry || !isAddress(registry)) return "registry_unconfigured";

  return null;
}

/** keccak256 of the raw UID bytes — never of a hex string. */
export function hashUid(uid: Buffer): Hex {
  const hex = `0x${uid.toString("hex")}` as Hex;
  return keccak256(hex);
}

function readChainId(): number {
  const raw = process.env.NEXT_PUBLIC_CHAIN_ID;
  if (!raw) return ATTESTATION_DEFAULT_CHAIN_ID;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : ATTESTATION_DEFAULT_CHAIN_ID;
}

function parseRockId(rockId: string): bigint | null {
  if (!/^[0-9]+$/.test(rockId)) return null;
  try {
    const value = BigInt(rockId);
    return value <= UINT256_MAX ? value : null;
  } catch {
    return null;
  }
}

/**
 * Sign the attestation. Returns `{ state: "UNAVAILABLE", reason }` when the
 * signer key or the registry address is unset — verification itself still
 * succeeds; only the on-chain claim is blocked (D-018 stages attestation
 * separately from verification).
 */
export async function signAttestation(input: SignAttestationInput): Promise<AttestationResult> {
  const privateKey = process.env.ATTESTATION_SIGNER_PRIVATE_KEY;
  if (!privateKey) {
    return { state: "UNAVAILABLE", reason: "signer_unconfigured" };
  }
  if (!PRIVATE_KEY_PATTERN.test(privateKey)) {
    return { state: "UNAVAILABLE", reason: "signer_key_invalid" };
  }

  const registry = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS;
  if (!registry || !isAddress(registry)) {
    return { state: "UNAVAILABLE", reason: "registry_unconfigured" };
  }

  const rockId = parseRockId(input.rockId);
  if (rockId === null) {
    return { state: "UNAVAILABLE", reason: "invalid_rock_id" };
  }

  if (!input.subject || !isAddress(input.subject, { strict: false })) {
    return { state: "UNAVAILABLE", reason: "missing_subject" };
  }
  const subject = getAddress(input.subject);

  // Defence in depth: `verifyTap` already 400s on a malformed value, so this
  // only fires for a direct caller. Absent is legitimate and means "no account
  // named" — the zero address, never a wildcard.
  if (input.smartAccount !== undefined && !isAddress(input.smartAccount, { strict: false })) {
    return { state: "UNAVAILABLE", reason: "invalid_smart_account" };
  }
  const smartAccount: Address =
    input.smartAccount === undefined ? zeroAddress : getAddress(input.smartAccount);

  const counter = Math.trunc(input.counter);
  if (!Number.isFinite(counter) || counter < 0 || counter > UINT32_MAX) {
    return { state: "UNAVAILABLE", reason: "invalid_rock_id" };
  }

  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  const deadline = now + ATTESTATION_TTL_SECONDS;

  const domain: AttestationDomain = {
    name: ATTESTATION_DOMAIN_NAME,
    version: ATTESTATION_DOMAIN_VERSION,
    chainId: readChainId(),
    verifyingContract: registry,
  };

  const uidHash = hashUid(input.uid);

  try {
    const account = privateKeyToAccount(privateKey as Hex);
    const signature = await account.signTypedData({
      domain,
      types: ATTESTATION_TYPES,
      primaryType: ATTESTATION_PRIMARY_TYPE,
      message: {
        rockId,
        uidHash,
        counter,
        deadline: BigInt(deadline),
        subject,
        smartAccount,
      },
    });

    return {
      state: "SIGNED",
      signer: account.address,
      signature,
      primaryType: ATTESTATION_PRIMARY_TYPE,
      typeString: ATTESTATION_TYPE_STRING,
      domain,
      message: {
        rockId: rockId.toString(),
        uidHash,
        counter,
        deadline,
        subject,
        smartAccount,
      },
    };
  } catch {
    // Never surface the key or the underlying error text.
    return { state: "UNAVAILABLE", reason: "signing_failed" };
  }
}
