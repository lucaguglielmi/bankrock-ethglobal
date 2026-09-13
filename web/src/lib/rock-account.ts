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
import { SAFE_OWNER_MANAGER_ABI } from "@/lib/chain/abi/safe";
import { ERC20_ABI } from "@/lib/chain/abi/erc20";
import { env, optionalEnv, real, unavailable, type Capability } from "@/lib/demo";
import { publicReasonWith } from "@/lib/errors";

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

  if (!params.signedInAddress) return unavailable(SIGNED_OUT_REASON);

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
  return createPublicClient({ chain: sepolia, transport: http(env.sepoliaRpcUrlPublic || undefined) });
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
      publicReasonWith(`The registry could not be read on ${chain.name}`, err),
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
      publicReasonWith("Token balances could not be read", err),
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
      publicReasonWith("The tag binding could not be read", err),
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Which account, and whose word for it (D-037)                                */
/* -------------------------------------------------------------------------- */

/**
 * For an **awakened** rock the Rock Account is whatever the registry reports, never a fresh
 * derivation, and authority over it is the account's own answer rather than an address the app
 * recomputes. That is D-037, and it exists because the two disagree the moment a rock is given
 * away: `claimHandover` swaps the Safe's single owner to the recipient and rebinds
 * `rock.smartAccount` to that same Safe (D-032), whose address was derived from the *giver's*
 * wallet and the tag (D-029). Deriving from (recipient, tag) therefore yields a different, empty
 * address, and an app that insists on it locks the new owner out of a rock the registry says is
 * theirs.
 *
 * Derivation survives in exactly the two places where there is no account to read: the
 * counterfactual address the verifier signs into an awakening attestation, and a visitor's
 * personal Safe (`PERSONAL_ACCOUNT_SALT`).
 */

/** The one reason a signed-out user is given for any owner action. */
export const SIGNED_OUT_REASON = "Sign in to act on this rock";

/** The rock exists but its record names no account to act from. */
export const NOT_AWAKENED_REASON = "This rock has not been awakened yet";

/** The registry answered, but with no account — only possible off a chain matching this ABI. */
export const NO_REGISTRY_ACCOUNT_REASON = "The registry holds no Rock Account for this rock";

/** Archiving is terminal: the registry refuses every owner action afterwards (D-028). */
export const ARCHIVED_REASON = "This rock is retired, so it has no owner actions left";

/** The signed-in wallet is not the wallet the registry records as this rock's owner. */
export const NOT_ROCK_OWNER_REASON = "This rock is owned by a different wallet";

/** `isOwner` returned false: the account belongs to someone else now. */
export const ACCOUNT_ANSWERS_ELSEWHERE_REASON = "This account answers to a different wallet";

/** No code at the address, so it can answer for nobody — the `code.length` half of the gate. */
export const ACCOUNT_NOT_DEPLOYED_REASON =
  "This rock's account has not executed anything yet, so it answers to nobody";

/** `isOwner` did not return cleanly. On chain that is false, and it is false here. */
export const ACCOUNT_DID_NOT_ANSWER_REASON =
  "This rock's account did not answer when asked whose wallet it belongs to";

/**
 * What an account said when asked whether a wallet is one of its owners.
 *
 * `answers: false` always carries the reason to show, because "not yours" and "not deployed" are
 * different facts and neither may be rendered as the other.
 */
export type AccountAnswer = { answers: true } | { answers: false; reason: string };

/**
 * The pure reading of the two facts `_accountAnswersTo` gathers on chain, in its order: no code is
 * false, an unclean answer is false, and only a clean `true` is true.
 */
export function interpretAccountAnswer(params: {
  hasCode: boolean;
  /** `null` when the call reverted or returned something that is not a boolean. */
  isOwner: boolean | null;
}): AccountAnswer {
  if (!params.hasCode) return { answers: false, reason: ACCOUNT_NOT_DEPLOYED_REASON };
  if (params.isOwner === null) return { answers: false, reason: ACCOUNT_DID_NOT_ANSWER_REASON };
  if (!params.isOwner) return { answers: false, reason: ACCOUNT_ANSWERS_ELSEWHERE_REASON };
  return { answers: true };
}

/**
 * Asks a Rock Account whether a wallet is one of its owners — the same staticcall the registry's
 * `_accountAnswersTo` makes before it admits an owner action from that account.
 *
 * UNAVAILABLE means the question could not be put (no address, no wallet, unreachable RPC). A REAL
 * `answers: false` means the account was asked and did not claim this wallet; that is a fact about
 * the chain, not a failure to read it, and the two are never conflated (D-013).
 */
export async function readAccountAnswersTo(
  account: Address | undefined,
  wallet: string | undefined,
): Promise<Capability<AccountAnswer>> {
  if (!account || account === zeroAddress) return unavailable(NO_REGISTRY_ACCOUNT_REASON);
  if (!wallet) return unavailable(SIGNED_OUT_REASON);

  let accountAddress: Address;
  let walletAddress: Address;
  try {
    accountAddress = getAddress(account);
    walletAddress = getAddress(wallet);
  } catch {
    return unavailable(`"${wallet}" is not an address`);
  }

  const client = readClient();

  let code: Hex | undefined;
  try {
    code = await client.getCode({ address: accountAddress });
  } catch (err) {
    return unavailable(publicReasonWith("The Rock Account could not be read", err));
  }
  if (!code || code === "0x") {
    return real(interpretAccountAnswer({ hasCode: false, isOwner: null }));
  }

  let isOwner: boolean | null = null;
  try {
    const answer = await client.readContract({
      address: accountAddress,
      abi: SAFE_OWNER_MANAGER_ABI,
      functionName: "isOwner",
      args: [walletAddress],
    });
    isOwner = typeof answer === "boolean" ? answer : null;
  } catch {
    // A revert, a missing function, or anything else unclean. The chain counts that as "no", and
    // so does this: the code read above already proved the RPC is answering.
    isOwner = null;
  }

  return real(interpretAccountAnswer({ hasCode: true, isOwner }));
}

/** Where a Rock Account address came from. Only `"derivation"` is a prediction. */
export type RockAccountSource = "registry" | "derivation";

export interface RockAccountPlan {
  smartAccount: Address;
  source: RockAccountSource;
}

/**
 * The Rock Account to use for one rock: the registry's if the rock has ever been awakened,
 * otherwise the address this wallet and this tag derive (D-037).
 *
 * Pure, so the rule is stated once and is testable: the caller does the registry read and, when
 * there is nothing to read, the derivation.
 */
export function planRockAccount(params: {
  record: RockRecord | null;
  /** `deriveRockAccountAddress(wallet, uidHash)`, when it has been computed. */
  derived?: Address;
}): Capability<RockAccountPlan> {
  const record = params.record;
  const bound =
    record && record.state !== "dormant" && record.smartAccount !== zeroAddress
      ? record.smartAccount
      : null;

  if (bound) return real({ smartAccount: getAddress(bound), source: "registry" });

  if (record && record.state !== "dormant") return unavailable(NO_REGISTRY_ACCOUNT_REASON);

  if (params.derived && params.derived !== zeroAddress) {
    return real({ smartAccount: getAddress(params.derived), source: "derivation" });
  }

  return unavailable(NOT_AWAKENED_REASON);
}

/**
 * Whether the signed-in wallet may send this rock's owner actions, and from which account.
 *
 * The two conditions are the registry's own, restated where the user can be told about them
 * before a transaction is built rather than after one reverts:
 *
 *  1. the wallet is the owner the registry records — `_requireRockController` admits nobody
 *     else's Safe; and
 *  2. the Rock Account answers to that wallet — the `isOwner` staticcall `_accountAnswersTo`
 *     makes, which is what lets the action be sent from the account and sponsored.
 *
 * Pure. `answer` is what `readAccountAnswersTo` returned for the registry's account.
 */
export function ownerActionAuthority(params: {
  record: RockRecord;
  wallet: string | undefined;
  answer: AccountAnswer;
}): Capability<Address> {
  const plan = planRockAccount({ record: params.record });
  if (plan.state === "UNAVAILABLE") return unavailable(plan.reason);

  if (params.record.state === "archived") return unavailable(ARCHIVED_REASON);
  if (!params.wallet) return unavailable(SIGNED_OUT_REASON);

  if (params.record.owner.toLowerCase() !== params.wallet.toLowerCase()) {
    return unavailable(NOT_ROCK_OWNER_REASON);
  }

  if (!params.answer.answers) return unavailable(params.answer.reason);

  return real(plan.value.smartAccount);
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

/** How many consecutive ids the registry is asked about before giving up (2026-09-13). */
export const NEXT_FREE_PROBE_LIMIT = 256;

/**
 * The first dormant rock id at or after `start`, asked of the registry one id at a time.
 *
 * The indexed events are a *suggestion* (they exist only once a rock's activity has been viewed
 * and mirrored); the registry is the truth. Starting from the suggestion and walking forward
 * until `getRock` reports `dormant` makes the answer correct even with an empty mirror — an
 * archived or awakened id is skipped, never offered. `readState` is injected so the walk is
 * testable without a chain. Returns null when the RPC could not answer or the limit is hit.
 */
export async function findNextDormantRockId(
  start: string,
  readState: (rockId: string) => Promise<Capability<{ state: string }>>,
  limit: number = NEXT_FREE_PROBE_LIMIT,
): Promise<string | null> {
  const first = parseRockId(start) ?? BigInt(1);
  for (let i = BigInt(0); i < BigInt(limit); i++) {
    const id = (first + i).toString();
    const record = await readState(id);
    if (record.state === "UNAVAILABLE") return null;
    if (record.value.state === "dormant") return id;
  }
  return null;
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
/* ERC-20 approvals                                                            */
/* -------------------------------------------------------------------------- */

/** One call in a batch. Structurally identical to `lib/aqua`'s `Call`. */
export interface Call {
  to: Address;
  data: Hex;
  value: bigint;
}

/**
 * The approval calls needed to move an allowance from `currentAllowance` to `amount`.
 *
 * Circle's USDC — the Sepolia token every rock trades — inherits the original USDT-era guard and
 * **reverts on a non-zero to non-zero `approve`**. An approval sequence that ignores this works on
 * WETH and fails on USDC, which is the worst possible shape for a bug: it passes every test that
 * uses a plain ERC-20 and breaks on the one token the product is about.
 *
 * So: reset to zero first whenever both the current and the target allowance are non-zero. When
 * they are already equal there is nothing to do, and the empty array keeps a pointless approval
 * out of the batch (and out of the sponsored gas).
 *
 * Pure, so the rule is stated once and is testable without a chain.
 */
export function approvalCalls(params: {
  token: Address;
  spender: Address;
  currentAllowance: bigint;
  amount: bigint;
}): Call[] {
  const { token, spender, currentAllowance, amount } = params;

  const approve = (value: bigint): Call => ({
    to: token,
    data: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: "approve",
      args: [spender, value],
    }),
    value: BigInt(0),
  });

  if (currentAllowance === amount) return [];
  if (currentAllowance > BigInt(0) && amount > BigInt(0)) {
    return [approve(BigInt(0)), approve(amount)];
  }
  return [approve(amount)];
}

/** Reads an ERC-20 allowance. UNAVAILABLE rather than 0 when it cannot be read. */
export async function readAllowance(
  token: Address,
  owner: Address,
  spender: Address,
): Promise<Capability<bigint>> {
  try {
    const allowance = (await readClient().readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [owner, spender],
    })) as bigint;
    return real(allowance);
  } catch (err) {
    return unavailable(
      publicReasonWith("The current allowance could not be read", err),
    );
  }
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
 *    rehearse flow needs — for the owner who derived it. After a gift the rock's account is the
 *    giver's derivation (D-032, D-037), so the recipient's next awakening lands in a different
 *    account and the retired rock's reserve stays where it is.
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
      publicReasonWith("The Rock Account address could not be derived", err),
    );
  }
}

/**
 * Salt for a visitor's *personal* Safe.
 *
 * Zero, deliberately: a taker's account is not tied to any tag. A visitor who swaps against three
 * different rocks uses one account, because it is their wallet's smart-account twin — it exists
 * so the swap can be a sponsored batch (approve + swap) and so the periphery has a contract to
 * call back into (`contracts/aqua/NOTES.md` §5), not because it belongs to a rock.
 *
 * Rock Accounts are salted with the tag instead (`rockAccountSaltFor`), which is what keeps one
 * owner's two rocks from sharing a reserve.
 */
export const PERSONAL_ACCOUNT_SALT = BigInt(0);
