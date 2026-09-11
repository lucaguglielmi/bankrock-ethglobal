"use client";

import { useReadContract, useWriteContract } from "wagmi";

// TODO: Replace with actual deployed ABI and address
const BANK_ROCK_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

const BANK_ROCK_ADDRESS = "0x0000000000000000000000000000000000000000";

export function useBankRockBalance(address: `0x${string}` | undefined) {
  return useReadContract({
    address: BANK_ROCK_ADDRESS,
    abi: BANK_ROCK_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });
}

export function useBankRockActions() {
  const { writeContractAsync, isPending } = useWriteContract();

  // Scaffolded write actions for future integration
  const lockFunds = async (amount: bigint) => {
    // await writeContractAsync({ ... })
    console.log("Mock lock funds", amount);
  };

  return { lockFunds, isPending };
}
