import { createSmartAccountClient, createPaymaster } from "permissionless";
import { toSafeSmartAccount } from "permissionless/accounts";
import { createPublicClient, http, encodeFunctionData } from "viem";
import { baseSepolia } from "viem/chains";

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
  transport: http(),
});

// Dual Paymaster setup
export const verifyingPaymaster = createPaymaster({
  transport: http("https://api.pimlico.io/v2/84532/rpc?apikey=API_KEY"),
});

export const erc20Paymaster = createPaymaster({
  transport: http("https://api.pimlico.io/v2/84532/rpc?apikey=API_KEY"),
  // Context for ERC-20 paymaster would go here
});

export async function createRockAccount(signer: any) {
  return await toSafeSmartAccount({
    client: publicClient,
    owner: signer,
    version: "1.4.1",
  });
}

export async function launchStrategy(
  smartAccountClient: any,
  tokenA: `0x${string}`,
  tokenB: `0x${string}`,
  aquaContract: `0x${string}`,
  strategyHash: `0x${string}`,
  bytecode: `0x${string}`,
  amountA: bigint,
  amountB: bigint
) {
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
        value: 0n,
      },
      {
        to: tokenB,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [aquaContract, amountB],
        }),
        value: 0n,
      },
      {
        to: aquaContract,
        data: encodeFunctionData({
          abi: aquaAbi,
          functionName: "ship",
          args: [strategyHash, bytecode],
        }),
        value: 0n,
      },
    ],
  });

  return txHash;
}
