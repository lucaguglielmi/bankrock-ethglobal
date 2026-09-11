"use client";

import { useReadContract, useWriteContract } from "wagmi";
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
