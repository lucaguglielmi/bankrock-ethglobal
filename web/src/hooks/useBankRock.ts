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
import { real, unavailable, type Capability, env } from "@/lib/demo";
import {
  buildDockCalls,
  buildPushCalls,
  buildShipCalls,
  getAquaAddresses,
  readRockStreams,
  type TokenPairAmounts,
} from "@/lib/aqua";
import {
  approvalCalls,
  checkAwakenAttestation,
  encodeArchiveRock,
  encodeAwaken,
  encodeCancelHandover,
  encodeClearLost,
  encodeMarkLost,
  encodeInitiateHandover,
  encodeSwapOwner,
  messageHashFor,
  ownerActionAuthority,
  parseRockId,
  pimlicoApiKey,
  pimlicoRpcUrl,
  planRockAccount,
  readAccountAnswersTo,
  readAllowance,
  readRock,
  registryAddress,
  rockAccountSaltFor,
  SIGNED_OUT_REASON,
  type Call,
  type SignedAttestation,
} from "@/lib/rock-account";
import { useAuth } from "@/context/auth-context";
import { publicReasonWith } from "@/lib/errors";
import {
  handoverKeyFromPendingResponse,
  OPEN_GIFT_HAS_NO_KEY_REASON,
  UNCONFIRMED_HANDOVER_KEY_REASON,
  type HandoverKeyResult,
} from "@/lib/handover-key";
import { useDemoRock } from "@/demo/rock-420/context";
import {
  useDemoHandoverMessage,
  useDemoOnchainEvents,
  useDemoRockActions,
} from "@/demo/rock-420/hooks";

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
  /**
   * Flow E steps 1-3. One interaction, two things: the handover on chain, and the pre-signed Safe
   * owner swap the recipient cannot produce for themselves.
   *
   * `handoverKey` is the second one, confirmed against the server rather than assumed — a gift
   * whose key was not stored is refused by the claim route forever, so it is part of the success
   * condition and never a silent side effect.
   */
  initiateHandover(
    rockId: string,
    recipient: Address | null,
    expiresAt: number,
    message?: string,
  ): Promise<Capability<{ txHash: Hex; handoverKey: HandoverKeyResult }>>;
  /**
   * Signs and stores the hand-over key again for a gift that is **already on chain**.
   *
   * The repair path for `initiateHandover` returning a REAL receipt with an UNAVAILABLE
   * `handoverKey`. It never touches the registry: the handover is open, and opening it twice would
   * be a second transaction for an event that has already happened.
   */
  storeHandoverKey(rockId: string, recipient: Address): Promise<HandoverKeyResult>;
  claimHandover(rockId: string, attestation: SignedAttestation): Promise<Capability<{ txHash: Hex }>>;
  cancelHandover(rockId: string): Promise<Capability<{ txHash: Hex }>>;
  archiveRock(rockId: string): Promise<Capability<{ txHash: Hex }>>;
  /** Flow F: the owner's informational lost flag. It freezes nothing on chain. */
  markLost(rockId: string): Promise<Capability<{ txHash: Hex }>>;
  clearLost(rockId: string): Promise<Capability<{ txHash: Hex }>>;
  /** Opens a liquidity stream on Aqua. Deposits nothing: the reserve stays in the Rock Account. */
  shipStrategy(
    rockId: string,
    params: {
      usdcAmount: bigint;
      wethAmount: bigint;
      feeBps: number;
      streamIndex?: number;
    },
  ): Promise<Capability<{ txHash: Hex; strategyHash: Hex }>>;
  /** Closes one. Also moves no tokens — docking *is* the withdrawal (NOTES.md §4). */
  dockStrategy(rockId: string, streamIndex: number): Promise<Capability<{ txHash: Hex }>>;
  /**
   * Makes more of the rock available to a live stream — the only edit Aqua allows. `Aqua.push`
   * from the rock's own account: the virtual balance rises, no token moves, the fee is untouched.
   * Making *less* available is `dockStrategy`. UNAVAILABLE when the stream is not live.
   */
  topUpStrategy(
    rockId: string,
    params: { streamIndex: number; usdcAmount: bigint; wethAmount: bigint },
  ): Promise<Capability<{ txHash: Hex }>>;
  isPending: boolean;
  availability: RockActionsAvailability;
}

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
  /** The batch form: one signature, several calls, one transaction (D-012). */
  sendUserOperation: (args: { calls: Call[] }) => Promise<Hex>;
  waitForUserOperationReceipt: (args: { hash: Hex }) => Promise<{
    receipt: { transactionHash: Hex };
    success: boolean;
  }>;
  prepareUserOperation: (args: {
    calls: { to: Address; data: Hex; value: bigint }[];
  }) => Promise<Record<string, unknown>>;
}

type SmartAccountClient = RockAccountClient;

async function buildSmartAccountClient(params: {
  provider: unknown;
  ownerAddress: Address;
  /** `rockAccountSaltFor(uidHash)`: one account per physical rock, per owner. */
  saltNonce: bigint;
  /**
   * The account's address when it is already known — the registry's, for a rock that has been
   * awakened (D-037). Given it, `toSafeSmartAccount` stops predicting an address from the salt and
   * uses this one, which is the whole point: after a gift the Safe is the giver's derivation and
   * the recipient's wallet would predict a different, empty address. The factory arguments it
   * still computes are never used, because viem omits them for an account that has code — and an
   * awakened rock's account has executed at least its own awakening.
   */
  address?: Address;
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
      // A configured public endpoint beats viem's default, which is shared and rate-limited.
      transport: http(env.sepoliaRpcUrlPublic || undefined),
    });

    const account = await toSafeSmartAccount({
      client: publicClient,
      owners: [owner],
      version: "1.4.1",
      entryPoint: { address: ENTRY_POINT_07_ADDRESS, version: "0.7" },
      saltNonce: params.saltNonce,
      ...(params.address ? { address: params.address } : {}),
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
      publicReasonWith("The Rock Account could not be prepared", err),
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

/**
 * The demo rock's seam (`web/src/demo/rock-420`, DEMO-STATE.md S-5). Inside `DemoRockProvider`
 * for rock #420 every action mutates the browser's demo state and answers `DEMO` — no Safe is
 * built, no UserOperation is sent, no hash is returned. Everywhere else this is exactly
 * `useChainRockActions`. Both hooks run on every render, so hook order never changes.
 */
export function useRockActions(): UseRockActions {
  const demo = useDemoRock();
  const mock = useDemoRockActions();
  const chain = useChainRockActions(demo === null);
  return demo ? mock : chain;
}

function useChainRockActions(enabled: boolean): UseRockActions {
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
    enabled,
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

  /**
   * Builds the Rock Account client for one tag, by **derivation**.
   *
   * The salt is the tag's own hash, so the address is bound to a physical rock rather than to the
   * user in general (spec 03, D-005, D-029). This is the awakening path and only the awakening
   * path: it predicts an account that does not exist yet, which is exactly what the attestation
   * names. For a rock that is already on chain the account is read from the registry instead
   * (D-037) — see `ownerClientFor`.
   */
  const derivedAccountFor = useCallback(
    async (uidHash: `0x${string}`): Promise<Capability<SmartAccountClient>> => {
      if (!authenticated || !activeWallet) return unavailable(SIGNED_OUT_REASON);

      let saltNonce: bigint;
      try {
        saltNonce = rockAccountSaltFor(uidHash);
      } catch (err) {
        return unavailable(err instanceof Error ? err.message : String(err));
      }

      const provider = await activeWallet.getEthereumProvider();
      return buildSmartAccountClient({
        provider,
        ownerAddress: getAddress(activeWallet.address),
        saltNonce,
      });
    },
    [authenticated, activeWallet],
  );

  /**
   * Builds the client for a rock that already exists on chain (D-037).
   *
   * The account is the registry's `rock.smartAccount`, taken as read. It is never re-derived,
   * because after a gift a derivation is wrong by construction: `claimHandover` rebinds the rock
   * to the Safe the giver derived and swaps its owner to the recipient (D-032), so the recipient's
   * own derivation is a different, empty address. An app that insisted on the derived address made
   * every owner action unreachable for the new owner of every gifted rock.
   *
   * Authority is established by asking that account whether this wallet is one of its owners —
   * the same `isOwner` staticcall the registry's `_accountAnswersTo` makes — and by checking the
   * wallet against the owner the registry records. Both refusals carry the reason; neither
   * invents a state.
   */
  const ownerClientFor = useCallback(
    async (
      rockId: string,
    ): Promise<Capability<{ client: SmartAccountClient; smartAccount: Address }>> => {
      if (!authenticated || !activeWallet) return unavailable(SIGNED_OUT_REASON);

      const rock = await readRock(rockId);
      if (rock.state === "UNAVAILABLE") return unavailable(rock.reason);

      const plan = planRockAccount({ record: rock.value });
      if (plan.state === "UNAVAILABLE") return unavailable(plan.reason);

      const answer = await readAccountAnswersTo(plan.value.smartAccount, activeWallet.address);
      if (answer.state === "UNAVAILABLE") return unavailable(answer.reason);

      const authority = ownerActionAuthority({
        record: rock.value,
        wallet: activeWallet.address,
        answer: answer.value,
      });
      if (authority.state === "UNAVAILABLE") return unavailable(authority.reason);

      // The salt still travels: it is what the factory arguments would use if this account somehow
      // had no code, and a wrong salt there would deploy a stranger at a different address. The
      // explicit address is what the client actually sends from.
      let saltNonce: bigint;
      try {
        saltNonce = rockAccountSaltFor(rock.value.uidHash);
      } catch (err) {
        return unavailable(err instanceof Error ? err.message : String(err));
      }

      const provider = await activeWallet.getEthereumProvider();
      const clientCapability = await buildSmartAccountClient({
        provider,
        ownerAddress: getAddress(activeWallet.address),
        saltNonce,
        address: authority.value,
      });
      if (clientCapability.state === "UNAVAILABLE") return unavailable(clientCapability.reason);

      const built = getAddress(clientCapability.value.account.address);
      if (built !== authority.value) {
        return unavailable(
          "The Rock Account client was built for a different address than the registry holds",
        );
      }

      return real({ client: clientCapability.value, smartAccount: authority.value });
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

      const owner = await ownerClientFor(rockId);
      if (owner.state === "UNAVAILABLE") return unavailable(owner.reason);

      try {
        const txHash = await owner.value.client.sendTransaction({
          to: registry.value,
          data,
          value: BigInt(0),
        });

        return real({ txHash, smartAccount: owner.value.smartAccount });
      } catch (err) {
        return unavailable(
          publicReasonWith("The operation was not accepted", err),
        );
      }
    },
    [registry, ownerClientFor],
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
        // The salt is the tag, so the account this builds is the one that tag maps to for this
        // owner — the same derivation the verifier ran when it signed `att.smartAccount`.
        const clientCapability = await derivedAccountFor(attestation.message.uidHash);
        if (clientCapability.state === "UNAVAILABLE") return unavailable(clientCapability.reason);
        const client = clientCapability.value;
        const smartAccount = getAddress(client.account.address);

        // `awakenRock` requires `att.smartAccount == smartAccount`, so a disagreement here is a
        // transaction that reverts at best. It usually means the tap was verified for a different
        // wallet than the one signed in.
        if (smartAccount !== getAddress(attestation.message.smartAccount)) {
          return unavailable(
            "This tap names a different Rock Account than this wallet derives — tap the rock again while signed in",
          );
        }

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
          // Best effort, and never awaited: the tag→rock binding is a routing hint the next tap
          // can live without, while `getAccessToken` can prompt Privy on the phone — awaiting it
          // here left the button on "Awakening…" after the rock was already awake (2026-09-13).
          void getAccessToken()
            .then((token) => bindTag(rockId, attestation.message.uidHash, token))
            .catch(() => undefined);

          return real({ txHash, smartAccount });
        } catch (err) {
          return unavailable(
            publicReasonWith("The rock was not awakened", err),
          );
        }
      }),
    [withPending, authenticated, activeWallet, derivedAccountFor, registry, getAccessToken],
  );

  const initiateHandover = useCallback(
    (rockId: string, recipient: Address | null, expiresAt: number, message?: string) =>
      withPending(
        async (): Promise<Capability<{ txHash: Hex; handoverKey: HandoverKeyResult }>> => {
          const id = parseRockId(rockId);
          if (id === null) return unavailable(`"${rockId}" is not a rock id`);
          if (!Number.isInteger(expiresAt) || expiresAt * 1000 <= Date.now()) {
            return unavailable("The handover expiry must be in the future");
          }
          if (registry.state === "UNAVAILABLE") return unavailable(registry.reason);
          if (!authenticated || !activeWallet) return unavailable(SIGNED_OUT_REASON);

          // One client for both halves of the gift. It is the account the registry names, checked
          // against this wallet (D-037) — and re-reading it between the two halves would ask the
          // registry about a rock whose state the first half has just changed.
          const owner = await ownerClientFor(rockId);
          if (owner.state === "UNAVAILABLE") return unavailable(owner.reason);
          const { client, smartAccount } = owner.value;

          const messageHash = messageHashFor(message);
          let txHash: Hex;
          try {
            txHash = await client.sendTransaction({
              to: registry.value,
              data: encodeInitiateHandover(id, recipient, expiresAt, messageHash),
              value: BigInt(0),
            });
          } catch (err) {
            return unavailable(publicReasonWith("The gift was not created", err));
          }

          const token = await getAccessToken();

          // The gift message itself never goes on chain — only its hash does. Store the plaintext
          // so the recipient can read it. Bookkeeping: the gift is already on chain, and a failed
          // note must not be reported as a failed gift.
          if (message && message.trim() !== "") {
            void storeHandoverMessage(rockId, messageHash, message.trim(), token);
          }

          // Flow E step 3: pre-sign the Safe owner swap now, while the giver is online and still
          // owns the Safe. This is the one moment that signature can exist, and a gift without it
          // is refused by the claim route forever — so it is awaited, confirmed, and reported.
          const handoverKey = recipient
            ? await storeAndConfirmHandoverKey({
                rockId,
                recipient,
                currentOwner: getAddress(activeWallet.address),
                smartAccount,
                client,
                token,
              })
            : unavailable<{ confirmed: true }>(OPEN_GIFT_HAS_NO_KEY_REASON);

          return real({ txHash, handoverKey });
        },
      ),
    [
      withPending,
      registry,
      authenticated,
      activeWallet,
      ownerClientFor,
      getAccessToken,
    ],
  );

  /**
   * Repairs a gift whose hand-over key was never stored, without touching the registry.
   *
   * The handover itself is on chain and must not be opened twice — `initiateHandover` again would
   * be a second transaction for an event that has already happened, and on a rock that is already
   * `handover_pending` the registry would refuse it anyway. This re-prepares, re-signs and
   * re-stores only the Safe owner swap, and confirms it the same way.
   */
  const storeHandoverKey = useCallback(
    (rockId: string, recipient: Address) =>
      withPending(async (): Promise<HandoverKeyResult> => {
        if (!authenticated || !activeWallet) return unavailable(SIGNED_OUT_REASON);

        const owner = await ownerClientFor(rockId);
        if (owner.state === "UNAVAILABLE") return unavailable(owner.reason);

        return storeAndConfirmHandoverKey({
          rockId,
          recipient,
          currentOwner: getAddress(activeWallet.address),
          smartAccount: owner.value.smartAccount,
          client: owner.value.client,
          token: await getAccessToken(),
        });
      }),
    [withPending, authenticated, activeWallet, ownerClientFor, getAccessToken],
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
            publicReasonWith("The claim could not be submitted", err),
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
        void getAccessToken()
          .then((token) => discardOwnerSwapUserOp(rockId, token))
          .catch(() => undefined);
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
        void getAccessToken()
          .then((token) => unbindTag(rockId, token))
          .catch(() => undefined);
        return real({ txHash: result.value.txHash });
      }),
    [withPending, sendFromRockAccount, getAccessToken],
  );

  /**
   * Flow F. Informational on chain: it records what the owner says about the object and gates
   * nothing. The UI must not present it as a freeze.
   */
  const markLost = useCallback(
    (rockId: string) =>
      withPending(async (): Promise<Capability<{ txHash: Hex }>> => {
        const id = parseRockId(rockId);
        if (id === null) return unavailable(`"${rockId}" is not a rock id`);
        const result = await sendFromRockAccount(rockId, encodeMarkLost(id));
        if (result.state === "UNAVAILABLE") return unavailable(result.reason);
        return real({ txHash: result.value.txHash });
      }),
    [withPending, sendFromRockAccount],
  );

  const clearLost = useCallback(
    (rockId: string) =>
      withPending(async (): Promise<Capability<{ txHash: Hex }>> => {
        const id = parseRockId(rockId);
        if (id === null) return unavailable(`"${rockId}" is not a rock id`);
        const result = await sendFromRockAccount(rockId, encodeClearLost(id));
        if (result.state === "UNAVAILABLE") return unavailable(result.reason);
        return real({ txHash: result.value.txHash });
      }),
    [withPending, sendFromRockAccount],
  );

  /**
   * Opens a liquidity stream (spec 04, Phase 3).
   *
   * One sponsored batch from the Rock Account: the two approvals Aqua needs, then `ship`. Nothing
   * is deposited — after this the tokens are still in the rock's own wallet and what exists on
   * Aqua is an allowance keyed by `keccak256(strategy)` (NOTES.md §4).
   *
   * The approvals are allowance-aware because Circle's USDC reverts on a non-zero to non-zero
   * `approve`, and because `approve` *sets* rather than adds: a second stream over the same
   * reserve must approve the whole reserve, not its own slice, or it silently shrinks the first
   * stream's settleable size.
   */
  const shipStrategy = useCallback(
    (
      rockId: string,
      params: { usdcAmount: bigint; wethAmount: bigint; feeBps: number; streamIndex?: number },
    ) =>
      withPending(async (): Promise<Capability<{ txHash: Hex; strategyHash: Hex }>> => {
        if (parseRockId(rockId) === null) return unavailable(`"${rockId}" is not a rock id`);

        const owner = await ownerClientFor(rockId);
        if (owner.state === "UNAVAILABLE") return unavailable(owner.reason);
        const { client, smartAccount } = owner.value;

        const aqua = getAquaAddresses();
        if (aqua.state === "UNAVAILABLE") return unavailable(aqua.reason);

        const plan = buildShipCalls({
          maker: smartAccount,
          rockId,
          streamIndex: params.streamIndex ?? 0,
          feeBps: params.feeBps,
          usdcAmount: params.usdcAmount,
          wethAmount: params.wethAmount,
        });
        if (plan.state === "UNAVAILABLE") return unavailable(plan.reason);

        // The ship call is the last of the three the builder produced; the approvals in front of
        // it are rebuilt here against the allowances that actually exist on chain.
        const shipCall = plan.value.calls[plan.value.calls.length - 1] as Call;

        const approvals = await buildApprovals({
          owner: smartAccount,
          spender: aqua.value.aqua,
          wants: [
            { token: aqua.value.usdc, amount: params.usdcAmount },
            { token: aqua.value.weth, amount: params.wethAmount },
          ],
        });
        if (approvals.state === "UNAVAILABLE") return unavailable(approvals.reason);

        try {
          const userOpHash = await client.sendUserOperation({
            calls: [...approvals.value, shipCall],
          });
          const receipt = await client.waitForUserOperationReceipt({ hash: userOpHash });
          if (!receipt.success) {
            return unavailable("The strategy was not shipped: the operation reverted on chain");
          }
          return real({
            txHash: receipt.receipt.transactionHash,
            strategyHash: plan.value.strategyHash,
          });
        } catch (err) {
          return unavailable(
            publicReasonWith("The strategy was not shipped", err),
          );
        }
      }),
    [withPending, ownerClientFor],
  );

  /**
   * Closes a stream (Flow H).
   *
   * It returns nothing, because nothing was ever taken: docking zeroes the virtual balances and
   * the reserve was in the Rock Account the whole time. The UI must not promise an incoming
   * transfer (NOTES.md §4, §8.1). Docking is final — the strategy hash is burned.
   */
  const dockStrategy = useCallback(
    (rockId: string, streamIndex: number) =>
      withPending(async (): Promise<Capability<{ txHash: Hex }>> => {
        if (parseRockId(rockId) === null) return unavailable(`"${rockId}" is not a rock id`);

        const owner = await ownerClientFor(rockId);
        if (owner.state === "UNAVAILABLE") return unavailable(owner.reason);
        const { client, smartAccount } = owner.value;

        const aqua = getAquaAddresses();
        if (aqua.state === "UNAVAILABLE") return unavailable(aqua.reason);

        const live = await findShippedStream({
          rockId,
          maker: smartAccount,
          streamIndex,
          usdc: aqua.value.usdc,
          weth: aqua.value.weth,
          app: aqua.value.app,
        });
        if (live.state === "UNAVAILABLE") return unavailable(live.reason);

        const plan = buildDockCalls({ strategyHash: live.value.strategyHash });
        if (plan.state === "UNAVAILABLE") return unavailable(plan.reason);

        try {
          const userOpHash = await client.sendUserOperation({ calls: plan.value.calls as Call[] });
          const receipt = await client.waitForUserOperationReceipt({ hash: userOpHash });
          if (!receipt.success) {
            return unavailable("The strategy was not docked: the operation reverted on chain");
          }
          return real({ txHash: receipt.receipt.transactionHash });
        } catch (err) {
          return unavailable(
            publicReasonWith("The strategy was not docked", err),
          );
        }
      }),
    [withPending, ownerClientFor],
  );

  /**
   * Makes more of the rock available to a live stream ("Edit" on the Liquidity tab).
   *
   * A strategy's bytes are immutable and a docked one can never be revived (NOTES.md §4), so the
   * fee cannot change and an allowance cannot be lowered short of `dock`. What can change is the
   * virtual balance, upwards: `Aqua.push(maker, app, strategyHash, token, amount)` may be called
   * by anyone and only ever adds. Called by the Rock Account itself its transfer is from the rock
   * to the rock — nothing moves — but it is a `transferFrom` with Aqua as spender, so it spends
   * the rock's allowance to Aqua, and the approvals in front of it are sized for that.
   *
   * One sponsored batch: allowance-aware approvals to Aqua, then one `push` per token added.
   */
  const topUpStrategy = useCallback(
    (
      rockId: string,
      params: { streamIndex: number; usdcAmount: bigint; wethAmount: bigint },
    ) =>
      withPending(async (): Promise<Capability<{ txHash: Hex }>> => {
        if (parseRockId(rockId) === null) return unavailable(`"${rockId}" is not a rock id`);
        if (params.usdcAmount < BigInt(0) || params.wethAmount < BigInt(0)) {
          return unavailable("A strategy cannot be topped up by a negative amount");
        }
        if (params.usdcAmount === BigInt(0) && params.wethAmount === BigInt(0)) {
          return unavailable("Enter an amount of USDC or WETH to make available");
        }

        const owner = await ownerClientFor(rockId);
        if (owner.state === "UNAVAILABLE") return unavailable(owner.reason);
        const { client, smartAccount } = owner.value;

        const aqua = getAquaAddresses();
        if (aqua.state === "UNAVAILABLE") return unavailable(aqua.reason);

        // The stream must be live: `push` reverts `PushToNonActiveStrategyPrevented` otherwise,
        // and a docked stream's allowance can never come back (NOTES.md §4).
        const live = await findShippedStream({
          rockId,
          maker: smartAccount,
          streamIndex: params.streamIndex,
          usdc: aqua.value.usdc,
          weth: aqua.value.weth,
          app: aqua.value.app,
        });
        if (live.state === "UNAVAILABLE") return unavailable(live.reason);

        const plan = buildPushCalls({
          maker: smartAccount,
          strategyHash: live.value.strategyHash,
          usdcAmount: params.usdcAmount,
          wethAmount: params.wethAmount,
        });
        if (plan.state === "UNAVAILABLE") return unavailable(plan.reason);

        // Approve Aqua for `newVirtual + pushAmount` per token pushed, where
        // `newVirtual = virtual + pushAmount`. The push itself is `safeTransferFrom(rock, rock,
        // pushAmount)` with Aqua as spender, so it consumes `pushAmount` of this allowance as it
        // lands; what remains is exactly `newVirtual`, which is what the stream's pulls need to
        // settle the whole of what it now offers. Sizing the approval at `newVirtual` alone would
        // leave the allowance `pushAmount` short after the push, and the stream's executable
        // amount (`min(virtual, held, allowance)`) would fall below what it advertises.
        //
        // `buildApprovals` reads the allowance that exists and emits nothing when it already
        // covers this; a lower one is reset through zero, because Circle's USDC reverts on a
        // non-zero to non-zero `approve`.
        const wants: { token: Address; amount: bigint }[] = [];
        if (params.usdcAmount > BigInt(0)) {
          const newVirtual = live.value.virtual.usdc + params.usdcAmount;
          wants.push({ token: aqua.value.usdc, amount: newVirtual + params.usdcAmount });
        }
        if (params.wethAmount > BigInt(0)) {
          const newVirtual = live.value.virtual.weth + params.wethAmount;
          wants.push({ token: aqua.value.weth, amount: newVirtual + params.wethAmount });
        }

        const approvals = await buildApprovals({
          owner: smartAccount,
          spender: aqua.value.aqua,
          wants,
        });
        if (approvals.state === "UNAVAILABLE") return unavailable(approvals.reason);

        try {
          const userOpHash = await client.sendUserOperation({
            calls: [...approvals.value, ...(plan.value.calls as Call[])],
          });
          const receipt = await client.waitForUserOperationReceipt({ hash: userOpHash });
          if (!receipt.success) {
            return unavailable("The strategy was not changed: the operation reverted on chain");
          }
          return real({ txHash: receipt.receipt.transactionHash });
        } catch (err) {
          return unavailable(publicReasonWith("The strategy was not changed", err));
        }
      }),
    [withPending, ownerClientFor],
  );

  return {
    awaken,
    initiateHandover,
    storeHandoverKey,
    claimHandover,
    cancelHandover,
    archiveRock,
    markLost,
    clearLost,
    shipStrategy,
    dockStrategy,
    topUpStrategy,
    isPending,
    availability,
  };
}

/* -------------------------------------------------------------------------- */
/* Aqua helpers                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The approval calls a batch needs, built against the allowances that exist right now.
 *
 * Two rules, both of which bite only in production (`lib/rock-account.ts`, `approvalCalls`):
 * Circle's USDC reverts on a non-zero to non-zero `approve`, and `approve` sets rather than adds.
 * An allowance that already covers the amount produces no call at all.
 */
async function buildApprovals(params: {
  owner: Address;
  spender: Address;
  wants: { token: Address; amount: bigint }[];
}): Promise<Capability<Call[]>> {
  const calls: Call[] = [];

  for (const want of params.wants) {
    if (want.amount <= BigInt(0)) continue;

    const current = await readAllowance(want.token, params.owner, params.spender);
    if (current.state === "UNAVAILABLE") return unavailable(current.reason);

    // The allowance must cover the whole reserve, not this stream's slice: a second stream over
    // the same tokens shares one allowance (lib/aqua `ShipParams.approveUsdcAmount`).
    if (current.value >= want.amount) continue;

    calls.push(
      ...approvalCalls({
        token: want.token,
        spender: params.spender,
        currentAllowance: current.value,
        amount: want.amount,
      }),
    );
  }

  return real(calls);
}

/**
 * The live strategy at one stream index, found by probing — there is no stored hash anywhere
 * (NOTES.md §3).
 */
async function findShippedStream(params: {
  rockId: string;
  maker: Address;
  streamIndex: number;
  usdc: Address;
  weth: Address;
  app: Address;
}): Promise<Capability<{ strategyHash: Hex; feeBps: bigint; virtual: TokenPairAmounts }>> {
  const view = await readRockStreams({
    rockId: params.rockId,
    maker: params.maker,
    app: params.app,
  });
  if (view.state === "UNAVAILABLE") return unavailable(view.reason);

  const stream = view.value.streams.find(
    (candidate) => candidate.streamIndex === BigInt(params.streamIndex),
  );
  if (!stream) {
    return unavailable(`This rock has no live Aqua strategy at stream ${params.streamIndex}`);
  }

  return real({
    strategyHash: stream.strategyHash,
    feeBps: stream.feeBps,
    // The virtual balances as they stand, for a top-up to size its approvals against.
    virtual: stream.virtual,
  });
}

/* -------------------------------------------------------------------------- */
/* Side-channel writes                                                         */
/*                                                                             */
/* Bookkeeping — the tag binding, the gift note — cannot fail the on-chain      */
/* action that preceded it: the rock has already changed state on chain, and a  */
/* failed bookkeeping write must not be reported as a failed transaction.       */
/*                                                                             */
/* The hand-over key below is **not** bookkeeping, and treating it as such is   */
/* defect A2. It is the second half of the gift: without it the claim route     */
/* refuses the gift forever, so it is awaited, confirmed, and reported.         */
/* -------------------------------------------------------------------------- */

async function post(
  path: string,
  body: unknown,
  token: string | null,
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    // The route's own reason, when it wrote one. Every reason these routes emit is chosen from a
    // fixed set server-side (`lib/errors.ts`), so it is safe to show and it is the useful thing.
    const answer = (await res.json().catch(() => ({}))) as { reason?: unknown; error?: unknown };
    const reason =
      typeof answer.reason === "string"
        ? answer.reason
        : typeof answer.error === "string"
          ? answer.error
          : undefined;
    return { ok: false, reason };
  } catch {
    return { ok: false };
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
 * Prepares and signs the Safe owner swap, stores it, and confirms the server really has it
 * (Flow E step 3, defect A2).
 *
 * This used to be `void`-ed and to swallow every failure in a bare `catch {}`. Everything it can
 * fail at — no Pimlico key, a paymaster that will not sponsor, a wallet that will not sign, a 503
 * from the store — ended with the giver reading "The gift is waiting" and the claim route
 * refusing that gift forever, with the one person who could re-sign it already gone.
 *
 * So it is awaited, and "stored" is not taken on trust: the POST's 200 says the row was written,
 * and the GET says the row is there and is **mine**. Only the second answer is allowed to read as
 * a gift that can be claimed.
 *
 * It never re-sends `initiateHandover`. The handover is on chain by the time this runs, and this
 * is the half that is missing.
 */
async function storeAndConfirmHandoverKey(params: {
  rockId: string;
  recipient: Address;
  currentOwner: Address;
  smartAccount: Address;
  client: SmartAccountClient;
  token: string | null;
}): Promise<HandoverKeyResult> {
  let userOp: Record<string, string>;
  try {
    const prepared = await params.client.prepareUserOperation({
      calls: [
        {
          to: params.smartAccount,
          data: encodeSwapOwner(params.currentOwner, params.recipient),
          value: BigInt(0),
        },
      ],
    });
    const signature = await params.client.account.signUserOperation(prepared as never);
    userOp = serialiseUserOp(prepared, signature);
  } catch (err) {
    return unavailable(publicReasonWith("The hand-over key was not signed", err));
  }

  const stored = await post(
    `/api/rocks/${encodeURIComponent(params.rockId)}/pending-userop`,
    { kind: "swap_owner", recipient: params.recipient, userOp },
    params.token,
  );
  if (!stored.ok) {
    return unavailable(
      stored.reason ?? "The hand-over key could not be stored, so it was not saved",
    );
  }

  return confirmHandoverKey(params.rockId, params.token);
}

/** Asks the server whether it holds this giver's hand-over key. The pure rule is `lib/handover-key`. */
async function confirmHandoverKey(
  rockId: string,
  token: string | null,
): Promise<HandoverKeyResult> {
  try {
    const res = await fetch(`/api/rocks/${encodeURIComponent(rockId)}/pending-userop`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const body = (await res.json().catch(() => ({}))) as Parameters<
      typeof handoverKeyFromPendingResponse
    >[1];
    return handoverKeyFromPendingResponse(res.ok, body);
  } catch {
    return unavailable(UNCONFIRMED_HANDOVER_KEY_REASON);
  }
}

/* -------------------------------------------------------------------------- */
/* The gift message                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The note the giver left with a gift (Flow E step 2, defect B2).
 *
 * Only `keccak256(message)` is on chain; the text is stored off chain against that hash. It was
 * stored and then shown nowhere — the only component that rendered it was a sheet that is mounted
 * on no page — so every gift message written in this app has so far been invisible to the person
 * it was written for.
 *
 * Reading it needs a Privy token, so this asks only when someone is signed in. An empty answer
 * with no reason means the gift carried no note; a reason means the note could not be read. The
 * two are never conflated (D-013).
 */
export interface UseHandoverMessageResult {
  message: string | null;
  isLoading: boolean;
  unavailableReason: string | null;
}

export function useHandoverMessage(
  rockId: string | undefined,
  enabled: boolean,
): UseHandoverMessageResult {
  // The demo rock's seam: its gift note lives in the browser, and no token-bearing read is made.
  const demo = useDemoRock();
  const mock = useDemoHandoverMessage();
  const server = useServerHandoverMessage(rockId, enabled && demo === null);
  return demo ? mock : server;
}

function useServerHandoverMessage(
  rockId: string | undefined,
  enabled: boolean,
): UseHandoverMessageResult {
  const { authenticated, getAccessToken } = useAuth();
  const active = Boolean(rockId) && rockId !== "new" && enabled && authenticated;

  const query = useQuery({
    queryKey: ["handover-message", String(rockId ?? "")],
    enabled: active,
    staleTime: 60_000,
    retry: false,
    queryFn: async (): Promise<{ message: string | null; reason: string | null }> => {
      const token = await getAccessToken();
      const res = await fetch(
        `/api/rocks/${encodeURIComponent(String(rockId))}/handover-message`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      const body = (await res.json().catch(() => ({}))) as {
        state?: string;
        message?: string | null;
        reason?: string;
      };
      if (res.ok && body.state === "REAL") {
        return { message: body.message ?? null, reason: null };
      }
      return { message: null, reason: body.reason ?? "The gift message could not be read" };
    },
  });

  return {
    message: query.data?.message ?? null,
    isLoading: active && query.isPending,
    unavailableReason:
      query.data?.reason ?? (query.error ? "The gift message could not be read" : null),
  };
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
export interface UseRockOnchainEventsResult {
  events: OnchainIndexedEvent[];
  isLoading: boolean;
  unavailableReason: string | null;
  refetch: () => Promise<unknown>;
}

export function useRockOnchainEvents(
  rockId: string | number | undefined,
): UseRockOnchainEventsResult {
  // The demo rock's seam: nothing about rock #420 is indexed, and the indexer is never asked.
  const demo = useDemoRock();
  const mock = useDemoOnchainEvents();
  const indexed = useIndexedRockEvents(rockId, demo === null);
  return demo ? mock : indexed;
}

function useIndexedRockEvents(
  rockId: string | number | undefined,
  allowed: boolean,
): UseRockOnchainEventsResult {
  const enabled = allowed && rockId !== undefined && rockId !== "new";

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
