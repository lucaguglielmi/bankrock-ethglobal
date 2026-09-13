/**
 * The Aqua integration - the sponsor integration, and the reason this project exists.
 *
 * A rock is a **maker**: its tokens stay in its own Rock Account and it grants Aqua an allowance
 * per strategy. A visitor is a **taker**: they swap against one of those strategies and the
 * tokens move wallet-to-wallet, never into a pool.
 *
 *   strategy.ts  the exact bytes `Aqua.ship` hashes, the rock-id salt that makes a rock's
 *                strategies recomputable without an indexer, and `DEFAULT_STREAMS` - the
 *                catalogue of `(streamIndex, feeBps)` presets every reader probes
 *   calls.ts     calldata for ship, dock, push (top up) and swap - bytes only, no signing and no
 *                submission
 *   quote.ts     the constant-product maths, mirrored from the contract, for previews
 *   read.ts      actual, virtual and executable balances, and fees read from Aqua's events
 *   events.ts    Aqua's events with the `indexed` flags the deployed contract really has (none)
 *   config.ts    the two addresses this integration deploys, read from the environment
 *
 * Contracts, the upstream provenance and the full protocol walk-through are in
 * `contracts/aqua/` - `NOTES.md` is the reference for everything above.
 */

export {
  SALT_DOMAIN,
  BPS_BASE,
  DEFAULT_STREAMS,
  streamPresetFor,
  deriveSalt,
  encodeStrategy,
  strategyHash,
  buildStrategy,
  decodeStrategy,
  strategyBelongsToRock,
  type StreamIdentity,
  type StrategyParams,
  type EncodedStrategy,
  type NormalisedStrategyParams,
  type StreamPreset,
} from "./strategy";

export {
  buildShipCalls,
  buildDockCalls,
  buildPushCalls,
  buildSwapCall,
  maxUint256,
  type Call,
  type ShipParams,
  type ShipPlan,
  type DockParams,
  type PushParams,
  type PushPlan,
  type SwapParams,
  type SwapPlan,
} from "./calls";

export {
  quoteExactIn,
  quoteExactOut,
  maxExecutableIn,
  minAmountOut,
  type CurveState,
  type QuoteResult,
} from "./quote";

export {
  readStrategy,
  readRockStreams,
  readAccruedFees,
  planFeeScan,
  resetFeeScanCache,
  type StrategyReading,
  type RockStrategyView,
  type StrategyBalances,
  type TokenPairAmounts,
  type AccruedFees,
} from "./read";

export {
  serializeStrategyView,
  serializeFees,
  parseStrategyView,
  type RockStrategyViewJson,
  type StrategyBalancesJson,
  type AccruedFeesJson,
  type ParsedStrategyView,
  type ParsedStream,
} from "./serialize";

export {
  getAquaAppAddress,
  getAquaTakerAddress,
  getAquaAddress,
  getAquaAddresses,
  getPairAddresses,
  getAppDeployBlock,
  type AquaAddresses,
} from "./config";

export { AQUA_EVENTS_ABI, matchesStrategy, type StrategyEventFilter } from "./events";
