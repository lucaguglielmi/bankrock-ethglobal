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
