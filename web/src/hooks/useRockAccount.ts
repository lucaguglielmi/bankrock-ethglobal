"use client";

/**
 * The Rock Account address for one tag, for the signed-in user.
 *
 * A Safe 1.4.1 on EntryPoint 0.7 whose only owner is the user's Privy embedded wallet, salted with
 * the tag's own identity — `keccak256(uid)` — so there is one account per physical rock per owner
 * (spec 03, D-005). Two rocks held by the same person have two accounts and their balances never
 * pool.
 *
 * The address is *counterfactual*: it is a CREATE2 prediction from (owner, salt) and exists before
 * anything is deployed, which is what lets it be quoted to the NFC verifier at the moment of a
 * tap. The first sponsored UserOperation deploys it as a side effect of doing the work.
 *
 * The tap flow needs this because the attestation binds the account:
 * `awakenRock(rockId, smartAccount, att, sig)` requires `att.smartAccount == smartAccount`, so the
 * verifier has to sign the address before the awakening transaction is built. That is what stops a
 * relayer from awakening someone's rock into an account it controls.
 *
 * Without a `uidHash` there is no account to name: the salt is the tag, so an address cannot be
 * derived before the rock has been tapped. That is UNAVAILABLE with that reason — never a
 * placeholder address (D-013).
 */

import { useQuery } from "@tanstack/react-query";
import { useWallets } from "@privy-io/react-auth";
import { getAddress, type Address } from "viem";
import { real, unavailable, type Capability } from "@/lib/demo";
import { computeRockAccountAddress, pimlicoApiKey, rockAccountSaltFor } from "@/lib/rock-account";
import { useAuth } from "@/context/auth-context";

export interface UseRockAccountResult {
  address: Capability<Address>;
}

export const NO_TAG_REASON = "tap the rock first";

export function rockAccountQueryKey(owner: string | undefined, uidHash: string | undefined) {
  return ["rock-account", owner ?? "none", uidHash ?? "none"] as const;
}

/**
 * Derives the Rock Account address for an owner and a tag.
 *
 * Exported so a server, a test or the verifier can compute the same address from the same inputs
 * without a React tree. It performs no transaction and deploys nothing.
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

export function useRockAccount(uidHash?: `0x${string}`): UseRockAccountResult {
  const { wallets } = useWallets();
  const { authenticated, address } = useAuth();

  const wallet =
    authenticated && address
      ? (wallets.find((w) => w.address.toLowerCase() === address.toLowerCase()) ??
        wallets[0] ??
        null)
      : null;

  const query = useQuery({
    queryKey: rockAccountQueryKey(wallet?.address, uidHash),
    enabled: Boolean(wallet) && Boolean(uidHash),
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

  if (!authenticated || !wallet) {
    return { address: unavailable("Sign in to get a Rock Account") };
  }
  if (!uidHash) {
    return { address: unavailable(NO_TAG_REASON) };
  }
  if (query.data?.state === "REAL") {
    return { address: real(query.data.value) };
  }

  return {
    address: query.data ?? unavailable("Deriving the Rock Account address…"),
  };
}
