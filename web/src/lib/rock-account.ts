/**
 * The Rock Account and the registry record: everything that is safe in a browser bundle.
 *
 * The Rock Account is a Safe 1.4.1 smart account on EntryPoint 0.7 whose owner is the user's
 * Privy embedded wallet (spec 03). Its address is counterfactual — derived deterministically from
 * (owner, salt) — so a rock has an address before anything is deployed, and the first sponsored
 * UserOperation deploys it (spec 05, D-012).
 *
 * Server-only work — the relayer, the attestation signature check, submitting a stored UserOp —
 * lives in `rock-account.server.ts`. Nothing here reads a private key.
 *
 * D-014 applies throughout: a transaction hash is only ever returned when a bundler or an RPC
 * accepted and broadcast the transaction. There is no other source of one.
 */

import {
  createPublicClient,
  encodeFunctionData,
  getAddress,
  http,
  keccak256,
  toHex,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { sepolia } from "viem/chains";
import { toSafeSmartAccount } from "permissionless/accounts";
import {
  addresses,
  chain,
  ENTRY_POINT_07_ADDRESS,
  getPublicClient,
  SAFE_SENTINEL_OWNER,
} from "@/lib/chain";
import { BANK_ROCK_REGISTRY_ABI } from "@/lib/chain/abi/registry";
import { ERC20_ABI } from "@/lib/chain/abi/erc20";
import { env, optionalEnv, real, unavailable, type Capability } from "@/lib/demo";

/* -------------------------------------------------------------------------- */
/* Attestation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A server-signed attestation for a verified physical tap.
 *
 * This mirrors the `state: "SIGNED"` branch of the NFC verifier's response
 * (`lib/nfc/attestation.ts`, `GET /api/nfc/verify?rockId&e&c&subject=`). It is re-declared
 * rather than imported because the verifier module is server-only — it reaches for `node:crypto`
 * and `Buffer` — and this type is needed in the browser.
 *
 * The EIP-712 struct is
 * `Attestation(uint256 rockId,bytes32 uidHash,uint32 counter,uint256 deadline,address subject,address smartAccount)`.
 */
export interface SignedAttestation {
  state: "SIGNED";
  signature: Hex;
  signer: Address;
  primaryType: "Attestation";
  typeString: string;
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: Address;
  };
  message: {
    /** Decimal string — the struct field is a uint256. */
    rockId: string;
    uidHash: Hex;
    counter: number;
    /** Unix seconds. */
    deadline: number;
    /** The wallet this tap authorises: it becomes the rock's owner. */
    subject: Address;
    /**
     * The Rock Account the tap authorises for `awakenRock`, which requires the `smartAccount`
     * argument to equal this field. Binding the account into the signed payload is what stops a
     * relayer from awakening the rock into an account it controls. Zero for a claim, which never
     * changes the Rock Account.
     */
    smartAccount: Address;
  };
}

/** Structural check for an attestation received over the wire. */
export function isSignedAttestation(value: unknown): value is SignedAttestation {
  if (!value || typeof value !== "object") return false;
  const att = value as Partial<SignedAttestation>;
  if (att.state !== "SIGNED") return false;
  if (typeof att.signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(att.signature)) return false;
  const message = att.message;
  if (!message || typeof message !== "object") return false;
  return (
    typeof message.rockId === "string" &&
    typeof message.uidHash === "string" &&
    typeof message.counter === "number" &&
    typeof message.deadline === "number" &&
    typeof message.subject === "string" &&
    typeof message.smartAccount === "string"
  );
}

/** The attestation tuple as the registry ABI expects it. */
export function toContractAttestation(attestation: SignedAttestation) {
  return {
    rockId: BigInt(attestation.message.rockId),
    uidHash: attestation.message.uidHash,
    counter: attestation.message.counter,
    deadline: BigInt(attestation.message.deadline),
    subject: attestation.message.subject,
    smartAccount: attestation.message.smartAccount,
  } as const;
}

/**
 * Checks that an attestation authorises this wallet, this Rock Account and this rock.
 *
 * This is the client-side half of the registry's own rules. The registry credits `att.subject`
 * rather than `msg.sender` and requires `att.smartAccount` to equal the account being bound, so
 * an attestation that names someone else would succeed on chain and hand the rock — or its
 * account — to that someone else. Refusing here means the user never sends a transaction whose
 * outcome contradicts what they were shown.
 *
 * Pure, so the rule is stated once and is testable.
 */
export function checkAwakenAttestation(
  attestation: SignedAttestation,
  params: { signedInAddress?: string; smartAccount?: string; rockId: string },
): Capability<true> {
  const id = parseRockId(params.rockId);
  if (id === null) return unavailable(`"${params.rockId}" is not a rock id`);

  if (!params.signedInAddress) return unavailable("Sign in to act on this rock");

  if (attestation.message.rockId !== id.toString()) {
    return unavailable("This tap was verified for a different rock");
  }

  const subject = attestation.message.subject?.toLowerCase();
  if (!subject || subject !== params.signedInAddress.toLowerCase()) {
    return unavailable(
      "This tap authorises a different wallet than the one signed in — tap the rock again while signed in",
    );
  }

  if (!params.smartAccount) {
    return unavailable("The Rock Account address is not available yet");
  }
  const attested = attestation.message.smartAccount?.toLowerCase();
  if (!attested || attested !== params.smartAccount.toLowerCase()) {
    return unavailable(
      "This tap authorises a different Rock Account — tap the rock again from this device",
    );
  }

  if (attestation.message.deadline * 1000 <= Date.now()) {
    return unavailable("This tap has expired — tap the rock again");
  }

  return real(true);
}

/* -------------------------------------------------------------------------- */
/* Rock record                                                                 */
/* -------------------------------------------------------------------------- */

export type RockState = "dormant" | "awake" | "handover_pending" | "archived";

export interface RockHandover {
  /** null means "whoever taps the rock and claims it". */
  recipient: Address | null;
  /** Unix seconds. */
  expiresAt: number;
  initiatedAt: number;
  initiatedBy: Address;
  messageHash: Hex;
}

export interface RockRecord {
  rockId: string;
  owner: Address;
  smartAccount: Address;
  uidHash: Hex;
  state: RockState;
  lost: boolean;
  /**
   * The outstanding handover, or null.
   *
   * Non-null only while the rock is `handover_pending`. `getRock` reports an expired handover as
   * `Awake` while still returning the stored struct; an expired attempt is claimable by nobody,
   * so surfacing it as a handover would be misleading.
   */
  handover: RockHandover | null;
}

/** The tuple `getRock` returns, in ABI order. */
export type GetRockResult = readonly [
  owner: Address,
  smartAccount: Address,
  uidHash: Hex,
  state: number,
  lost: boolean,
  handover: {
    recipient: Address;
    expiresAt: bigint;
    initiatedAt: bigint;
    initiatedBy: Address;
    messageHash: Hex;
  },
];

const STATE_BY_INDEX: Record<number, RockState> = {
  0: "dormant",
  1: "awake",
  2: "handover_pending",
  3: "archived",
};

/**
 * Pure mapper from the registry tuple to `RockRecord`.
 *
 * A rock with no owner is dormant whatever the enum says: the two can only disagree on a chain
 * that does not match this ABI, and "dormant" is the honest reading of an empty record.
 */
export function mapRockRecord(rockId: string, result: GetRockResult): RockRecord {
  const [owner, smartAccount, uidHash, stateIndex, lost, handover] = result;
  const mapped = STATE_BY_INDEX[stateIndex] ?? "dormant";
  const state: RockState = owner === zeroAddress ? "dormant" : mapped;

  return {
    rockId,
    owner,
    smartAccount,
    uidHash,
    state,
    lost,
    handover:
      state === "handover_pending"
        ? {
            recipient: handover.recipient === zeroAddress ? null : handover.recipient,
            expiresAt: Number(handover.expiresAt),
            initiatedAt: Number(handover.initiatedAt),
            initiatedBy: handover.initiatedBy,
            messageHash: handover.messageHash,
          }
        : null,
  };
}

/** Rock ids are uint256 decimal strings. Anything else is rejected rather than coerced. */
export function parseRockId(rockId: string): bigint | null {
  const trimmed = String(rockId ?? "").trim();
  if (!/^\d+$/.test(trimmed)) return null;
  try {
    const value = BigInt(trimmed);
    return value > BigInt(0) ? value : null;
  } catch {
    return null;
  }
}

export const REGISTRY_UNAVAILABLE_REASON =
  "NEXT_PUBLIC_REGISTRY_ADDRESS is not configured — the rock registry is not deployed yet";

/** The registry address, or UNAVAILABLE with the reason. */
export function registryAddress(): Capability<Address> {
  if (!addresses.registry) return unavailable(REGISTRY_UNAVAILABLE_REASON);
  return real(addresses.registry);
}

/**
 * A public client usable from the browser as well as the server.
 *
 * `getPublicClient()` reads SEPOLIA_RPC_URL, which is server-only; in the browser that is
 * undefined and viem falls back to its default Sepolia transport, which is what this needs.
 */
function readClient() {
  if (typeof window === "undefined") return getPublicClient();
  return createPublicClient({ chain: sepolia, transport: http() });
}

/** Reads a rock's registry record. */
export async function readRock(rockId: string): Promise<Capability<RockRecord>> {
  const id = parseRockId(rockId);
  if (id === null) {
    return unavailable(`"${rockId}" is not a rock id: it must be a positive integer`);
  }

  const registry = registryAddress();
  if (registry.state === "UNAVAILABLE") return unavailable(registry.reason);

  try {
    const result = (await readClient().readContract({
      address: registry.value,
      abi: BANK_ROCK_REGISTRY_ABI,
      functionName: "getRock",
      args: [id],
    })) as unknown as GetRockResult;

    return real(mapRockRecord(id.toString(), result));
  } catch (err) {
    return unavailable(
      `The registry could not be read on ${chain.name}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export interface RockReserves {
  usdc: bigint;
  weth: bigint;
}

/** Reads the Rock Account's actual ERC-20 balances. Virtual Aqua balances are a separate read. */
export async function readReserves(
  smartAccount: Address | undefined,
): Promise<Capability<RockReserves>> {
  if (!smartAccount || smartAccount === zeroAddress) {
    return unavailable("This rock has no Rock Account yet");
  }
  const usdc = addresses.usdc;
  const weth = addresses.weth;
  if (!usdc || !weth) {
    return unavailable("NEXT_PUBLIC_USDC_ADDRESS / NEXT_PUBLIC_WETH_ADDRESS are not configured");
  }

  try {
    const client = readClient();
    const [usdcBalance, wethBalance] = await Promise.all([
      client.readContract({
        address: usdc,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [smartAccount],
      }),
      client.readContract({
        address: weth,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [smartAccount],
      }),
    ]);
    return real({ usdc: usdcBalance as bigint, weth: wethBalance as bigint });
  } catch (err) {
    return unavailable(
      `Token balances could not be read: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Which rock a tag is bound to *right now*, straight from the registry.
 *
 * `uidHash` comes from a SIGNED attestation's `message.uidHash` — the verifier never discloses
 * the raw UID, and the hash is what the registry indexes by, so nothing privacy-sensitive has to
 * travel for this to work. A null rockId means the tag is unbound: either it has never awakened a
 * rock, or the rock it awakened has since been archived (archiving releases the tag).
 */
export async function resolveRockForTag(
  uidHash: Hex,
): Promise<Capability<{ rockId: string | null }>> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(uidHash)) {
    return unavailable("uidHash must be a 32-byte hex string");
  }
  const registry = registryAddress();
  if (registry.state === "UNAVAILABLE") return unavailable(registry.reason);

  try {
    const bound = (await readClient().readContract({
      address: registry.value,
      abi: BANK_ROCK_REGISTRY_ABI,
      functionName: "rockIdForUid",
      args: [uidHash],
    })) as bigint;

    return real({ rockId: bound === BigInt(0) ? null : bound.toString() });
  } catch (err) {
    return unavailable(
      `The tag binding could not be read: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Calldata                                                                    */
/* -------------------------------------------------------------------------- */

export const ZERO_MESSAGE_HASH: Hex = `0x${"0".repeat(64)}`;

/** `keccak256(utf8(message))`, or the zero hash for no message. */
export function messageHashFor(message?: string | null): Hex {
  const trimmed = (message ?? "").trim();
  if (trimmed === "") return ZERO_MESSAGE_HASH;
  return keccak256(toHex(trimmed));
}

export function encodeAwaken(
  rockId: bigint,
  smartAccount: Address,
  attestation: SignedAttestation,
): Hex {
  return encodeFunctionData({
    abi: BANK_ROCK_REGISTRY_ABI,
    functionName: "awakenRock",
    args: [rockId, smartAccount, toContractAttestation(attestation), attestation.signature],
  });
}

export function encodeClaimHandover(rockId: bigint, attestation: SignedAttestation): Hex {
  return encodeFunctionData({
    abi: BANK_ROCK_REGISTRY_ABI,
    functionName: "claimHandover",
    args: [rockId, toContractAttestation(attestation), attestation.signature],
  });
}

export function encodeInitiateHandover(
  rockId: bigint,
  recipient: Address | null,
  expiresAt: number,
  messageHash: Hex,
): Hex {
  return encodeFunctionData({
    abi: BANK_ROCK_REGISTRY_ABI,
    functionName: "initiateHandover",
    args: [rockId, recipient ?? zeroAddress, BigInt(expiresAt), messageHash],
  });
}

export function encodeCancelHandover(rockId: bigint): Hex {
  return encodeFunctionData({
    abi: BANK_ROCK_REGISTRY_ABI,
    functionName: "cancelHandover",
    args: [rockId],
  });
}

export function encodeArchiveRock(rockId: bigint): Hex {
  return encodeFunctionData({
    abi: BANK_ROCK_REGISTRY_ABI,
    functionName: "archiveRock",
    args: [rockId],
  });
}

/**
 * The owner's own statement that the physical tag is lost or copied (Flow F).
 *
 * Informational only: on chain it freezes nothing, blocks no handover and gates nothing. It exists
 * so a reader of the registry can see what the owner said. The UI must not present it as a
 * security control — possession was never the authorisation for spending in the first place.
 */
export function encodeMarkLost(rockId: bigint): Hex {
  return encodeFunctionData({
    abi: BANK_ROCK_REGISTRY_ABI,
    functionName: "markLost",
    args: [rockId],
  });
}

export function encodeClearLost(rockId: bigint): Hex {
  return encodeFunctionData({
    abi: BANK_ROCK_REGISTRY_ABI,
    functionName: "clearLost",
    args: [rockId],
  });
}

/**
 * The next rock id nobody has awakened yet.
 *
 * Pure, so the rule is testable and stated once: one above the highest id that has ever been
 * awakened, and 1 when none has. Ids that are not positive integers are ignored rather than
 * guessed at, and gaps are never reused — an archived rock keeps its id forever, so reissuing it
 * would make one number mean two objects in the provenance history.
 */
export function nextFreeRockId(awakenedIds: readonly string[]): string {
  let highest = BigInt(0);
  for (const raw of awakenedIds) {
    const parsed = parseRockId(String(raw));
    if (parsed !== null && parsed > highest) highest = parsed;
  }
  return (highest + BigInt(1)).toString();
}

/* -------------------------------------------------------------------------- */
/* Safe owner rotation                                                         */
/* -------------------------------------------------------------------------- */

export { SAFE_SENTINEL_OWNER } from "@/lib/chain";

const SAFE_SWAP_OWNER_ABI = [
  {
    type: "function",
    name: "swapOwner",
    stateMutability: "nonpayable",
    inputs: [
      { name: "prevOwner", type: "address" },
      { name: "oldOwner", type: "address" },
      { name: "newOwner", type: "address" },
    ],
    outputs: [],
  },
] as const;

/**
 * `Safe.swapOwner(prevOwner, oldOwner, newOwner)` calldata.
 *
 * For the single-owner Safe a Rock Account is, `prevOwner` is the sentinel: the owner list is
 * `SENTINEL -> owner -> SENTINEL`, and `prevOwner` is the entry that points at the one being
 * replaced.
 *
 * This is what moves control of the Rock Account from the giver to the recipient while the
 * account address and its assets stay exactly where they are (spec 03, Flow E).
 */
export function encodeSwapOwner(oldOwner: Address, newOwner: Address): Hex {
  return encodeFunctionData({
    abi: SAFE_SWAP_OWNER_ABI,
    functionName: "swapOwner",
    args: [SAFE_SENTINEL_OWNER, oldOwner, newOwner],
  });
}

/* -------------------------------------------------------------------------- */
/* Account abstraction availability                                            */
/* -------------------------------------------------------------------------- */

export const PIMLICO_UNAVAILABLE_REASON =
  "NEXT_PUBLIC_PIMLICO_API_KEY is not configured — no bundler or paymaster is reachable";

/** The browser-visible Pimlico key. Restrict it by origin in the Pimlico dashboard. */
export function pimlicoApiKey(): Capability<string> {
  const key = env.pimlicoApiKeyPublic.trim();
  if (key === "") return unavailable(PIMLICO_UNAVAILABLE_REASON);
  return real(key);
}

/** Sepolia bundler + verifying paymaster endpoint. The chain is named, never a numeric literal. */
export function pimlicoRpcUrl(apiKey: string): string {
  return `https://api.pimlico.io/v2/sepolia/rpc?apikey=${apiKey}`;
}

/**
 * Salt for the counterfactual Safe address: the tag's own identity.
 *
 * One Rock Account per physical rock, per owner (spec 03, D-005). The salt is `keccak256(uid)` —
 * the same `uidHash` the registry binds and the attestation signs — read as a uint256, so:
 *
 *  - two rocks held by the same person have two accounts, and their balances never pool;
 *  - the account address is derivable by anyone who knows the tag hash and the owner, which is
 *    what lets the verifier quote `smartAccount` inside the signed attestation before any
 *    transaction exists;
 *  - the address follows the *tag*, not the rock id. A tag whose rock was archived awakens a new
 *    rock id into the same account for the same owner, which is the behaviour the archive-and-
 *    rehearse flow needs.
 *
 * It deliberately does not include the rock id: the id is not settled at the moment of the tap
 * (an archived rock's tag awakens a different one), and the attestation must name the account.
 *
 * Throws on a malformed hash rather than salting with a coerced value — a wrong salt is a
 * different account, and that failure would surface much later as "your rock is empty".
 */
export function rockAccountSaltFor(uidHash: `0x${string}`): bigint {
  if (!/^0x[0-9a-fA-F]{64}$/.test(uidHash)) {
    throw new Error(`uidHash must be a 32-byte hex string, got "${uidHash}"`);
  }
  return BigInt(uidHash);
}

/**
 * Derives a Rock Account address without deploying anything and without a signer.
 *
 * Counterfactual: the address is a CREATE2 prediction from (owner, salt), so it exists and can be
 * quoted — to the verifier, to a faucet, to a UI — long before the first UserOperation deploys it.
 *
 * Server-safe: it takes an owner *address*, not a wallet, so the NFC verifier can derive exactly
 * the address the client will build and sign it into the attestation. Nothing here can sign or
 * send.
 *
 * It is not free, and callers on a latency-sensitive path should know why: `toSafeSmartAccount`
 * reads `proxyCreationCode()` from the Safe proxy factory before it can predict the address, so
 * derivation costs one RPC round trip. The result is fully determined by (owner, salt) on a given
 * chain, so it is cached here for the life of the isolate, and the read is given a short timeout
 * and a single retry: an unreachable RPC must fail quickly as UNAVAILABLE rather than hang a tap.
 */
const derivedAddressCache = new Map<string, Address>();

function derivationClient() {
  const rpcUrl = optionalEnv("SEPOLIA_RPC_URL");
  return createPublicClient({
    chain: sepolia,
    transport: http(rpcUrl, { timeout: 5_000, retryCount: 1 }),
  });
}

export async function computeRockAccountAddress(params: {
  ownerAddress: Address;
  saltNonce: bigint;
}): Promise<Capability<Address>> {
  let ownerAddress: Address;
  try {
    ownerAddress = getAddress(params.ownerAddress);
  } catch {
    return unavailable(`"${params.ownerAddress}" is not an address`);
  }

  const cacheKey = `${ownerAddress}:${params.saltNonce.toString()}`;
  const cached = derivedAddressCache.get(cacheKey);
  if (cached) return real(cached);

  try {
    const account = await toSafeSmartAccount({
      client: derivationClient(),
      // Address-only owner: enough to predict the address, unable to authorise anything.
      owners: [{ address: ownerAddress, type: "json-rpc" } as const],
      version: "1.4.1",
      entryPoint: { address: ENTRY_POINT_07_ADDRESS, version: "0.7" },
      saltNonce: params.saltNonce,
    });

    const derived = getAddress(account.address);
    derivedAddressCache.set(cacheKey, derived);
    return real(derived);
  } catch (err) {
    return unavailable(
      `The Rock Account address could not be derived: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
