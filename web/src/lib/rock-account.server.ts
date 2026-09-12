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
  createWalletClient,
  http,
  recoverTypedDataAddress,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  addresses,
  chain,
  chainId,
  ENTRY_POINT_07_ADDRESS,
  getPublicClient,
} from "@/lib/chain";
import { optionalEnv, real, unavailable, type Capability } from "@/lib/demo";
import {
  encodeClaimHandover,
  encodeSwapOwner,
  parseRockId,
  registryAddress,
  type SignedAttestation,
} from "@/lib/rock-account";
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
/* Relayed claim                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Sends `claimHandover` from the relayer key.
 *
 * The returned hash comes from the node that accepted the transaction. If the send fails, the
 * result is UNAVAILABLE — there is no other way for this function to produce a hash (D-014).
 */
export async function submitClaimHandover(
  rockIdString: string,
  attestation: SignedAttestation,
): Promise<Capability<{ txHash: Hex }>> {
  const rockId = parseRockId(rockIdString);
  if (rockId === null) return unavailable("Invalid rock id");

  const registry = registryAddress();
  if (registry.state === "UNAVAILABLE") return unavailable(registry.reason);

  const relayer = relayerAccount();
  if (relayer.state === "UNAVAILABLE") return unavailable(relayer.reason);

  const rpcUrl = optionalEnv("SEPOLIA_RPC_URL");
  const walletClient = createWalletClient({
    account: relayer.value,
    chain,
    transport: rpcUrl ? http(rpcUrl) : http(),
  });

  try {
    const txHash = await walletClient.sendTransaction({
      to: registry.value,
      data: encodeClaimHandover(rockId, attestation),
      value: BigInt(0),
    });

    logger.info("Relayed handover claim", {
      action: "HANDOVER_CLAIM_RELAYED",
      rockId: rockId.toString(),
      txHash,
    });

    return real({ txHash });
  } catch (err) {
    logger.error("Relayed handover claim failed", err, {
      action: "HANDOVER_CLAIM_RELAY_FAILED",
      rockId: rockId.toString(),
    });
    return unavailable(
      `The claim was not broadcast: ${err instanceof Error ? err.message : String(err)}`,
    );
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

async function bundlerRpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await response.json()) as { result?: unknown; error?: { message?: string } };
  if (body.error) {
    throw new Error(body.error.message ?? "bundler error");
  }
  return body.result;
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
      `The bundler rejected the stored operation: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      const receipt = (await bundlerRpc(url.value, "eth_getUserOperationReceipt", [
        userOpHash,
      ])) as { receipt?: { transactionHash?: Hex }; success?: boolean } | null;

      if (receipt?.receipt?.transactionHash) {
        return real({ txHash: receipt.receipt.transactionHash, userOpHash });
      }
    } catch {
      // Keep polling: a not-yet-known operation is reported as an error by some bundlers.
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  return unavailable(
    `The operation ${userOpHash} was accepted by the bundler but has not been mined yet`,
  );
}

/** True when the chain read path is configured well enough to be worth attempting. */
export function canReadChain(): boolean {
  return Boolean(addresses.registry) && Boolean(getPublicClient());
}
