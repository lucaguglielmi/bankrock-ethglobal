import { toSafeSmartAccount } from "permissionless/accounts";
import { createPublicClient, http, fallback, encodeFunctionData } from "viem";
import { baseSepolia } from "viem/chains";
import { createPimlicoClient } from "permissionless/clients/pimlico";

// ERC-20 ABI subset
const erc20Abi = [
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  },
] as const;

// 1inch Aqua ABI subset
const aquaAbi = [
  {
    type: "function",
    name: "ship",
    inputs: [
      { name: "strategyHash", type: "bytes32" },
      { name: "bytecode", type: "bytes" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: fallback([
    http(process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org"),
    http("https://base-sepolia-rpc.publicnode.com"),
    http()
  ]),
});

import { logger } from "@/lib/telemetry";

const PIMLICO_API_KEY = process.env.PIMLICO_API_KEY || process.env.NEXT_PUBLIC_PIMLICO_API_KEY || "pim_testnet_key";
const PIMLICO_RPC = `https://api.pimlico.io/v2/84532/rpc?apikey=${PIMLICO_API_KEY}`;

// Dual Paymaster setup on Base Sepolia
export const verifyingPaymaster = createPimlicoClient({
  transport: http(PIMLICO_RPC),
});

export const erc20Paymaster = createPimlicoClient({
  transport: http(PIMLICO_RPC),
});

export async function createRockAccount(signer: Parameters<typeof toSafeSmartAccount>[0]["owners"][0]) {
  return await toSafeSmartAccount({
    client: publicClient,
    owners: [signer],
    version: "1.4.1",
  });
}

/**
 * Launches or rebalances a 1inch Aqua maker strategy atomically via ERC-4337 UserOperation.
 *
 * Batches:
 * 1. approve(aquaContract, amountA) on tokenA
 * 2. approve(aquaContract, amountB) on tokenB
 * 3. ship(strategyHash, bytecode) on 1inch Aqua Core
 *
 * Sponsored 100% via Pimlico Paymaster on Base Sepolia.
 */
export async function launchStrategy(
  smartAccountClient: { sendTransaction: (args: { calls: Array<{ to: `0x${string}`; data: `0x${string}`; value: bigint }> }) => Promise<`0x${string}`> },
  tokenA: `0x${string}`,
  tokenB: `0x${string}`,
  aquaContract: `0x${string}`,
  strategyHash: `0x${string}`,
  bytecode: `0x${string}`,
  amountA: bigint,
  amountB: bigint
) {
  const start = Date.now();
  logger.info("Executing atomic 1inch Aqua batch UserOperation", {
    action: "AQUA_LAUNCH_STRATEGY_START",
    aquaContract,
    strategyHash,
    tokenA,
    tokenB,
  });

  try {
    // Atomic UserOperation Batching
    const txHash = await smartAccountClient.sendTransaction({
      calls: [
        {
          to: tokenA,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [aquaContract, amountA],
          }),
          value: BigInt(0),
        },
        {
          to: tokenB,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [aquaContract, amountB],
          }),
          value: BigInt(0),
        },
        {
          to: aquaContract,
          data: encodeFunctionData({
            abi: aquaAbi,
            functionName: "ship",
            args: [strategyHash, bytecode],
          }),
          value: BigInt(0),
        },
      ],
    });

    const latencyMs = Date.now() - start;
    logger.info("1inch Aqua UserOperation submitted successfully", {
      action: "AQUA_LAUNCH_STRATEGY_SUCCESS",
      txHash,
      latencyMs,
    });

    return txHash;
  } catch (error) {
    const latencyMs = Date.now() - start;
    logger.error("1inch Aqua UserOperation failed", error, {
      action: "AQUA_LAUNCH_STRATEGY_FAILED",
      latencyMs,
    });
    throw error;
  }
}
