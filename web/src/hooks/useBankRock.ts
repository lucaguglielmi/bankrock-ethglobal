"use client";

/**
 * Rock lifecycle actions (Flow A awakening, Flow E handover, archiving).
 *
 * Every action runs as a sponsored ERC-4337 UserOperation from the rock's own Safe — the Rock
 * Account — so a user with an empty wallet can awaken and give a rock (spec 03, spec 05, D-012).
 * The Safe's single owner is the user's Privy embedded wallet; its address is counterfactual, so
 * the first operation both deploys it and does the work.
 *
 * Every method returns a Capability. There is no throw-on-failure path and no fabricated result:
 * a missing Pimlico key, a signed-out user, an unset registry address and a rejected UserOperation
 * all come back as UNAVAILABLE with a reason (D-013), and a transaction hash only ever comes from
 * a bundler that broadcast one (D-014).
 *
 * `claimHandover` is the exception to "from the Safe": the recipient owns neither gas nor the
 * Safe at that moment, so it is relayed server-side. See lib/rock-account.server.ts.
 */

import { useCallback, useMemo, useState } from "react";
import { useWallets } from "@privy-io/react-auth";
import { useQuery } from "@tanstack/react-query";
import {
  createWalletClient,
  custom,
  getAddress,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { toSafeSmartAccount } from "permissionless/accounts";
import { createSmartAccountClient } from "permissionless/clients";
import { createPimlicoClient } from "permissionless/clients/pimlico";
import { http } from "viem";
import { chain, ENTRY_POINT_07_ADDRESS } from "@/lib/chain";
import { real, unavailable, type Capability } from "@/lib/demo";
import {
  checkAwakenAttestation,
  encodeArchiveRock,
  encodeAwaken,
  encodeCancelHandover,
  encodeInitiateHandover,
  encodeSwapOwner,
  messageHashFor,
  parseRockId,
  pimlicoApiKey,
  pimlicoRpcUrl,
  registryAddress,
  ROCK_ACCOUNT_SALT_NONCE,
  type SignedAttestation,
} from "@/lib/rock-account";
import { useAuth } from "@/context/auth-context";

export type { SignedAttestation } from "@/lib/rock-account";

export interface RockActionsAvailability {
  registry: Capability<Address>;
  accountAbstraction: Capability<true>;
  relayer: Capability<true>;
}

export interface UseRockActions {
  awaken(
    rockId: string,
    attestation: SignedAttestation,
  ): Promise<Capability<{ txHash: Hex; smartAccount: Address }>>;
  initiateHandover(
    rockId: string,
    recipient: Address | null,
    expiresAt: number,
    message?: string,
  ): Promise<Capability<{ txHash: Hex }>>;
  claimHandover(rockId: string, attestation: SignedAttestation): Promise<Capability<{ txHash: Hex }>>;
  cancelHandover(rockId: string): Promise<Capability<{ txHash: Hex }>>;
  archiveRock(rockId: string): Promise<Capability<{ txHash: Hex }>>;
  isPending: boolean;
  availability: RockActionsAvailability;
}

const SIGNED_OUT_REASON = "Sign in to act on this rock";

/* -------------------------------------------------------------------------- */
/* Smart account plumbing                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The slice of the smart account client this hook uses.
 *
 * Declared here rather than inferred from `createSmartAccountClient`, whose return type is generic
 * over an account that may be undefined: at every call site below the account exists, and stating
 * that once is clearer than asserting it at each use.
 */
interface RockAccountClient {
  account: { address: Address; signUserOperation: (op: never) => Promise<Hex> };
  sendTransaction: (args: { to: Address; data: Hex; value: bigint }) => Promise<Hex>;
  prepareUserOperation: (args: {
    calls: { to: Address; data: Hex; value: bigint }[];
  }) => Promise<Record<string, unknown>>;
}

type SmartAccountClient = RockAccountClient;

async function buildSmartAccountClient(params: {
  provider: unknown;
  ownerAddress: Address;
}): Promise<Capability<RockAccountClient>> {
  const key = pimlicoApiKey();
  if (key.state === "UNAVAILABLE") return unavailable(key.reason);

  const bundlerUrl = pimlicoRpcUrl(key.value);

  try {
    // The Privy embedded wallet is the Safe's owner and its only signer.
    const owner = createWalletClient({
      account: params.ownerAddress,
      chain,
      transport: custom(params.provider as Parameters<typeof custom>[0]),
    });

    const publicClient = (await import("viem")).createPublicClient({
      chain,
      transport: http(),
    });

    const account = await toSafeSmartAccount({
      client: publicClient,
      owners: [owner],
      version: "1.4.1",
      entryPoint: { address: ENTRY_POINT_07_ADDRESS, version: "0.7" },
      saltNonce: ROCK_ACCOUNT_SALT_NONCE,
    });

    const paymaster = createPimlicoClient({
      transport: http(bundlerUrl),
      entryPoint: { address: ENTRY_POINT_07_ADDRESS, version: "0.7" },
    });

    const client = createSmartAccountClient({
      account,
      chain,
      bundlerTransport: http(bundlerUrl),
      paymaster,
      userOperation: {
        estimateFeesPerGas: async () => (await paymaster.getUserOperationGasPrice()).fast,
      },
    });

    return real(client as unknown as RockAccountClient);
  } catch (err) {
    return unavailable(
      `The Rock Account could not be prepared: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Serialises a prepared UserOperation for storage and later JSON-RPC submission. */
function serialiseUserOp(userOp: Record<string, unknown>, signature: Hex): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(userOp)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "bigint") out[key] = toHex(value);
    else if (typeof value === "string") out[key] = value;
    else if (typeof value === "number") out[key] = toHex(value);
  }
  out.signature = signature;
  return out;
}

/* -------------------------------------------------------------------------- */
/* Hook                                                                        */
/* -------------------------------------------------------------------------- */

export function useRockActions(): UseRockActions {
  const { wallets } = useWallets();
  const { authenticated, address, getAccessToken } = useAuth();
  const [isPending, setIsPending] = useState(false);

  const registry = useMemo(() => registryAddress(), []);
  const accountAbstraction = useMemo<Capability<true>>(() => {
    const key = pimlicoApiKey();
    return key.state === "UNAVAILABLE" ? unavailable(key.reason) : real(true);
  }, []);

  // The relayer key is server-side; this asks the server whether relaying is configured. The
  // endpoint discloses only the capability state and a reason — never the key or its address.
  const relayerQuery = useQuery({
    queryKey: ["relayer-availability"],
    queryFn: async (): Promise<Capability<true>> => {
      const res = await fetch("/api/relayer");
      const body = (await res.json()) as { state?: string; reason?: string };
      return body.state === "REAL"
        ? real(true)
        : unavailable(body.reason ?? "Claims cannot be relayed");
    },
    staleTime: 60_000,
    retry: false,
  });

  const availability: RockActionsAvailability = {
    registry,
    accountAbstraction,
    relayer: relayerQuery.data ?? unavailable("Checking whether claims can be relayed…"),
  };

  const activeWallet = useMemo(() => {
    if (!authenticated || !address) return null;
    const lowered = address.toLowerCase();
    return (
      wallets.find((wallet) => wallet.address.toLowerCase() === lowered) ?? wallets[0] ?? null
    );
  }, [wallets, authenticated, address]);

  /** Builds the signed-in user's smart account client, or explains why it cannot. */
  const smartAccountFor = useCallback(
    async (): Promise<Capability<SmartAccountClient>> => {
      if (!authenticated || !activeWallet) return unavailable(SIGNED_OUT_REASON);
      const provider = await activeWallet.getEthereumProvider();
      return buildSmartAccountClient({
        provider,
        ownerAddress: getAddress(activeWallet.address),
      });
    },
    [authenticated, activeWallet],
  );

  /** Runs one registry call as a sponsored UserOperation from the Rock Account. */
  const sendFromRockAccount = useCallback(
    async (
      rockId: string,
      data: Hex,
    ): Promise<Capability<{ txHash: Hex; smartAccount: Address }>> => {
      const id = parseRockId(rockId);
      if (id === null) return unavailable(`"${rockId}" is not a rock id`);
      if (registry.state === "UNAVAILABLE") return unavailable(registry.reason);

      const clientCapability = await smartAccountFor();
      if (clientCapability.state === "UNAVAILABLE") return unavailable(clientCapability.reason);
      const client = clientCapability.value;

      try {
        const txHash = await client.sendTransaction({
          to: registry.value,
          data,
          value: BigInt(0),
        });

        return real({ txHash, smartAccount: getAddress(client.account.address) });
      } catch (err) {
        return unavailable(
          `The operation was not accepted: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
    [registry, smartAccountFor],
  );

  const withPending = useCallback(
    async <T>(run: () => Promise<Capability<T>>): Promise<Capability<T>> => {
      setIsPending(true);
      try {
        return await run();
      } finally {
        setIsPending(false);
      }
    },
    [],
  );

  const awaken = useCallback(
    (rockId: string, attestation: SignedAttestation) =>
      withPending(async () => {
        const id = parseRockId(rockId);
        if (id === null) return unavailable(`"${rockId}" is not a rock id`);
        if (!authenticated || !activeWallet) return unavailable(SIGNED_OUT_REASON);

        // The attestation names the wallet the tap authorises. If it does not name the wallet
        // that is signed in, the rock would be credited to someone else — refuse rather than
        // send a transaction whose outcome contradicts what the user was shown.
        const clientCapability = await smartAccountFor();
        if (clientCapability.state === "UNAVAILABLE") return unavailable(clientCapability.reason);
        const client = clientCapability.value;
        const smartAccount = getAddress(client.account.address);

        // The registry requires `att.smartAccount == smartAccount` and credits `att.subject`, so
        // both are checked here against what is actually about to be submitted.
        const check = checkAwakenAttestation(attestation, {
          signedInAddress: activeWallet.address,
          smartAccount,
          rockId,
        });
        if (check.state === "UNAVAILABLE") return unavailable(check.reason);

        if (registry.state === "UNAVAILABLE") return unavailable(registry.reason);

        try {
          const txHash = await client.sendTransaction({
            to: registry.value,
            data: encodeAwaken(id, smartAccount, attestation),
            value: BigInt(0),
          });

          // Record the tag -> rock binding so a later tap can be routed without a chain read.
          void bindTag(rockId, attestation.message.uidHash, await getAccessToken());

          return real({ txHash, smartAccount });
        } catch (err) {
          return unavailable(
            `The rock was not awakened: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }),
    [withPending, authenticated, activeWallet, smartAccountFor, registry, getAccessToken],
  );

  const initiateHandover = useCallback(
    (rockId: string, recipient: Address | null, expiresAt: number, message?: string) =>
      withPending(async () => {
        const id = parseRockId(rockId);
        if (id === null) return unavailable(`"${rockId}" is not a rock id`);
        if (!Number.isInteger(expiresAt) || expiresAt * 1000 <= Date.now()) {
          return unavailable("The handover expiry must be in the future");
        }

        const messageHash = messageHashFor(message);
        const result = await sendFromRockAccount(
          rockId,
          encodeInitiateHandover(id, recipient, expiresAt, messageHash),
        );
        if (result.state === "UNAVAILABLE") return unavailable(result.reason);

        const token = await getAccessToken();

        // The gift message itself never goes on chain — only its hash does. Store the plaintext
        // so the recipient can read it after claiming.
        if (message && message.trim() !== "") {
          void storeHandoverMessage(rockId, messageHash, message.trim(), token);
        }

        // Flow E step 7: pre-sign the Safe owner swap now, while the giver is online and still
        // owns the Safe. Only possible for a named recipient; an open handover has no address to
        // sign for, and the registry claim still works without it.
        if (recipient && activeWallet) {
          void storeOwnerSwapUserOp({
            rockId,
            recipient,
            currentOwner: getAddress(activeWallet.address),
            smartAccount: result.value.smartAccount,
            build: () => smartAccountFor(),
            token,
          });
        }

        return real({ txHash: result.value.txHash });
      }),
    [withPending, sendFromRockAccount, getAccessToken, activeWallet, smartAccountFor],
  );

  const claimHandover = useCallback(
    (rockId: string, attestation: SignedAttestation) =>
      withPending(async (): Promise<Capability<{ txHash: Hex }>> => {
        const id = parseRockId(rockId);
        if (id === null) return unavailable(`"${rockId}" is not a rock id`);

        try {
          const res = await fetch(`/api/rocks/${encodeURIComponent(rockId)}/claim`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ attestation }),
          });
          const body = (await res.json()) as {
            state?: string;
            reason?: string;
            txHash?: Hex;
          };
          if (body.state === "REAL" && body.txHash) {
            return real({ txHash: body.txHash });
          }
          return unavailable(body.reason ?? "The claim was not completed");
        } catch (err) {
          return unavailable(
            `The claim could not be submitted: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }),
    [withPending],
  );

  const cancelHandover = useCallback(
    (rockId: string) =>
      withPending(async (): Promise<Capability<{ txHash: Hex }>> => {
        const id = parseRockId(rockId);
        if (id === null) return unavailable(`"${rockId}" is not a rock id`);
        const result = await sendFromRockAccount(rockId, encodeCancelHandover(id));
        if (result.state === "UNAVAILABLE") return unavailable(result.reason);
        // A cancelled gift must not leave a live owner-swap operation behind.
        void discardOwnerSwapUserOp(rockId, await getAccessToken());
        return real({ txHash: result.value.txHash });
      }),
    [withPending, sendFromRockAccount, getAccessToken],
  );

  const archiveRock = useCallback(
    (rockId: string) =>
      withPending(async (): Promise<Capability<{ txHash: Hex }>> => {
        const id = parseRockId(rockId);
        if (id === null) return unavailable(`"${rockId}" is not a rock id`);
        const result = await sendFromRockAccount(rockId, encodeArchiveRock(id));
        if (result.state === "UNAVAILABLE") return unavailable(result.reason);
        // Archiving releases the tag on chain; release it off chain too.
        void unbindTag(rockId, await getAccessToken());
        return real({ txHash: result.value.txHash });
      }),
    [withPending, sendFromRockAccount, getAccessToken],
  );

  return {
    awaken,
    initiateHandover,
    claimHandover,
    cancelHandover,
    archiveRock,
    isPending,
    availability,
  };
}

/* -------------------------------------------------------------------------- */
/* Side-channel writes                                                         */
/*                                                                             */
/* None of these can fail the on-chain action that preceded it: the rock has    */
/* already changed state on chain, and a failed bookkeeping write must not be   */
/* reported to the user as a failed transaction. They log and move on.          */
/* -------------------------------------------------------------------------- */

async function post(path: string, body: unknown, token: string | null): Promise<boolean> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function bindTag(rockId: string, uidHash: Hex, token: string | null) {
  await post(`/api/rocks/${encodeURIComponent(rockId)}/bind`, { uidHash }, token);
}

async function unbindTag(rockId: string, token: string | null) {
  await post(`/api/rocks/${encodeURIComponent(rockId)}/bind`, { release: true }, token);
}

async function storeHandoverMessage(
  rockId: string,
  messageHash: Hex,
  message: string,
  token: string | null,
) {
  await post(
    `/api/rocks/${encodeURIComponent(rockId)}/handover-message`,
    { messageHash, message },
    token,
  );
}

async function discardOwnerSwapUserOp(rockId: string, token: string | null) {
  await post(`/api/rocks/${encodeURIComponent(rockId)}/pending-userop`, { discard: true }, token);
}

/**
 * Prepares and signs the Safe owner swap, then stores it for the claim route.
 *
 * UNTESTED against a live bundler: it needs a Pimlico key and a deployed registry, neither of
 * which exists in this environment. The failure mode is contained — the gift itself is already on
 * chain, and a missing owner swap leaves the Safe with its old owner, which the recipient sees as
 * "the rock is yours, its account is still being handed over" rather than as a lost asset.
 */
async function storeOwnerSwapUserOp(params: {
  rockId: string;
  recipient: Address;
  currentOwner: Address;
  smartAccount: Address;
  build: () => Promise<Capability<SmartAccountClient>>;
  token: string | null;
}) {
  try {
    const clientCapability = await params.build();
    if (clientCapability.state === "UNAVAILABLE") return;
    const client = clientCapability.value;

    const prepared = await client.prepareUserOperation({
      calls: [
        {
          to: params.smartAccount,
          data: encodeSwapOwner(params.currentOwner, params.recipient),
          value: BigInt(0),
        },
      ],
    });

    const signature = await client.account.signUserOperation(prepared as never);

    await post(
      `/api/rocks/${encodeURIComponent(params.rockId)}/pending-userop`,
      {
        kind: "swap_owner",
        recipient: params.recipient,
        userOp: serialiseUserOp(prepared, signature),
      },
      params.token,
    );
  } catch {
    // Reported through the claim route, which says the owner swap is unavailable rather than
    // pretending it happened.
  }
}

/* -------------------------------------------------------------------------- */
/* Provenance                                                                  */
/* -------------------------------------------------------------------------- */

export interface OnchainIndexedEvent {
  id: string;
  type:
    | "awakened"
    | "handover_initiated"
    | "handover_claimed"
    | "handover_cancelled"
    | "archived"
    | "marked_lost"
    | "lost_cleared";
  title: string;
  description: string;
  detail?: string;
  txHash?: Hex;
  blockNumber: string;
  logIndex: number;
  timestamp: string;
  timestampEpoch: number;
}

/**
 * A rock's indexed provenance.
 *
 * An empty list with no reason means the chain holds no events for this rock. A reason means the
 * history could not be read at all — the two are never conflated (D-013).
 */
export function useRockOnchainEvents(rockId: string | number | undefined) {
  const enabled = rockId !== undefined && rockId !== "new";

  const query = useQuery({
    queryKey: ["rock-events", String(rockId ?? "")],
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: false,
    queryFn: async (): Promise<{ events: OnchainIndexedEvent[]; reason: string | null }> => {
      const res = await fetch(`/api/events?rockId=${encodeURIComponent(String(rockId))}`);
      const data = (await res.json()) as {
        state?: string;
        reason?: string;
        events?: OnchainIndexedEvent[];
      };
      if (data.state === "REAL" && Array.isArray(data.events)) {
        return { events: data.events, reason: null };
      }
      return { events: [], reason: data.reason ?? "Provenance is unavailable" };
    },
  });

  return {
    events: query.data?.events ?? [],
    isLoading: query.isPending && enabled,
    unavailableReason: query.data?.reason ?? (query.error ? "Provenance could not be loaded" : null),
    refetch: () => query.refetch(),
  };
}

export { registryAddress, REGISTRY_UNAVAILABLE_REASON } from "@/lib/rock-account";
