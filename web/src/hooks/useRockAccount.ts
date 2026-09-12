"use client";

/**
 * The Rock Account for one rock, and whether the signed-in wallet may act from it.
 *
 * Two different questions, answered here so the rest of the app never has to guess at either:
 *
 *  - **which account** holds this rock's money. For a rock that has been awakened that is
 *    whatever the registry reports as `rock.smartAccount` — read, never re-derived (D-037). Before
 *    the awakening there is no record to read, so it is the counterfactual address this wallet and
 *    this tag derive: a Safe 1.4.1 on EntryPoint 0.7 salted with `keccak256(uid)`, one account per
 *    physical rock per owner (D-029). That address is what the NFC verifier signs into the
 *    attestation, and `awakenRock(rockId, smartAccount, att, sig)` requires the two to agree.
 *  - **whether this wallet is behind it**, which is the account's own answer to `isOwner`, the
 *    same staticcall the registry's `_accountAnswersTo` makes. It is not a recomputed address, and
 *    it is deliberately not a derivation: after a gift the rock keeps the giver's Safe, whose only
 *    owner is now the recipient, and a recipient who re-derived would compute an empty stranger.
 *
 * Every answer is capability-shaped. An account that answers to somebody else is UNAVAILABLE with
 * that stated plainly — never a fabricated address and never a silent "no" (D-013).
 */

import { useQuery } from "@tanstack/react-query";
import { useWallets } from "@privy-io/react-auth";
import { getAddress, type Address } from "viem";
import { real, unavailable, type Capability } from "@/lib/demo";
import {
  computeRockAccountAddress,
  ownerActionAuthority,
  pimlicoApiKey,
  planRockAccount,
  readAccountAnswersTo,
  rockAccountSaltFor,
  SIGNED_OUT_REASON,
  type AccountAnswer,
  type RockAccountSource,
  type RockRecord,
} from "@/lib/rock-account";
import { useAuth } from "@/context/auth-context";

export interface UseRockAccountResult {
  /** The account that holds this rock's reserve. */
  address: Capability<Address>;
  /** Where that address came from. `null` while there is no address at all. */
  source: RockAccountSource | null;
  /**
   * REAL — carrying the account to send from — when the signed-in wallet may send this rock's
   * owner actions. UNAVAILABLE carries the reason to show instead of the buttons.
   */
  authority: Capability<Address>;
}

export const NO_TAG_REASON = "tap the rock first";

export function rockAccountQueryKey(owner: string | undefined, uidHash: string | undefined) {
  return ["rock-account", owner ?? "none", uidHash ?? "none"] as const;
}

export function accountAnswerQueryKey(account: string | undefined, wallet: string | undefined) {
  return ["rock-account-answer", account ?? "none", wallet ?? "none"] as const;
}

/**
 * Derives the Rock Account address for an owner and a tag.
 *
 * Exported so a server, a test or the verifier can compute the same address from the same inputs
 * without a React tree. It performs no transaction and deploys nothing. It is only ever the right
 * answer for a tag that has not awakened a rock yet (D-037).
 */
export async function deriveRockAccountAddress(params: {
  ownerAddress: Address;
  uidHash: `0x${string}`;
}): Promise<Capability<Address>> {
  let saltNonce: bigint;
  try {
    saltNonce = rockAccountSaltFor(params.uidHash);
  } catch (err) {
    return unavailable(err instanceof Error ? err.message : String(err));
  }
  return computeRockAccountAddress({ ownerAddress: params.ownerAddress, saltNonce });
}

export interface UseRockAccountParams {
  /** The registry record, from `useRock`. Absent while it is still being read. */
  record?: RockRecord | null;
  /** The tag, from a verified tap. Only needed before the rock has been awakened. */
  uidHash?: `0x${string}`;
}

export function useRockAccount(params: UseRockAccountParams = {}): UseRockAccountResult {
  const { record = null, uidHash } = params;
  const { wallets } = useWallets();
  const { authenticated, address } = useAuth();

  const wallet =
    authenticated && address
      ? (wallets.find((w) => w.address.toLowerCase() === address.toLowerCase()) ??
        wallets[0] ??
        null)
      : null;

  // The registry's account, when the rock has one. Nothing below re-derives it.
  const bound = planRockAccount({ record });
  const boundAccount = bound.state === "REAL" && bound.value.source === "registry"
    ? bound.value.smartAccount
    : undefined;

  // Derivation is only reached for a rock with no account on chain yet, and it needs a tag.
  const derivationEnabled = Boolean(wallet) && Boolean(uidHash) && boundAccount === undefined;

  const derivation = useQuery({
    queryKey: rockAccountQueryKey(wallet?.address, uidHash),
    enabled: derivationEnabled,
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<Capability<Address>> => {
      const key = pimlicoApiKey();
      if (key.state === "UNAVAILABLE") return unavailable(key.reason);
      return deriveRockAccountAddress({
        ownerAddress: getAddress(wallet!.address),
        uidHash: uidHash!,
      });
    },
  });

  // The account's own word on who is behind it. Re-read rather than cached forever: a gift changes
  // the answer without anything on this device changing.
  const answerQuery = useQuery({
    queryKey: accountAnswerQueryKey(boundAccount, wallet?.address),
    enabled: Boolean(boundAccount) && Boolean(wallet),
    // The same 15-second cadence `useRock` polls the registry on: a claim changes the Safe's owner
    // set without anything on this device changing, and the page must catch up on its own.
    staleTime: 15_000,
    refetchInterval: 15_000,
    retry: false,
    queryFn: async (): Promise<Capability<AccountAnswer>> =>
      readAccountAnswersTo(boundAccount, wallet!.address),
  });

  const derived = derivation.data?.state === "REAL" ? derivation.data.value : undefined;
  const plan = planRockAccount({ record, derived });

  /** Why there is no address, said once, in the order the conditions are actually met. */
  function addressReason(fallback: string): string {
    if (boundAccount !== undefined) return fallback;
    if (!wallet) return "Sign in to get a Rock Account";
    if (!uidHash) return NO_TAG_REASON;
    if (derivation.data?.state === "UNAVAILABLE") return derivation.data.reason;
    if (derivationEnabled) return "Deriving the Rock Account address…";
    return fallback;
  }

  const addressCapability: Capability<Address> =
    plan.state === "UNAVAILABLE"
      ? unavailable(addressReason(plan.reason))
      : real(plan.value.smartAccount);

  const authority: Capability<Address> = (() => {
    if (!record) return unavailable("Reading the registry…");
    if (!wallet) return unavailable(SIGNED_OUT_REASON);
    const answer = answerQuery.data;
    if (!answer) {
      // No answer yet: the account has not been asked, so nothing may be claimed about it.
      return unavailable(
        bound.state === "UNAVAILABLE"
          ? bound.reason
          : "Asking this rock's account whether it answers to you…",
      );
    }
    if (answer.state === "UNAVAILABLE") return unavailable(answer.reason);
    return ownerActionAuthority({ record, wallet: wallet.address, answer: answer.value });
  })();

  return {
    address: addressCapability,
    source: plan.state === "REAL" ? plan.value.source : null,
    authority,
  };
}
