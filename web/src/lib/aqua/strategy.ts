/**
 * The strategy bytes - the exact encoding `XYCSwap` decodes and `Aqua` hashes.
 *
 * Read out of the vendored source at `contracts/aqua/`, written up in
 * `contracts/aqua/NOTES.md` §3, and cross-checked against Solidity: `XYCSwapStrategy.t.sol`
 * asserts the same three literals `strategy.test.ts` asserts, so neither side can drift alone.
 *
 *   struct Strategy { address maker; address token0; address token1; uint256 feeBps; bytes32 salt; }
 *
 *   salt         = keccak256(abi.encode(SALT_DOMAIN, rockId, streamIndex))
 *   strategy     = abi.encode(Strategy)          // 160 bytes, five words
 *   strategyHash = keccak256(strategy)           // what Aqua stores balances under
 *
 * The salt is how spec 04's "rock identity as strategy salt" is realised, and it buys the app a
 * property worth stating plainly: **a rock's strategies are addressable without an indexer**.
 * From a public rock id and the Rock Account address the client recomputes the hash and asks
 * Aqua; a revert means "not shipped", a success means "live, and here are the virtual balances".
 * Nothing is stored off-chain and no event has to be scanned.
 *
 * A strategy is immutable once shipped, so every field here is part of its identity: change the
 * fee by one basis point and it is a different strategy with no balances (`safeBalances` reverts).
 */

import {
  decodeAbiParameters,
  encodeAbiParameters,
  getAddress,
  keccak256,
  parseAbiParameters,
  stringToHex,
  type Address,
  type Hex,
} from "viem";

/** `keccak256("bankrock.aqua.strategy.v1")`. Pinned in Solidity as `SALT_DOMAIN`. */
export const SALT_DOMAIN: Hex = keccak256(stringToHex("bankrock.aqua.strategy.v1"));

/** XYCSwap's basis-point base: 10,000 = 100%. */
export const BPS_BASE = BigInt(10_000);

/** The ABI type of `XYCSwap.Strategy`, as a tuple - this is what `abi.encode(strategy)` produces. */
const STRATEGY_TUPLE = parseAbiParameters(
  "(address maker, address token0, address token1, uint256 feeBps, bytes32 salt)",
);

const SALT_TUPLE = parseAbiParameters("bytes32 domain, uint256 rockId, uint256 streamIndex");

/** A rock's identity within one strategy: which rock, and which of its streams. */
export interface StreamIdentity {
  /** The public rock id. A positive integer - the registry's `uint256`. */
  rockId: bigint | number | string;
  /** Which stream of that rock. Several streams share one reserve (spec 04). Defaults to 0. */
  streamIndex?: bigint | number;
}

export interface StrategyParams extends StreamIdentity {
  /** The maker: the rock's Rock Account (a Safe). */
  maker: Address;
  /** token0 - USDC, by role. */
  token0: Address;
  /** token1 - WETH, by role. */
  token1: Address;
  /** The swap fee in basis points. 30 = 0.30%. */
  feeBps: bigint | number;
}

/** The strategy's fields, normalised: addresses checksummed, every number a `bigint`. */
export interface NormalisedStrategyParams {
  maker: Address;
  token0: Address;
  token1: Address;
  feeBps: bigint;
  rockId: bigint;
  streamIndex: bigint;
}

/** A strategy, and everything derived from it. */
export interface EncodedStrategy {
  params: NormalisedStrategyParams;
  /** The `strategy` argument of `Aqua.ship` - 160 bytes. */
  strategy: Hex;
  /** `keccak256(strategy)`. The key every balance and every event is filed under. */
  strategyHash: Hex;
  /** The salt embedded in the strategy, carrying the rock id. */
  salt: Hex;
}

function toBigInt(value: bigint | number | string, label: string): bigint {
  let parsed: bigint;
  try {
    parsed = typeof value === "bigint" ? value : BigInt(String(value).trim());
  } catch {
    throw new Error(`${label} must be an integer, got "${String(value)}"`);
  }
  if (parsed < BigInt(0)) throw new Error(`${label} must not be negative, got ${parsed}`);
  return parsed;
}

/**
 * `salt = keccak256(abi.encode(SALT_DOMAIN, rockId, streamIndex))`.
 *
 * Deterministic and reproducible by anyone holding the rock id - which is the point: it is the
 * link between a physical rock and an on-chain strategy, not a secret.
 */
export function deriveSalt({ rockId, streamIndex = 0 }: StreamIdentity): Hex {
  return keccak256(
    encodeAbiParameters(SALT_TUPLE, [
      SALT_DOMAIN,
      toBigInt(rockId, "rockId"),
      toBigInt(streamIndex, "streamIndex"),
    ]),
  );
}

/** `abi.encode(XYCSwap.Strategy)` for a rock's stream. */
export function encodeStrategy(params: StrategyParams): Hex {
  const feeBps = toBigInt(params.feeBps, "feeBps");
  if (feeBps >= BPS_BASE) {
    throw new Error(`feeBps must be below ${BPS_BASE} (100%), got ${feeBps}`);
  }
  return encodeAbiParameters(STRATEGY_TUPLE, [
    {
      maker: getAddress(params.maker),
      token0: getAddress(params.token0),
      token1: getAddress(params.token1),
      feeBps,
      salt: deriveSalt(params),
    },
  ]);
}

/** `keccak256(strategy)` - literally what `Aqua.ship` returns and files balances under. */
export function strategyHash(strategy: Hex): Hex {
  return keccak256(strategy);
}

/** Encode a stream and derive everything that follows from it, in one call. */
export function buildStrategy(params: StrategyParams): EncodedStrategy {
  const strategy = encodeStrategy(params);
  return {
    params: {
      maker: getAddress(params.maker),
      token0: getAddress(params.token0),
      token1: getAddress(params.token1),
      feeBps: toBigInt(params.feeBps, "feeBps"),
      rockId: toBigInt(params.rockId, "rockId"),
      streamIndex: toBigInt(params.streamIndex ?? 0, "streamIndex"),
    },
    strategy,
    strategyHash: strategyHash(strategy),
    salt: deriveSalt(params),
  };
}

/**
 * Decode strategy bytes back into their fields - for a `Shipped` event, or to check that an
 * address someone handed us really is the strategy we think it is.
 *
 * The rock id is *not* recoverable from the salt (it is a hash). To prove a strategy belongs to a
 * rock, re-derive the salt from the rock id and compare - that is `strategyBelongsToRock`.
 */
export function decodeStrategy(strategy: Hex): {
  maker: Address;
  token0: Address;
  token1: Address;
  feeBps: bigint;
  salt: Hex;
} {
  const [decoded] = decodeAbiParameters(STRATEGY_TUPLE, strategy);
  return {
    maker: getAddress(decoded.maker),
    token0: getAddress(decoded.token0),
    token1: getAddress(decoded.token1),
    feeBps: decoded.feeBps,
    salt: decoded.salt,
  };
}

/** True when `strategy` carries this rock's salt at this stream index. */
export function strategyBelongsToRock(strategy: Hex, identity: StreamIdentity): boolean {
  return decodeStrategy(strategy).salt.toLowerCase() === deriveSalt(identity).toLowerCase();
}

/**
 * A liquidity strategy the dashboard can offer - one entry of the catalogue.
 *
 * `XYCSwap` is a fixed constant-product curve, so the only thing a strategy can vary is its fee.
 * A "strategy" in this product is therefore a `(streamIndex, feeBps)` preset, and the fields
 * below are everything the UI needs to present one: the two that make its identity, and three
 * strings written for the owner rather than for the chain.
 */
export interface StreamPreset {
  /** Which of the rock's streams this preset ships. Part of the strategy's salt, hence its hash. */
  readonly streamIndex: number;
  /** The immutable swap fee, in basis points (30 = 0.30%). Part of the hash too. */
  readonly feeBps: number;
  /** One or two words - the name a card is headed with. */
  readonly label: string;
  /** The fee and what it is, in a phrase: "0.30% - the everyday curve". */
  readonly description: string;
  /** One calm sentence: who should pick this and what happens. */
  readonly forWhom: string;
}

/**
 * The catalogue: every strategy a rock can run, and the only ones any reader looks for.
 *
 * Spec 04: *"The demo should ship at least two strategies from the same Rock Account and
 * overlapping token balance… a simple AMM-like strategy [and] a fixed-price offer or second
 * pricing curve using the same reserve."* `XYCSwap` has one curve shape, so the streams differ
 * only in fee - the same reserve, offered at several prices, which is exactly the shared-liquidity
 * point spec 04 wants made.
 *
 * These are also what a reader probes: given a rock id and its Rock Account, every hash here is
 * computable, so no stream list has to be stored anywhere (`readRockStreams` in `read.ts`). A
 * preset is discoverable **only** if it is in this list; each entry costs one `safeBalances`
 * call per read. Ordered by `streamIndex`, not by fee.
 *
 * Rules, pinned by `strategy.test.ts`:
 *   - stream 0 (Wide, 30 bps) and stream 1 (Tight, 5 bps) never change - they are live on
 *     Sepolia, and a changed fee is a different hash that would make them invisible;
 *   - stream indexes are unique and contiguous from 0; fees are unique;
 *   - a fee tier is never edited. To change one, add a preset at the next index.
 *
 * The fees are the three tiers a USDC/WETH constant-product pool is conventionally offered at.
 * 5 bps is the thinnest that pair sustains; 30 bps is the everyday tier; 100 bps is the tier
 * for a maker content to trade rarely and keep a larger slice each time. Anything below 5 bps
 * would price a volatile pair like a stable one, so it is not offered.
 */
export const DEFAULT_STREAMS: readonly StreamPreset[] = [
  {
    streamIndex: 0,
    feeBps: 30,
    label: "Wide",
    description: "0.30% - the everyday curve",
    forWhom: "Trades steadily and keeps a fair slice of each one; the middle of the road.",
  },
  {
    streamIndex: 1,
    feeBps: 5,
    label: "Tight",
    description: "0.05% - the same reserve, priced finer",
    forWhom: "Trades most often and earns a little each time; for a rock that likes to be busy.",
  },
  {
    streamIndex: 2,
    feeBps: 100,
    label: "Patient",
    description: "1.00% - the same reserve, priced for rare trades",
    forWhom: "Trades rarely and earns the most each time; for a rock content to wait.",
  },
];

/** The catalogue entry at `streamIndex`, or `undefined` for an index no reader probes. */
export function streamPresetFor(
  streamIndex: number | bigint | string | undefined,
): StreamPreset | undefined {
  if (streamIndex === undefined) return undefined;
  const index = Number(streamIndex);
  if (!Number.isInteger(index)) return undefined;
  return DEFAULT_STREAMS.find((preset) => preset.streamIndex === index);
}
