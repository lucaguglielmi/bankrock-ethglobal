"use client";

/**
 * The signed-in user's Rock Account address.
 *
 * A Safe 1.4.1 on EntryPoint 0.7 whose only owner is the user's Privy embedded wallet. The
 * address is *counterfactual*: it is derived from (owner, salt) and exists before anything is
 * deployed, so it can be quoted to the NFC verifier at the moment of a tap. The first sponsored
 * UserOperation deploys it as a side effect of doing the work.
 *
 * The tap flow needs this because the attestation binds the account:
 * `awakenRock(rockId, smartAccount, att, sig)` requires `att.smartAccount == smartAccount`, so the
 * verifier has to sign the address before the awakening transaction is built. That is what stops a
 * relayer from awakening someone's rock into an account it controls.
 *
 * UNAVAILABLE — never a placeholder address — when the user is signed out or account abstraction
 * is unconfigured (D-013).
 */

import { useQuery } from "@tanstack/react-query";
import { useWallets } from "@privy-io/react-auth";
import { createWalletClient, createPublicClient, custom, getAddress, http, type Address } from "viem";
import { toSafeSmartAccount } from "permissionless/accounts";
import { chain, ENTRY_POINT_07_ADDRESS } from "@/lib/chain";
import { real, unavailable, type Capability } from "@/lib/demo";
import { pimlicoApiKey, ROCK_ACCOUNT_SALT_NONCE } from "@/lib/rock-account";
import { useAuth } from "@/context/auth-context";

export interface UseRockAccountResult {
  address: Capability<Address>;
}

export function rockAccountQueryKey(owner: string | undefined) {
  return ["rock-account", owner ?? "none"] as const;
}

/**
 * Derives the Safe address for a Privy wallet.
 *
 * Exported so a server or a test can compute the same address from the same inputs without a
 * React tree. It performs no transaction and deploys nothing.
 */
export async function deriveRockAccountAddress(params: {
  provider: unknown;
  ownerAddress: Address;
}): Promise<Capability<Address>> {
  try {
    const owner = createWalletClient({
      account: params.ownerAddress,
      chain,
      transport: custom(params.provider as Parameters<typeof custom>[0]),
    });

    const account = await toSafeSmartAccount({
      client: createPublicClient({ chain, transport: http() }),
      owners: [owner],
      version: "1.4.1",
      entryPoint: { address: ENTRY_POINT_07_ADDRESS, version: "0.7" },
      saltNonce: ROCK_ACCOUNT_SALT_NONCE,
    });

    return real(getAddress(account.address));
  } catch (err) {
    return unavailable(
      `The Rock Account address could not be derived: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function useRockAccount(): UseRockAccountResult {
  const { wallets } = useWallets();
  const { authenticated, address } = useAuth();

  const wallet =
    authenticated && address
      ? (wallets.find((w) => w.address.toLowerCase() === address.toLowerCase()) ??
        wallets[0] ??
        null)
      : null;

  const query = useQuery({
    queryKey: rockAccountQueryKey(wallet?.address),
    enabled: Boolean(wallet),
    staleTime: Infinity,
    retry: false,
    queryFn: async (): Promise<Capability<Address>> => {
      const key = pimlicoApiKey();
      if (key.state === "UNAVAILABLE") return unavailable(key.reason);
      const provider = await wallet!.getEthereumProvider();
      return deriveRockAccountAddress({
        provider,
        ownerAddress: getAddress(wallet!.address),
      });
    },
  });

  if (!authenticated || !wallet) {
    return { address: unavailable("Sign in to get a Rock Account") };
  }

  return {
    address: query.data ?? unavailable("Deriving the Rock Account address…"),
  };
}
