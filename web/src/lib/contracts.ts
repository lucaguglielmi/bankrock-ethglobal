// BankRockRegistry ABI & Known Addresses
export const BANK_ROCK_REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_REGISTRY_ADDRESS ||
  "0x83B1A8a09f87258385698b9C433e143FDF2A9F52") as `0x${string}`;

export const BANK_ROCK_REGISTRY_ABI = [
  {
    type: "function",
    name: "awakenRock",
    stateMutability: "nonpayable",
    inputs: [
      { name: "rockId", type: "uint256" },
      { name: "smartAccount", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "transferOwnership",
    stateMutability: "nonpayable",
    inputs: [
      { name: "rockId", type: "uint256" },
      { name: "newOwner", type: "address" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "rocks",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "smartAccount", type: "address" },
      { name: "currentOwner", type: "address" },
      { name: "awakenedAt", type: "uint256" },
      { name: "isAwake", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "getRockStatusJSON",
    stateMutability: "view",
    inputs: [{ name: "rockId", type: "uint256" }],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "isAwakened",
    stateMutability: "view",
    inputs: [{ name: "rockId", type: "uint256" }],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "getRock",
    stateMutability: "view",
    inputs: [{ name: "rockId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "smartAccount", type: "address" },
          { name: "currentOwner", type: "address" },
          { name: "awakenedAt", type: "uint256" },
          { name: "isAwake", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "poke",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "event",
    name: "RockAwakened",
    inputs: [
      { name: "rockId", type: "uint256", indexed: true },
      { name: "owner", type: "address", indexed: true },
      { name: "smartAccount", type: "address", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RockOwnershipTransferred",
    inputs: [
      { name: "rockId", type: "uint256", indexed: true },
      { name: "previousOwner", type: "address", indexed: true },
      { name: "newOwner", type: "address", indexed: true },
    ],
  },
] as const;

// 1inch Aqua Protocol Official Addresses on Base Sepolia
export const AQUA_ADDRESSES = {
  // 1inch Aqua Core Engine
  aquaContract: "0x111111125421cA6dc452d289314280a0f8842A65" as `0x${string}`,
  // 1inch SwapVM Interpreter
  swapVmContract: "0x222222225421ca6dc452d289314280a0f8842a65" as `0x${string}`,
  // Testnet Token Pair
  testUSDC: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`, // Base Sepolia Official USDC
  testWETH: "0x4200000000000000000000000000000000000006" as `0x${string}`, // Base Sepolia WETH
};
