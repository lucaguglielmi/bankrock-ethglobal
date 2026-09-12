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
  /* ------------------------------------------------------------------------ */
  /* Events                                                                     */
  /*                                                                            */
  /* No Aqua event parameter is `indexed` on the deployed contract               */
  /* (`src/interfaces/IAqua.sol`; contracts/aqua/NOTES.md §2 and §8.2). Every log */
  /* therefore has exactly one topic — the signature — and all four arguments    */
  /* live in `data`.                                                             */
  /*                                                                            */
  /* This ABI previously marked `maker`, `app` and `strategyHash` as indexed on  */
  /* `Shipped` and `Docked`. Against the real contract that matches no log when   */
  /* used as a filter and mis-decodes any log it is handed. Two consequences the  */
  /* rest of the app has to respect: a maker or a strategy hash cannot be         */
  /* filtered server-side by topic — fetch by address and signature, decode, then */
  /* filter in JavaScript — and `Pulled`/`Pushed` are the only record of a swap,  */
  /* which is how fees are read (NOTES.md §6).                                    */
  /* ------------------------------------------------------------------------ */
  {
    type: "event",
    name: "Shipped",
    anonymous: false,
    inputs: [
      { name: "maker", type: "address", indexed: false },
      { name: "app", type: "address", indexed: false },
      { name: "strategyHash", type: "bytes32", indexed: false },
      { name: "strategy", type: "bytes", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Docked",
    anonymous: false,
    inputs: [
      { name: "maker", type: "address", indexed: false },
      { name: "app", type: "address", indexed: false },
      { name: "strategyHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Pulled",
    anonymous: false,
    inputs: [
      { name: "maker", type: "address", indexed: false },
      { name: "app", type: "address", indexed: false },
      { name: "strategyHash", type: "bytes32", indexed: false },
      { name: "token", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Pushed",
    anonymous: false,
    inputs: [
      { name: "maker", type: "address", indexed: false },
      { name: "app", type: "address", indexed: false },
      { name: "strategyHash", type: "bytes32", indexed: false },
      { name: "token", type: "address", indexed: false },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;
