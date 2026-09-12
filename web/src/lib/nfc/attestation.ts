/**
 * Server-signed EIP-712 attestation for a verified physical tap.
 *
 * D-018: `awakenRock` and the claim path require an attestation bound to
 * `(rockId, uid, counter)` with an expiry. F-5 replaces the previous
 * `verifiedPubKey = "0x" + e + c` string, which was neither a key nor a
 * signature. The struct definition below must match the registry contract
 * exactly.
 *
 * The signer key never holds funds (spec 16 #17) and only ever signs this one
 * struct. Attestation gates *claiming*, never *spending* (spec 06).
 */

import { isAddress, keccak256, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const ATTESTATION_PRIMARY_TYPE = "Attestation" as const;

/** The EIP-712 type string the registry must hash into its type hash. */
export const ATTESTATION_TYPE_STRING =
  "Attestation(uint256 rockId,bytes32 uidHash,uint32 counter,uint256 deadline)";

export const ATTESTATION_TYPES = {
  Attestation: [
    { name: "rockId", type: "uint256" },
    { name: "uidHash", type: "bytes32" },
    { name: "counter", type: "uint32" },
    { name: "deadline", type: "uint256" },
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
}

export type AttestationUnavailableReason =
  | "signer_unconfigured"
  | "signer_key_invalid"
  | "registry_unconfigured"
  | "invalid_rock_id"
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
  /** Override the clock, for tests. Unix seconds. */
  nowSeconds?: number;
}

const PRIVATE_KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/;
const UINT256_MAX = BigInt(
  "115792089237316195423570985008687907853269984665640564039457584007913129639935",
);
const UINT32_MAX = 4294967295;

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
      },
    };
  } catch {
    // Never surface the key or the underlying error text.
    return { state: "UNAVAILABLE", reason: "signing_failed" };
  }
}
