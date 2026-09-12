/**
 * Aqua's four events, with the `indexed` flags the deployed contract actually has: **none**.
 *
 * `src/interfaces/IAqua.sol` declares
 *
 *   event Shipped(address maker, address app, bytes32 strategyHash, bytes strategy);
 *   event Docked(address maker, address app, bytes32 strategyHash);
 *   event Pulled(address maker, address app, bytes32 strategyHash, address token, uint256 amount);
 *   event Pushed(address maker, address app, bytes32 strategyHash, address token, uint256 amount);
 *
 * with no parameter indexed, so every log has exactly one topic (the signature) and all four
 * arguments live in `data`. Two consequences the rest of the app has to respect:
 *
 *  1. a maker or a strategy hash **cannot** be filtered server-side by topic. Fetch by address
 *     and signature, decode, then filter in JavaScript;
 *  2. `web/src/lib/chain/abi/aqua.ts` currently marks `maker`, `app` and `strategyHash` as
 *     `indexed: true` on `Shipped` and `Docked`. Against the real contract that ABI matches
 *     nothing and mis-decodes anything it is handed. It needs correcting by whoever owns
 *     `lib/chain`; until then this file is the copy any log work must use.
 *     (Recorded in `contracts/aqua/NOTES.md` §8.2.)
 */

import type { Address, Hex } from "viem";

export const AQUA_EVENTS_ABI = [
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

export interface StrategyEventFilter {
  maker: Address;
  app: Address;
  strategyHash: Hex;
}

/** The JS-side filter the missing topics force on us. Compare lowercased: RPCs vary on casing. */
export function matchesStrategy(
  args: { maker?: Address; app?: Address; strategyHash?: Hex },
  filter: StrategyEventFilter,
): boolean {
  return (
    (args.maker ?? "").toLowerCase() === filter.maker.toLowerCase() &&
    (args.app ?? "").toLowerCase() === filter.app.toLowerCase() &&
    (args.strategyHash ?? "").toLowerCase() === filter.strategyHash.toLowerCase()
  );
}
