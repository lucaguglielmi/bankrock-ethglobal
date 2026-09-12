"use client";

/**
 * Registry and reserve reads (C-10, D-015, D-020, D-023).
 *
 *  - `tradeOnchain` is gone. It hardcoded the 1inch v5 **mainnet** aggregation router address,
 *    labelled it "v6 on Base Sepolia", defaulted `routerPayload` to `"0x"`, and called
 *    `executeTrade` — the arbitrary-call primitive D-020 removes from the registry. Trading is UNAVAILABLE until the Aqua path exists (Phase 3): it
 *    executes from the Rock Account against Aqua, never through the registry;
 *  - every address comes from `lib/chain`; there is no literal in this file;
 *  - every read is gated on a configured registry address. With none, the hooks are disabled and
 *    the UI has nothing to render — which is the honest state, since the registry is not
 *    deployed (C-1);
 *  - the chain is Sepolia (D-023).
 */

import { useCallback, useEffect, useState } from "react";
import { useReadContract, useWriteContract, useWatchContractEvent } from "wagmi";
import { addresses, chain, tokens } from "@/lib/chain";
import { BANK_ROCK_REGISTRY_ABI } from "@/lib/chain/abi/registry";
import { ERC20_ABI } from "@/lib/chain/abi/erc20";

const registryAddress = addresses.registry;

/** Why the registry-backed capabilities are unavailable, or null when they are configured. */
export const registryUnavailableReason = registryAddress
  ? null
  : "NEXT_PUBLIC_REGISTRY_ADDRESS is not configured — the rock registry is not deployed yet";

/** Trading is not implemented against Aqua yet; there is no path to execute a swap (D-020). */
export const TRADING_UNAVAILABLE_REASON =
  "Trading is not available: the Aqua strategy path is not implemented yet";

export function useRockOnchainState(rockId: string | number | undefined) {
  const numericId = rockId !== undefined ? BigInt(rockId) : undefined;

  return useReadContract({
    address: registryAddress,
    abi: BANK_ROCK_REGISTRY_ABI,
    functionName: "rocks",
    args: numericId !== undefined ? [numericId] : undefined,
    chainId: chain.id,
    query: { enabled: Boolean(registryAddress) && numericId !== undefined },
  });
}

export function useRockStatusJSON(rockId: string | number | undefined) {
  const numericId = rockId !== undefined ? BigInt(rockId) : undefined;

  return useReadContract({
    address: registryAddress,
    abi: BANK_ROCK_REGISTRY_ABI,
    functionName: "getRockStatusJSON",
    args: numericId !== undefined ? [numericId] : undefined,
    chainId: chain.id,
    query: { enabled: Boolean(registryAddress) && numericId !== undefined },
  });
}

/** Actual ERC-20 balances held by a Rock Account. Virtual Aqua balances are a separate read. */
export function useRockReserves(smartAccount: `0x${string}` | undefined) {
  const usdcQuery = useReadContract({
    address: tokens.USDC.address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: smartAccount ? [smartAccount] : undefined,
    chainId: chain.id,
    query: { enabled: Boolean(tokens.USDC.address) && Boolean(smartAccount) },
  });

  const wethQuery = useReadContract({
    address: tokens.WETH.address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: smartAccount ? [smartAccount] : undefined,
    chainId: chain.id,
    query: { enabled: Boolean(tokens.WETH.address) && Boolean(smartAccount) },
  });

  return {
    usdcBalance:
      usdcQuery.data !== undefined
        ? Number(usdcQuery.data) / 10 ** tokens.USDC.decimals
        : undefined,
    wethBalance:
      wethQuery.data !== undefined
        ? Number(wethQuery.data) / 10 ** tokens.WETH.decimals
        : undefined,
    isLoading: usdcQuery.isLoading || wethQuery.isLoading,
    refetch: () => {
      usdcQuery.refetch();
      wethQuery.refetch();
    },
  };
}

export function useRockActions() {
  const { writeContractAsync, isPending } = useWriteContract();

  const awakenOnchain = async (rockId: number | string, smartAccount: `0x${string}`) => {
    if (!registryAddress) {
      throw new Error(registryUnavailableReason ?? "Registry unavailable");
    }
    return await writeContractAsync({
      address: registryAddress,
      abi: BANK_ROCK_REGISTRY_ABI,
      functionName: "awakenRock",
      args: [BigInt(rockId), smartAccount],
      chainId: chain.id,
    });
  };

  const transferOnchain = async (rockId: number | string, newOwner: `0x${string}`) => {
    if (!registryAddress) {
      throw new Error(registryUnavailableReason ?? "Registry unavailable");
    }
    return await writeContractAsync({
      address: registryAddress,
      abi: BANK_ROCK_REGISTRY_ABI,
      functionName: "transferOwnership",
      args: [BigInt(rockId), newOwner],
      chainId: chain.id,
    });
  };

  return {
    awakenOnchain,
    transferOnchain,
    isPending,
    registryAvailable: Boolean(registryAddress),
    registryUnavailableReason,
    tradingUnavailableReason: TRADING_UNAVAILABLE_REASON,
  };
}

export interface OnchainIndexedEvent {
  id: string;
  type: "awaken" | "transfer" | "trade" | "hardware";
  title: string;
  description: string;
  detail?: string;
  txHash?: `0x${string}`;
  blockNumber: string;
  logIndex: number;
  timestamp: string;
}

export function useRockOnchainEvents(rockId: string | number | undefined) {
  const [events, setEvents] = useState<OnchainIndexedEvent[]>([]);
  // Starts true: the first load is already in flight when the hook mounts, and nothing may be
  // set synchronously inside the effect below.
  const [isLoading, setIsLoading] = useState(true);
  const [unavailableReason, setUnavailableReason] = useState<string | null>(null);

  // No state is set before the first await: an effect may not set state synchronously.
  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`/api/events?rockId=${encodeURIComponent(String(rockId))}`);
      const data = (await res.json()) as {
        state?: string;
        reason?: string;
        events?: OnchainIndexedEvent[];
      };
      if (data.state === "REAL" && Array.isArray(data.events)) {
        setEvents(data.events);
        setUnavailableReason(null);
      } else {
        // No provenance is not "no events": say why it is missing.
        setEvents([]);
        setUnavailableReason(data.reason ?? "Provenance is unavailable");
      }
    } catch {
      setEvents([]);
      setUnavailableReason("Provenance could not be loaded");
    } finally {
      setIsLoading(false);
    }
  }, [rockId]);

  useEffect(() => {
    if (rockId === undefined || rockId === "new") return;
    let isMounted = true;
    const run = async () => {
      if (isMounted) {
        await fetchEvents();
      }
    };
    run();
    return () => {
      isMounted = false;
    };
  }, [rockId, fetchEvents]);

  useWatchContractEvent({
    address: registryAddress,
    abi: BANK_ROCK_REGISTRY_ABI,
    eventName: "RockAwakened",
    chainId: chain.id,
    enabled: Boolean(registryAddress),
    onLogs() {
      fetchEvents();
    },
  });

  useWatchContractEvent({
    address: registryAddress,
    abi: BANK_ROCK_REGISTRY_ABI,
    eventName: "RockOwnershipTransferred",
    chainId: chain.id,
    enabled: Boolean(registryAddress),
    onLogs() {
      fetchEvents();
    },
  });

  return {
    events,
    isLoading,
    unavailableReason,
    /** Retained for callers that render an error string. */
    error: unavailableReason,
    refetch: fetchEvents,
  };
}
