/**
 * Server-side half of the Rock Account: the relayer, attestation validation, and submission of
 * UserOperations that were signed elsewhere.
 *
 * Why a relayer exists at all (Flow E, spec 15 Phase 2): a gift recipient taps a rock they have
 * never owned, on a wallet that has never held a testnet ETH. They have nothing to pay gas with
 * and no Safe of their own — the Rock Account's Safe is still owned by the giver at that moment,
 * so it cannot sponsor the claim either. `claimHandover` is therefore submitted by an operator
 * key. That is safe because the registry credits `att.subject`, not `msg.sender`: the relayer
 * cannot redirect the rock to itself, and the attestation it relays is only produced by a real,
 * counter-fresh tap.
 *
 * Everything here fails closed (D-017) and returns UNAVAILABLE with a reason rather than a
 * fabricated result (D-013, D-014).
 *
 * This module reads private keys and must never be imported from a client component. The
 * `server-only` package is not a dependency of this project, so that is a convention enforced by
 * the `.server.ts` suffix and by review, not by the bundler.
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  recoverTypedDataAddress,
  type Address,
  type Hex,
  type Transport,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  addresses,
  chain,
  chainId,
  ENTRY_POINT_07_ADDRESS,
  getPublicClient,
} from "@/lib/chain";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { optionalEnv, real, unavailable, type Capability } from "@/lib/demo";
import {
  encodeClaimHandover,
  encodeSwapOwner,
  parseRockId,
  registryAddress,
  type SignedAttestation,
} from "@/lib/rock-account";
import { publicReasonWith } from "@/lib/errors";
import { logger } from "@/lib/telemetry";

const PRIVATE_KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/;

/* -------------------------------------------------------------------------- */
/* Keys                                                                        */
/* -------------------------------------------------------------------------- */

/** The relayer account that pays gas for `claimHandover`. Unset means the capability is off. */
export function relayerAccount(): Capability<ReturnType<typeof privateKeyToAccount>> {
  const key = optionalEnv("RELAYER_PRIVATE_KEY");
  if (!key) {
    return unavailable("RELAYER_PRIVATE_KEY is not configured, so claims cannot be relayed");
  }
  if (!PRIVATE_KEY_PATTERN.test(key)) {
    return unavailable("RELAYER_PRIVATE_KEY is not a 32-byte hex private key");
  }
  return real(privateKeyToAccount(key as Hex));
}

/**
 * The address whose EIP-712 signature counts as an attestation.
 *
 * Derived from the signer key rather than configured separately: two sources for one fact is how
 * a deployment ends up trusting a signer that no longer signs anything.
 */
export function attestationSignerAddress(): Capability<Address> {
  const key = optionalEnv("ATTESTATION_SIGNER_PRIVATE_KEY");
  if (!key) {
    return unavailable(
      "ATTESTATION_SIGNER_PRIVATE_KEY is not configured, so no attestation can be validated",
    );
  }
  if (!PRIVATE_KEY_PATTERN.test(key)) {
    return unavailable("ATTESTATION_SIGNER_PRIVATE_KEY is not a 32-byte hex private key");
  }
  return real(privateKeyToAccount(key as Hex).address);
}

/* -------------------------------------------------------------------------- */
/* Attestation validation                                                      */
/* -------------------------------------------------------------------------- */

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

/**
 * Validates a client-supplied attestation against the server's own view of the world.
 *
 * The domain is rebuilt here from configuration and the signature is recovered against *that* —
 * the `domain` field the client sent is never used. A caller who could choose the domain could
 * present a signature made for a different chain or a different contract and have it accepted.
 */
export async function verifyAttestation(
  attestation: SignedAttestation,
  expectedRockId: string,
): Promise<Capability<{ subject: Address; counter: number }>> {
  const signer = attestationSignerAddress();
  if (signer.state === "UNAVAILABLE") return unavailable(signer.reason);

  const registry = registryAddress();
  if (registry.state === "UNAVAILABLE") return unavailable(registry.reason);

  const rockId = parseRockId(expectedRockId);
  if (rockId === null) return unavailable("Invalid rock id");

  if (attestation.message.rockId !== rockId.toString()) {
    return unavailable("The attestation was issued for a different rock");
  }
  if (attestation.message.deadline * 1000 <= Date.now()) {
    return unavailable("The attestation has expired — tap the rock again");
  }

  let recovered: Address;
  try {
    recovered = await recoverTypedDataAddress({
      domain: {
        name: "BankRockRegistry",
        version: "1",
        chainId,
        verifyingContract: registry.value,
      },
      types: ATTESTATION_TYPES,
      primaryType: "Attestation",
      message: {
        rockId: BigInt(attestation.message.rockId),
        uidHash: attestation.message.uidHash,
        counter: attestation.message.counter,
        deadline: BigInt(attestation.message.deadline),
        subject: attestation.message.subject,
        smartAccount: attestation.message.smartAccount,
      },
      signature: attestation.signature,
    });
  } catch {
    return unavailable("The attestation signature could not be recovered");
  }

  if (recovered.toLowerCase() !== signer.value.toLowerCase()) {
    return unavailable("The attestation was not signed by this deployment's attester");
  }

  return real({
    subject: attestation.message.subject,
    counter: attestation.message.counter,
  });
}

/* -------------------------------------------------------------------------- */
/* Daily spend cap                                                             */
/* -------------------------------------------------------------------------- */

/**
 * What one relayed claim is assumed to cost, reserved before the transaction is sent.
 *
 * A cap can only be enforced ahead of the spend, and the real cost is not known until the receipt
 * — so a conservative constant is reserved up front. On Sepolia a `claimHandover` is well under
 * this; over-reserving means the cap binds earlier than strictly necessary, which is the safe
 * direction to be wrong in.
 */
export const RELAYED_CLAIM_COST_ESTIMATE_WEI = BigInt(2_000_000_000_000_000); // 0.002 ETH

/** Largest cap the SQL accumulator can hold: SQLite's INTEGER is signed 64-bit. */
const MAX_REPRESENTABLE_CAP_WEI = BigInt("9223372036854775807");

/**
 * The configured daily relayer cap.
 *
 * **Unset or zero disables relaying** rather than disabling the cap (audit P-1). An uncapped key
 * that anyone with a valid attestation can spend from is the finding, so "no cap configured" must
 * not be the permissive branch.
 */
export function relayerDailyCapWei(): Capability<bigint> {
  const raw = optionalEnv("RELAYER_DAILY_CAP_WEI");
  if (!raw) {
    return unavailable("relayer cap unset");
  }
  if (!/^\d+$/.test(raw)) {
    return unavailable("RELAYER_DAILY_CAP_WEI is not a whole number of wei");
  }
  const cap = BigInt(raw);
  if (cap === BigInt(0)) {
    return unavailable("relayer cap unset");
  }
  if (cap > MAX_REPRESENTABLE_CAP_WEI) {
    return unavailable("RELAYER_DAILY_CAP_WEI is larger than the spend ledger can track");
  }
  return real(cap);
}

/** The UTC day key the ledger accumulates under. */
export function spendDayKey(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * Reserves `amountWei` against today's cap, atomically.
 *
 * The check and the increment are one statement: the `WHERE` on the conflict branch only applies
 * the update when the new total still fits, and `RETURNING` tells us whether it did. Two
 * concurrent claims therefore cannot both pass a cap that only one of them fits under.
 *
 * Fails closed on every uncertainty — no cap, no database, a failed statement — because the thing
 * being bounded is real money leaving a key.
 */
export async function reserveRelayerSpend(
  amountWei: bigint = RELAYED_CLAIM_COST_ESTIMATE_WEI,
): Promise<Capability<{ day: string; reservedWei: bigint }>> {
  const cap = relayerDailyCapWei();
  if (cap.state === "UNAVAILABLE") return unavailable(cap.reason);

  if (amountWei <= BigInt(0)) return unavailable("A spend reservation must be positive");
  if (amountWei > cap.value) {
    return unavailable("The relayer's daily cap is smaller than one claim costs");
  }

  const db = getDb();
  if (!db) {
    return unavailable(
      "The relayer spend ledger is unavailable, so the daily cap cannot be enforced",
    );
  }

  const day = spendDayKey();
  const amount = amountWei.toString();

  try {
    const rows = await db.all<{ wei: string }>(sql`
      INSERT INTO relayer_spend (day, wei, updated_at)
      VALUES (${day}, ${amount}, ${Date.now()})
      ON CONFLICT(day) DO UPDATE SET
        wei = CAST(CAST(relayer_spend.wei AS INTEGER) + CAST(${amount} AS INTEGER) AS TEXT),
        updated_at = ${Date.now()}
      WHERE CAST(relayer_spend.wei AS INTEGER) + CAST(${amount} AS INTEGER) <= ${cap.value.toString()}
      RETURNING wei
    `);

    if (!rows || rows.length === 0) {
      logger.warn("Relayer daily cap reached", { action: "RELAYER_CAP_REACHED", day });
      return unavailable("The relayer has reached its daily limit — try again tomorrow");
    }

    return real({ day, reservedWei: amountWei });
  } catch (err) {
    logger.error("Relayer spend ledger unavailable", err, { action: "RELAYER_LEDGER_ERROR" });
    return unavailable(
      "The relayer spend ledger could not be updated, so the claim was not sent",
    );
  }
}

/** Releases a reservation when the transaction was never broadcast. Best effort. */
export async function releaseRelayerSpend(day: string, amountWei: bigint): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await db.run(sql`
      UPDATE relayer_spend
      SET wei = CAST(MAX(0, CAST(wei AS INTEGER) - CAST(${amountWei.toString()} AS INTEGER)) AS TEXT),
          updated_at = ${Date.now()}
      WHERE day = ${day}
    `);
  } catch {
    // The reservation simply stands for the rest of the day: the cap binds slightly early, which
    // is the safe direction.
  }
}

/* -------------------------------------------------------------------------- */
/* Relayed claim                                                               */
/* -------------------------------------------------------------------------- */

/**
 * How long a relayed claim is watched for its receipt.
 *
 * The same discipline `submitSignedUserOp` uses for the owner swap — ten polls, a block and a half
 * apart — because the two halves of a gift are watched by the same person on the same screen, and
 * one of them giving up in five seconds while the other waits fifteen would be an arbitrary
 * difference in what "done" means.
 */
const RECEIPT_POLL_INTERVAL_MS = 1500;
const RECEIPT_POLL_ATTEMPTS = 10;
const RECEIPT_TIMEOUT_MS = RECEIPT_POLL_INTERVAL_MS * RECEIPT_POLL_ATTEMPTS;

/**
 * The gas limit a relayed `claimHandover` is sent with.
 *
 * Generous for the call — a storage rebind, an `isOwner` staticcall and three events — and it has
 * to be a fixed number rather than an estimate, because it is half of the product that must stay
 * inside the reservation.
 */
export const RELAYED_CLAIM_GAS_LIMIT = BigInt(300_000);

/** The tip the relayer is willing to add on top of the base fee, when the budget leaves room. */
const RELAYER_MAX_PRIORITY_FEE_WEI = BigInt(1_000_000_000); // 1 gwei

/**
 * How much the next block's base fee may exceed this one's: EIP-1559 allows +12.5% per block.
 *
 * A `maxFeePerGas` below that is a transaction that may simply never be mined, so it is refused
 * here rather than broadcast and waited on.
 */
const NEXT_BLOCK_BASE_FEE_NUMERATOR = BigInt(9);
const NEXT_BLOCK_BASE_FEE_DENOMINATOR = BigInt(8);

export const RELAYER_GAS_PRICE_TOO_HIGH_REASON = "gas price too high for the relayer's budget";

/**
 * The fee cap a relayed claim may be sent with, so that it cannot cost more than was reserved.
 *
 * The daily cap is enforced by reserving `RELAYED_CLAIM_COST_ESTIMATE_WEI` *before* the send — but
 * an unpriced `sendTransaction` lets viem choose the fees from the current block, so a fee spike
 * between the reservation and the broadcast spends more of the relayer's key than the ledger ever
 * recorded, and the cap stops being a cap. Bounding the transaction is what makes the reservation
 * true: `gas * maxFeePerGas <= budget`, by construction.
 *
 * When that ceiling is under what the next block will demand, the honest answer is to refuse. A
 * claim that cannot be afforded is not a claim that should be attempted: the attestation is still
 * good, and the claimant can try again when the chain is cheaper.
 */
export function relayedClaimFees(
  baseFeePerGas: bigint,
  budgetWei: bigint = RELAYED_CLAIM_COST_ESTIMATE_WEI,
  gas: bigint = RELAYED_CLAIM_GAS_LIMIT,
): Capability<{ gas: bigint; maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }> {
  if (gas <= BigInt(0) || budgetWei <= BigInt(0)) {
    return unavailable("The relayer's gas budget is not a positive amount");
  }

  const maxFeePerGas = budgetWei / gas;
  const nextBlockBaseFee =
    (baseFeePerGas * NEXT_BLOCK_BASE_FEE_NUMERATOR) / NEXT_BLOCK_BASE_FEE_DENOMINATOR;

  if (maxFeePerGas < nextBlockBaseFee) {
    return unavailable(RELAYER_GAS_PRICE_TOO_HIGH_REASON);
  }

  const headroom = maxFeePerGas - nextBlockBaseFee;
  const maxPriorityFeePerGas =
    headroom < RELAYER_MAX_PRIORITY_FEE_WEI ? headroom : RELAYER_MAX_PRIORITY_FEE_WEI;

  return real({ gas, maxFeePerGas, maxPriorityFeePerGas });
}

/**
 * The result of relaying a claim.
 *
 * Not a plain `Capability`, because a failure has two shapes and the caller must tell them apart:
 * a claim that was never broadcast costs nothing and its reservation is released, while a claim
 * that was broadcast and then reverted or did not mine has already spent the relayer's gas. The
 * route releases the reservation only for the first (`broadcast === null`).
 */
export type RelayedClaim =
  | { state: "REAL"; value: { txHash: Hex } }
  | { state: "UNAVAILABLE"; reason: string; broadcast: { txHash: Hex } | null };

/**
 * Sends `claimHandover` from the relayer key **and waits for it to be mined**.
 *
 * It used to return as soon as the node accepted the transaction, which the recipient's screen
 * read as "This rock is yours" — a sentence about a state that did not exist yet and might never:
 * `claimHandover` reverts for reasons this route cannot rule out in advance
 * (`AttestationExpired` when the mempool is slow, `AccountDoesNotAnswerToOwner`,
 * `HandoverExpired`), and a reverted claim leaves the giver owning the rock and the recipient
 * owning the Safe. So the receipt decides, and only `status === "success"` is a claim (D-014).
 *
 * The fees are bounded so the broadcast cannot exceed the amount reserved against the daily cap.
 */
export async function submitClaimHandover(
  rockIdString: string,
  attestation: SignedAttestation,
): Promise<RelayedClaim> {
  const rockId = parseRockId(rockIdString);
  if (rockId === null) return { state: "UNAVAILABLE", reason: "Invalid rock id", broadcast: null };

  const registry = registryAddress();
  if (registry.state === "UNAVAILABLE") {
    return { state: "UNAVAILABLE", reason: registry.reason, broadcast: null };
  }

  const relayer = relayerAccount();
  if (relayer.state === "UNAVAILABLE") {
    return { state: "UNAVAILABLE", reason: relayer.reason, broadcast: null };
  }

  const rpcUrl = optionalEnv("SEPOLIA_RPC_URL");
  const transport: Transport = rpcUrl ? http(rpcUrl) : http();
  const walletClient = createWalletClient({ account: relayer.value, chain, transport });
  // The same transport for both halves: the receipt must be read from the node that saw the send.
  const publicClient = createPublicClient({ chain, transport });

  let fees: ReturnType<typeof relayedClaimFees>;
  try {
    const block = await publicClient.getBlock({ blockTag: "latest" });
    if (block.baseFeePerGas === null || block.baseFeePerGas === undefined) {
      return {
        state: "UNAVAILABLE",
        reason: "the network reported no base fee, so the relayer's spend could not be bounded",
        broadcast: null,
      };
    }
    fees = relayedClaimFees(block.baseFeePerGas);
  } catch (err) {
    logger.error("Could not read the base fee before relaying a claim", err, {
      action: "HANDOVER_CLAIM_FEE_READ_FAILED",
      rockId: rockId.toString(),
    });
    return {
      state: "UNAVAILABLE",
      reason: publicReasonWith("The claim was not broadcast", err),
      broadcast: null,
    };
  }

  if (fees.state === "UNAVAILABLE") {
    logger.warn("Refused to relay a claim the daily cap could not cover", {
      action: "HANDOVER_CLAIM_GAS_PRICE_TOO_HIGH",
      rockId: rockId.toString(),
    });
    return { state: "UNAVAILABLE", reason: fees.reason, broadcast: null };
  }

  let txHash: Hex;
  try {
    txHash = await walletClient.sendTransaction({
      to: registry.value,
      data: encodeClaimHandover(rockId, attestation),
      value: BigInt(0),
      gas: fees.value.gas,
      maxFeePerGas: fees.value.maxFeePerGas,
      maxPriorityFeePerGas: fees.value.maxPriorityFeePerGas,
    });
  } catch (err) {
    logger.error("Relayed handover claim failed", err, {
      action: "HANDOVER_CLAIM_RELAY_FAILED",
      rockId: rockId.toString(),
    });
    return {
      state: "UNAVAILABLE",
      reason: publicReasonWith("The claim was not broadcast", err),
      broadcast: null,
    };
  }

  logger.info("Relayed handover claim", {
    action: "HANDOVER_CLAIM_RELAYED",
    rockId: rockId.toString(),
    txHash,
  });

  try {
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: RECEIPT_TIMEOUT_MS,
      pollingInterval: RECEIPT_POLL_INTERVAL_MS,
    });

    if (receipt.status !== "success") {
      // A revert is public: it is in the block, and the transaction hash is how anyone reads it.
      // The reason string stays fixed, so nothing from the node's error text can escape here.
      logger.warn("A relayed handover claim reverted", {
        action: "HANDOVER_CLAIM_REVERTED",
        rockId: rockId.toString(),
        txHash,
      });
      return {
        state: "UNAVAILABLE",
        reason: `the claim transaction reverted on chain (${txHash}), so nothing was claimed`,
        broadcast: { txHash },
      };
    }

    return { state: "REAL", value: { txHash } };
  } catch (err) {
    logger.error("A relayed handover claim was not mined in time", err, {
      action: "HANDOVER_CLAIM_NOT_MINED",
      rockId: rockId.toString(),
      txHash,
    });
    return {
      state: "UNAVAILABLE",
      reason: `the claim transaction ${txHash} was broadcast but has not been mined yet`,
      broadcast: { txHash },
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Pre-signed UserOperations                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A UserOperation as it travels over JSON-RPC: every numeric field is a hex string, and the
 * signature is already attached.
 */
export type SerializedUserOperation = Record<string, string> & {
  sender: Address;
  signature: Hex;
};

/**
 * Builds the call that hands the Rock Account's Safe to the recipient (Flow E step 7).
 *
 * The problem this solves, stated plainly: `claimHandover` moves *object* ownership in the
 * registry, but the Rock Account is a Safe whose single owner is still the giver's wallet. Until
 * that owner is swapped, the new owner of the rock cannot move its assets and the old owner
 * still can. The Safe can only authorise its own owner swap with a signature from its current
 * owner — the giver — and the giver is by definition not present when the recipient taps.
 *
 * So the giver pre-signs it. `initiateHandover` signs this UserOperation at the moment the gift
 * is created, when the giver is online and is still the Safe's owner, and it is stored until the
 * claim. The claim route submits it immediately after the registry claim succeeds.
 *
 * Consequences, stated rather than hidden:
 *  - it only works for a *named* recipient. An open handover ("whoever taps it") cannot be
 *    pre-signed, because the new owner's address is not known at signing time. The registry claim
 *    still goes through; the Safe owner swap is reported UNAVAILABLE for that case;
 *  - a stored, signed UserOperation is a bearer instrument for exactly one action: swapping this
 *    Safe's owner to this named recipient. It is stored server-side, and it is only ever
 *    submitted after the registry has accepted a fresh, counter-verified attestation for the same
 *    rock;
 *  - if the giver cancels the handover, the stored operation must be discarded — `cancelHandover`
 *    deletes it (see the claim/cancel routes). A cancelled gift whose owner-swap operation
 *    survived would be a live path to hand the Safe away.
 */
export function buildSwapOwnerUserOpCall(params: {
  safeAddress: Address;
  currentOwner: Address;
  newOwner: Address;
}): { to: Address; data: Hex; value: bigint } {
  return {
    to: params.safeAddress,
    data: encodeSwapOwner(params.currentOwner, params.newOwner),
    value: BigInt(0),
  };
}

function pimlicoUrl(): Capability<string> {
  const key = optionalEnv("PIMLICO_API_KEY") ?? optionalEnv("NEXT_PUBLIC_PIMLICO_API_KEY");
  if (!key) return unavailable("PIMLICO_API_KEY is not configured");
  return real(`https://api.pimlico.io/v2/sepolia/rpc?apikey=${key}`);
}

/**
 * A refusal *by* the bundler, as opposed to a failure to reach it.
 *
 * The two need different words: "your paymaster policy does not cover this" is something an
 * operator can fix, and "the network is down" is not. The message is the bundler's own — an `AAxx`
 * code, a paymaster policy, a prefund — and `publicReason` classifies it into a fixed sentence
 * without ever quoting it (`lib/errors.ts`).
 */
class BundlerRpcError extends Error {
  override name = "BundlerRpcError";
}

async function bundlerRpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await response.json()) as { result?: unknown; error?: { message?: string } };
  if (body.error) {
    throw new BundlerRpcError(body.error.message ?? "bundler error");
  }
  return body.result;
}

/**
 * Asks the bundler whether an operation would validate, **without submitting it**.
 *
 * Why a stored hand-over key is simulated before it is kept: the only thing
 * `POST /api/rocks/[id]/pending-userop` could check about a submitted operation was that its
 * `sender` is the rock's Rock Account — which is public. Any signed-in Privy account could
 * therefore store a row of nonsense against any rock, take the row's creator DID (it is
 * first-writer-wins, audit P-5), and both lock the real giver out and hand the recipient a gift
 * the claim route would submit and fail on. A signature is the thing a squatter cannot forge, and
 * `eth_estimateUserOperationGas` is how the bundler is asked to check one.
 *
 * It uses this module's own bundler transport rather than `lib/aa.ts`'s viem client because the
 * operation is already in the serialised, signed shape this file submits, and because a refusal
 * has to arrive as a `BundlerRpcError` for `publicReason` to make it actionable.
 */
export async function simulateSignedUserOp(
  userOp: SerializedUserOperation,
): Promise<Capability<true>> {
  const url = pimlicoUrl();
  if (url.state === "UNAVAILABLE") return unavailable(url.reason);

  try {
    await bundlerRpc(url.value, "eth_estimateUserOperationGas", [userOp, ENTRY_POINT_07_ADDRESS]);
    return real(true);
  } catch (err) {
    if (err instanceof BundlerRpcError) {
      logger.warn("The bundler refused a pre-signed operation", {
        action: "USEROP_SIMULATION_REFUSED",
        sender: userOp.sender,
      });
      return unavailable(publicReasonWith("The bundler refused this operation", err));
    }
    logger.error("Could not simulate a pre-signed operation", err, {
      action: "USEROP_SIMULATION_UNAVAILABLE",
    });
    return unavailable("The bundler could not be reached, so this operation was not checked");
  }
}

/**
 * Submits a UserOperation that was signed by someone else and stored.
 *
 * Returns the transaction hash only once the bundler reports a receipt. If the operation is
 * accepted but not yet mined within the short poll window, the result is UNAVAILABLE with a
 * reason naming the userOpHash — an accepted-but-unmined operation is not a transaction, and
 * this must not report one.
 */
export async function submitSignedUserOp(
  userOp: SerializedUserOperation,
): Promise<Capability<{ txHash: Hex; userOpHash: Hex }>> {
  const url = pimlicoUrl();
  if (url.state === "UNAVAILABLE") return unavailable(url.reason);

  let userOpHash: Hex;
  try {
    userOpHash = (await bundlerRpc(url.value, "eth_sendUserOperation", [
      userOp,
      ENTRY_POINT_07_ADDRESS,
    ])) as Hex;
  } catch (err) {
    return unavailable(
      publicReasonWith("The bundler rejected the stored operation", err),
    );
  }

  for (let attempt = 0; attempt < RECEIPT_POLL_ATTEMPTS; attempt++) {
    try {
      const receipt = (await bundlerRpc(url.value, "eth_getUserOperationReceipt", [
        userOpHash,
      ])) as { receipt?: { transactionHash?: Hex }; success?: boolean } | null;

      const txHash = receipt?.receipt?.transactionHash;
      if (txHash) {
        // Included is not succeeded (review N-6). ERC-4337 reports a UserOperation that reverted
        // inside its own execution with `success: false` and a perfectly good transaction hash —
        // a stale `prevOwner`, a spent nonce or a Safe guard all look like this. Reading only the
        // hash would report a Safe owner swap that never happened as landed, and the claim route
        // would then hand over a rock whose account is still the giver's: N-1, reached through
        // the check added to prevent it.
        if (receipt?.success !== true) {
          logger.warn("A stored UserOperation was included but reverted", {
            action: "USEROP_REVERTED",
            txHash,
            userOpHash,
          });
          return unavailable(`account handover reverted on-chain (${txHash})`);
        }
        return real({ txHash, userOpHash });
      }
    } catch {
      // Keep polling: a not-yet-known operation is reported as an error by some bundlers.
    }
    await new Promise((resolve) => setTimeout(resolve, RECEIPT_POLL_INTERVAL_MS));
  }

  return unavailable(
    `The operation ${userOpHash} was accepted by the bundler but has not been mined yet`,
  );
}

/** True when the chain read path is configured well enough to be worth attempting. */
export function canReadChain(): boolean {
  return Boolean(addresses.registry) && Boolean(getPublicClient());
}
