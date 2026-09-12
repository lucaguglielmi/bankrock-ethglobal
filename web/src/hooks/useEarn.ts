"use client";

/**
 * Savings through Privy Earn, from the signed-in user's embedded wallet (spec 20 Part 5).
 *
 * Every figure here is capability-shaped (D-013): the vault, the wallet, the position and the
 * spendable balance are each REAL or UNAVAILABLE with a reason, and nothing substitutes a value
 * for a missing one.
 *
 * A deposit or withdrawal is **signed by the user's own wallet before it leaves the browser**:
 * `generateAuthorizationSignature` signs the exact Privy request — URL, body and the two
 * `privy-` headers — with the user's authorization key, and the server forwards precisely that.
 * The server's app secret cannot move this money on its own, and neither can this hook without
 * the wallet's signature. The signed request carries an expiry and an idempotency key, so a
 * captured copy dies within minutes and a retried one cannot deposit twice.
 *
 * The one yield figure exposed is `earned`: what the vault has paid so far, in the asset, read
 * from Privy's position. There is no rate anywhere in this hook (D-004, D-033).
 */

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthorizationSignature } from "@privy-io/react-auth";
import { useReadContract } from "wagmi";
import { getAddress, isAddress, type Address } from "viem";
import { useAuth } from "@/context/auth-context";
import { chainFromCaip2, explorerFor, type Explorer } from "@/lib/chain";
import { ERC20_ABI } from "@/lib/chain/abi/erc20";
import { real, unavailable, type Capability } from "@/lib/demo";
import {
  earnActionUrl,
  earnedSoFar,
  isTerminalStatus,
  SIGNED_REQUEST_TTL_MS,
  type EarnAction,
  type EarnActionKind,
  type EarnPosition,
  type EarnVault,
  type SignedEarnRequest,
} from "@/lib/earn/shared";

const REFETCH_MS = 15_000;
const POLL_MS = 2_500;
const POLL_DEADLINE_MS = 120_000;

/* -------------------------------------------------------------------------- */
/* Wire types — the envelopes the /api/earn routes answer with                 */
/* -------------------------------------------------------------------------- */

interface UnavailableReply {
  state: "UNAVAILABLE";
  reason: string;
}

interface ErrorReply {
  error: string;
}

type Reply<T> = (T & { state: "REAL" }) | UnavailableReply | ErrorReply;

export interface EarnVaultView {
  vault: EarnVault;
  apiBase: string;
  appId: string;
}

export interface EarnWalletView {
  walletId: string;
  address: Address;
}

export interface EarnPositionView extends EarnPosition {
  /** Realised yield so far, in the asset's smallest unit. May be negative for a moment. */
  earned: bigint;
}

export interface EarnOutcome {
  action: EarnAction;
  /** Only when Privy reported a broadcast hash and the chain has a known explorer (D-014). */
  explorerHref?: string;
}

const SERVICE_UNREACHABLE = "The savings service could not be reached";

async function fetchReply<T>(input: string, init?: RequestInit): Promise<Reply<T>> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    return { state: "UNAVAILABLE", reason: SERVICE_UNREACHABLE };
  }
  try {
    return (await response.json()) as Reply<T>;
  } catch {
    return {
      state: "UNAVAILABLE",
      reason: response.ok ? SERVICE_UNREACHABLE : `The savings service answered ${response.status}`,
    };
  }
}

function toCapability<T>(reply: Reply<T>): Capability<T> {
  if ("error" in reply) return unavailable(reply.error);
  if (reply.state === "UNAVAILABLE") return unavailable(reply.reason);
  return real(reply);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* -------------------------------------------------------------------------- */
/* Query keys                                                                  */
/* -------------------------------------------------------------------------- */

export const earnKeys = {
  vault: ["earn-vault"] as const,
  wallet: (did: string | undefined) => ["earn-wallet", did ?? "none"] as const,
  position: (walletId: string | undefined) => ["earn-position", walletId ?? "none"] as const,
  history: (walletId: string | undefined) => ["earn-history", walletId ?? "none"] as const,
};

/* -------------------------------------------------------------------------- */
/* The hook                                                                    */
/* -------------------------------------------------------------------------- */

export interface UseEarnResult {
  vault: Capability<EarnVaultView>;
  wallet: Capability<EarnWalletView>;
  position: Capability<EarnPositionView>;
  /** The asset balance the wallet holds outside the vault, on the vault's chain. */
  balance: Capability<bigint>;
  history: Capability<EarnAction[]>;
  /** The vault's chain explorer, when this app knows one. */
  explorer?: Explorer;
  chainName?: string;
  isLoading: boolean;
  isPending: boolean;
  deposit: (rawAmount: bigint) => Promise<Capability<EarnOutcome>>;
  withdraw: (rawAmount: bigint) => Promise<Capability<EarnOutcome>>;
  refresh: () => void;
}

/**
 * Must be rendered inside `PrivyProvider` — i.e. only when sign-in is configured
 * (`useAuth().unavailable === false`). `SavingsCard` guards this; do not call it elsewhere.
 */
export function useEarn(): UseEarnResult {
  const { authenticated, user, getAccessToken } = useAuth();
  const { generateAuthorizationSignature } = useAuthorizationSignature();
  const queryClient = useQueryClient();
  const [isPending, setPending] = useState(false);
  const did = user?.id;

  const authHeaders = useCallback(async (): Promise<Record<string, string> | null> => {
    const token = await getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : null;
  }, [getAccessToken]);

  /* Vault ------------------------------------------------------------------ */
  const vaultQuery = useQuery({
    queryKey: earnKeys.vault,
    queryFn: async () => toCapability(await fetchReply<EarnVaultView>("/api/earn/vault")),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const vault: Capability<EarnVaultView> = vaultQuery.data ?? unavailable("Reading the vault…");

  /* Wallet ----------------------------------------------------------------- */
  const walletQuery = useQuery({
    queryKey: earnKeys.wallet(did),
    enabled: authenticated && vault.state === "REAL",
    queryFn: async (): Promise<Capability<EarnWalletView>> => {
      const headers = await authHeaders();
      if (!headers) return unavailable("Sign in again to see your savings");
      const reply = await fetchReply<{ wallet: { walletId: string; address: string } }>(
        "/api/earn/wallet",
        { headers },
      );
      const cap = toCapability(reply);
      if (cap.state === "UNAVAILABLE") return cap;
      const { walletId, address } = cap.value.wallet;
      if (!isAddress(address)) return unavailable("Privy described the wallet in an unexpected shape");
      return real({ walletId, address: getAddress(address) });
    },
    staleTime: 5 * 60_000,
    retry: false,
  });
  const wallet: Capability<EarnWalletView> = !authenticated
    ? unavailable("Sign in to see your savings")
    : vault.state === "UNAVAILABLE"
      ? unavailable(vault.reason)
      : (walletQuery.data ?? unavailable("Finding your wallet…"));
  const walletId = wallet.state === "REAL" ? wallet.value.walletId : undefined;

  /* Position --------------------------------------------------------------- */
  const positionQuery = useQuery({
    queryKey: earnKeys.position(walletId),
    enabled: Boolean(walletId),
    queryFn: async (): Promise<Capability<EarnPositionView>> => {
      const headers = await authHeaders();
      if (!headers || !walletId) return unavailable("Sign in again to see your savings");
      const reply = await fetchReply<{ position: EarnPosition; earned: string }>(
        `/api/earn/position?walletId=${encodeURIComponent(walletId)}`,
        { headers },
      );
      const cap = toCapability(reply);
      if (cap.state === "UNAVAILABLE") return cap;
      return real({ ...cap.value.position, earned: earnedSoFar(cap.value.position) });
    },
    refetchInterval: REFETCH_MS,
    staleTime: REFETCH_MS,
    retry: false,
  });
  const position: Capability<EarnPositionView> =
    wallet.state === "UNAVAILABLE"
      ? unavailable(wallet.reason)
      : (positionQuery.data ?? unavailable("Reading your position…"));

  /* History ---------------------------------------------------------------- */
  const historyQuery = useQuery({
    queryKey: earnKeys.history(walletId),
    enabled: Boolean(walletId),
    queryFn: async (): Promise<Capability<EarnAction[]>> => {
      const headers = await authHeaders();
      if (!headers || !walletId) return unavailable("Sign in again to see your savings");
      const reply = await fetchReply<{ actions: EarnAction[] }>(
        `/api/earn/history?walletId=${encodeURIComponent(walletId)}`,
        { headers },
      );
      const cap = toCapability(reply);
      return cap.state === "UNAVAILABLE" ? cap : real(cap.value.actions);
    },
    refetchInterval: REFETCH_MS,
    staleTime: REFETCH_MS,
    retry: false,
  });
  const history: Capability<EarnAction[]> =
    wallet.state === "UNAVAILABLE"
      ? unavailable(wallet.reason)
      : (historyQuery.data ?? unavailable("Reading your history…"));

  /* Balance on the vault's chain ------------------------------------------- */
  const vaultChain = vault.state === "REAL" ? chainFromCaip2(vault.value.vault.caip2) : undefined;
  const assetAddress =
    vault.state === "REAL" && isAddress(vault.value.vault.asset.address)
      ? getAddress(vault.value.vault.asset.address)
      : undefined;
  const walletAddress = wallet.state === "REAL" ? wallet.value.address : undefined;

  const balanceQuery = useReadContract({
    abi: ERC20_ABI,
    address: assetAddress,
    functionName: "balanceOf",
    args: walletAddress ? [walletAddress] : undefined,
    chainId: vaultChain?.id,
    query: {
      enabled: Boolean(assetAddress && walletAddress && vaultChain),
      refetchInterval: REFETCH_MS,
      staleTime: REFETCH_MS,
      retry: false,
    },
  });
  const balance: Capability<bigint> =
    wallet.state === "UNAVAILABLE"
      ? unavailable(wallet.reason)
      : !vaultChain
        ? unavailable("This app does not know the vault's chain")
        : balanceQuery.data !== undefined
          ? real(balanceQuery.data as bigint)
          : balanceQuery.isError
            ? unavailable(`The ${vaultChain.name} balance could not be read`)
            : unavailable("Reading the balance…");

  const explorer = vaultChain ? explorerFor(vaultChain.id) : undefined;

  /* Writes ----------------------------------------------------------------- */
  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: earnKeys.position(walletId) });
    queryClient.invalidateQueries({ queryKey: earnKeys.history(walletId) });
    balanceQuery.refetch();
  }, [queryClient, walletId, balanceQuery]);

  const submit = useCallback(
    async (kind: EarnActionKind, rawAmount: bigint): Promise<Capability<EarnOutcome>> => {
      if (vault.state === "UNAVAILABLE") return unavailable(vault.reason);
      if (wallet.state === "UNAVAILABLE") return unavailable(wallet.reason);
      if (rawAmount <= BigInt(0)) return unavailable("Enter an amount above zero");

      const headers = await authHeaders();
      if (!headers) return unavailable("Sign in again to continue");

      const { apiBase, appId } = vault.value;
      const { walletId: id } = wallet.value;
      const body = { vault_id: vault.value.vault.id, raw_amount: rawAmount.toString() };
      const url = earnActionUrl(apiBase, kind, id);
      const idempotencyKey = crypto.randomUUID();
      const requestExpiry = String(Date.now() + SIGNED_REQUEST_TTL_MS);

      setPending(true);
      try {
        let signature: string;
        try {
          ({ signature } = await generateAuthorizationSignature({
            version: 1,
            method: "POST",
            url,
            body,
            headers: {
              "privy-app-id": appId,
              "privy-idempotency-key": idempotencyKey,
              "privy-request-expiry": requestExpiry,
            },
          }));
        } catch {
          // Cancelled in the wallet, or the wallet cannot produce a user signature (the Privy
          // app is not on user-owned wallets — spec 20 Part 7 item 3). Nothing was sent.
          return unavailable("The wallet did not sign the request, so nothing was sent");
        }

        const request: SignedEarnRequest = {
          walletId: id,
          body,
          signature,
          idempotencyKey,
          requestExpiry,
        };
        const submitted = toCapability(
          await fetchReply<{ action: EarnAction }>(`/api/earn/${kind}`, {
            method: "POST",
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify(request),
          }),
        );
        if (submitted.state === "UNAVAILABLE") return submitted;

        let action = submitted.value.action;
        const deadline = Date.now() + POLL_DEADLINE_MS;
        while (!isTerminalStatus(action.status) && Date.now() < deadline) {
          await sleep(POLL_MS);
          const polled = toCapability(
            await fetchReply<{ action: EarnAction }>(
              `/api/earn/actions/${encodeURIComponent(action.id)}?walletId=${encodeURIComponent(id)}`,
              { headers },
            ),
          );
          if (polled.state === "REAL") action = polled.value.action;
        }

        refresh();

        if (action.status === "failed" || action.status === "rejected") {
          return unavailable(`Privy reported the ${kind} as ${action.status}; nothing moved`);
        }
        return real({
          action,
          explorerHref: action.txHash && explorer ? explorer.tx(action.txHash) : undefined,
        });
      } finally {
        setPending(false);
      }
    },
    [vault, wallet, authHeaders, generateAuthorizationSignature, refresh, explorer],
  );

  const deposit = useCallback((rawAmount: bigint) => submit("deposit", rawAmount), [submit]);
  const withdraw = useCallback((rawAmount: bigint) => submit("withdraw", rawAmount), [submit]);

  const isLoading =
    vaultQuery.isPending ||
    (authenticated && walletQuery.isPending && walletQuery.isFetching) ||
    (Boolean(walletId) && positionQuery.isPending && positionQuery.isFetching);

  return useMemo(
    () => ({
      vault,
      wallet,
      position,
      balance,
      history,
      explorer,
      chainName: vaultChain?.name,
      isLoading,
      isPending,
      deposit,
      withdraw,
      refresh,
    }),
    [
      vault,
      wallet,
      position,
      balance,
      history,
      explorer,
      vaultChain,
      isLoading,
      isPending,
      deposit,
      withdraw,
      refresh,
    ],
  );
}
