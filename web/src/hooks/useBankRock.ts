"use client";

import { useEffect, useState, useCallback } from "react";
import { useReadContract, useWriteContract, useWatchContractEvent } from "wagmi";
import { BANK_ROCK_REGISTRY_ABI, BANK_ROCK_REGISTRY_ADDRESS, AQUA_ADDRESSES } from "@/lib/contracts";
import { baseSepolia } from "viem/chains";

export function useRockOnchainState(rockId: string | number | undefined) {
  const numericId = rockId !== undefined ? BigInt(rockId) : undefined;

  return useReadContract({
    address: BANK_ROCK_REGISTRY_ADDRESS,
    abi: BANK_ROCK_REGISTRY_ABI,
    functionName: "rocks",
    args: numericId !== undefined ? [numericId] : undefined,
    chainId: baseSepolia.id,
    query: {
      enabled: numericId !== undefined,
    },
  });
}

export function useRockStatusJSON(rockId: string | number | undefined) {
  const numericId = rockId !== undefined ? BigInt(rockId) : undefined;

  return useReadContract({
    address: BANK_ROCK_REGISTRY_ADDRESS,
    abi: BANK_ROCK_REGISTRY_ABI,
    functionName: "getRockStatusJSON",
    args: numericId !== undefined ? [numericId] : undefined,
    chainId: baseSepolia.id,
    query: {
      enabled: numericId !== undefined,
    },
  });
}

// Minimal ERC-20 ABI for balance inspection
const ERC20_BALANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export function useRockReserves(smartAccount: `0x${string}` | undefined) {
  const usdcQuery = useReadContract({
    address: AQUA_ADDRESSES.testUSDC,
    abi: ERC20_BALANCE_ABI,
    functionName: "balanceOf",
    args: smartAccount ? [smartAccount] : undefined,
    chainId: baseSepolia.id,
    query: {
      enabled: !!smartAccount,
    },
  });

  const wethQuery = useReadContract({
    address: AQUA_ADDRESSES.testWETH,
    abi: ERC20_BALANCE_ABI,
    functionName: "balanceOf",
    args: smartAccount ? [smartAccount] : undefined,
    chainId: baseSepolia.id,
    query: {
      enabled: !!smartAccount,
    },
  });

  return {
    usdcBalance: usdcQuery.data ? Number(usdcQuery.data) / 1e6 : undefined,
    wethBalance: wethQuery.data ? Number(wethQuery.data) / 1e18 : undefined,
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
    return await writeContractAsync({
      address: BANK_ROCK_REGISTRY_ADDRESS,
      abi: BANK_ROCK_REGISTRY_ABI,
      functionName: "awakenRock",
      args: [BigInt(rockId), smartAccount],
      chainId: baseSepolia.id,
    });
  };

  const transferOnchain = async (rockId: number | string, newOwner: `0x${string}`) => {
    return await writeContractAsync({
      address: BANK_ROCK_REGISTRY_ADDRESS,
      abi: BANK_ROCK_REGISTRY_ABI,
      functionName: "transferOwnership",
      args: [BigInt(rockId), newOwner],
      chainId: baseSepolia.id,
    });
  };

  return { awakenOnchain, transferOnchain, isPending, contractAddresses: AQUA_ADDRESSES };
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!rockId || rockId === "new") return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/events?rockId=${encodeURIComponent(rockId)}`);
      if (!res.ok) {
        throw new Error(`Events API responded with status ${res.status}`);
      }
      const data = await res.json();
      if (data.success && Array.isArray(data.events)) {
        setEvents(data.events);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load on-chain events";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [rockId]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Watch for live RockAwakened events
  useWatchContractEvent({
    address: BANK_ROCK_REGISTRY_ADDRESS,
    abi: BANK_ROCK_REGISTRY_ABI,
    eventName: "RockAwakened",
    chainId: baseSepolia.id,
    onLogs() {
      fetchEvents();
    },
  });

  // Watch for live RockOwnershipTransferred events
  useWatchContractEvent({
    address: BANK_ROCK_REGISTRY_ADDRESS,
    abi: BANK_ROCK_REGISTRY_ABI,
    eventName: "RockOwnershipTransferred",
    chainId: baseSepolia.id,
    onLogs() {
      fetchEvents();
    },
  });

  return {
    events,
    isLoading,
    error,
    refetch: fetchEvents,
  };
}
