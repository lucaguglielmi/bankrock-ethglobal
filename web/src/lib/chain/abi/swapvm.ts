/**
 * SwapVM router — quote view.
 *
 * STATUS: HYPOTHESIS. Not verified against bytecode, because no SwapVM router exists on any
 * testnet (spec 16 §1.2) and there is no published JavaScript SDK — `@1inch/swap-vm` is not on
 * npm and the repository's package.json declares no `main`/`exports` (spec 16 §1.5 item 5).
 *
 * Sources used:
 *  - specs/04-aqua-integration.md, "Quoting": *"Quotes come from the router's own `quote()` view,
 *    which is guaranteed to return exactly what `swap()` will execute. No external price API."*
 *  - specs/16-environment-and-secrets.md §1.4: the 1inch Swap API serves mainnets only, so
 *    /api/quote and 1INCH_API_KEY are deleted (E-5).
 *  - specs/16-environment-and-secrets.md §1.5 item 4: the parameter encoding for an Aqua-mode
 *    order is itself an open hypothesis pending a read of
 *    `test/solidity/helpers/AquaStrategyBuilders.sol` in github.com/1inch/swap-vm.
 *
 * Consequence for the code: `GET /api/rocks/[id]/quote` must never present a number produced by
 * an unverified ABI as a quote. It returns UNAVAILABLE while
 * NEXT_PUBLIC_SWAPVM_ROUTER_ADDRESS is unset, and it returns UNAVAILABLE — not a guess — when
 * the call reverts or decodes unexpectedly, which is what an incorrect signature looks like on
 * the wire. Replace this ABI with the real one from the deployed router (Phase 3, spec 15) and
 * delete this notice at that point.
 */
export const SWAPVM_ROUTER_QUOTE_ABI = [
  {
    type: "function",
    name: "quote",
    stateMutability: "view",
    inputs: [
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const;

/** True while the ABI above is unconfirmed against a deployed router. */
export const SWAPVM_QUOTE_ABI_IS_HYPOTHESIS = true;
