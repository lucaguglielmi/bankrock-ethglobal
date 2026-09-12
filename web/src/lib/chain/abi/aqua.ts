/**
 * 1inch Aqua — the real interface (E-3).
 *
 * Source: github.com/1inch/aqua, `src/interfaces/IAqua.sol` and `src/Aqua.sol`, as recorded in
 * specs/16-environment-and-secrets.md §1.5 and specs/04-aqua-integration.md.
 *
 * The previous ABI in lib/aa.ts encoded `ship(bytes32 strategyHash, bytes bytecode)`, which does
 * not exist; every call would have reverted. Facts that follow from the real interface:
 *
 *  - the maker approves tokens to **Aqua itself**, once, for all strategies — not to the app;
 *  - `app` is an AquaApp implementation (our SwapVM router in Aqua mode, or the reference
 *    XYCSwap constant-product app), never Aqua;
 *  - `strategyHash = keccak256(strategy)` and a strategy is immutable once shipped;
 *  - `safeBalances` reports virtual balances; actual balances come from `ERC20.balanceOf`.
 *    Spec 04 requires the UI to show both and never to sum them.
 */
export const AQUA_ABI = [
  {
    type: "function",
    name: "ship",
    stateMutability: "nonpayable",
    inputs: [
      { name: "app", type: "address" },
      { name: "strategy", type: "bytes" },
      { name: "tokens", type: "address[]" },
      { name: "amounts", type: "uint256[]" },
    ],
    outputs: [{ name: "strategyHash", type: "bytes32" }],
  },
  {
    type: "function",
    name: "dock",
    stateMutability: "nonpayable",
    inputs: [
      { name: "app", type: "address" },
      { name: "strategyHash", type: "bytes32" },
      { name: "tokens", type: "address[]" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "rawBalances",
    stateMutability: "view",
    inputs: [
      { name: "maker", type: "address" },
      { name: "app", type: "address" },
      { name: "strategyHash", type: "bytes32" },
      { name: "token", type: "address" },
    ],
    outputs: [
      { name: "balance", type: "uint248" },
      { name: "tokensCount", type: "uint8" },
    ],
  },
  {
    type: "function",
    name: "safeBalances",
    stateMutability: "view",
    inputs: [
      { name: "maker", type: "address" },
      { name: "app", type: "address" },
      { name: "strategyHash", type: "bytes32" },
      { name: "token0", type: "address" },
      { name: "token1", type: "address" },
    ],
    outputs: [
      { name: "balance0", type: "uint256" },
      { name: "balance1", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "Shipped",
    inputs: [
      { name: "maker", type: "address", indexed: true },
      { name: "app", type: "address", indexed: true },
      { name: "strategyHash", type: "bytes32", indexed: true },
      { name: "strategy", type: "bytes", indexed: false },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "Docked",
    inputs: [
      { name: "maker", type: "address", indexed: true },
      { name: "app", type: "address", indexed: true },
      { name: "strategyHash", type: "bytes32", indexed: true },
    ],
    anonymous: false,
  },
] as const;
