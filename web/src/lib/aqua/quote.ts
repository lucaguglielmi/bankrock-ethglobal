/**
 * The constant-product maths, mirrored from `XYCSwap._quoteExactIn` / `_quoteExactOut`.
 *
 * This is a *preview*, never an authority. The authority is `XYCSwap.quoteExactIn(...)`, a view
 * on the app itself, which runs the identical code path `swapExactIn` executes against the same
 * block's balances (spec 04 "Quoting" - with `XYCSwap` in the place of `SwapVMRouter.quote()`,
 * see `contracts/aqua/NOTES.md` §8.3). Use this to render a number as the user types, and read
 * the app before submitting.
 *
 * Everything is integer arithmetic in token base units, with the same truncating division
 * Solidity performs, so the preview matches the contract exactly - `quote.test.ts` and
 * `XYCSwapStrategy.t.sol` pin the same two results to prove it.
 *
 * There is no external price source anywhere in this path. The 1inch Swap API serves mainnets
 * only (E-5, spec 16 §1.4).
 */

import { BPS_BASE } from "./strategy";

export interface CurveState {
  /** The strategy's virtual balance of the token being sold in, in base units. */
  balanceIn: bigint;
  /** The strategy's virtual balance of the token being bought out. */
  balanceOut: bigint;
  /** The strategy's immutable fee, in basis points. */
  feeBps: bigint | number;
}

export interface QuoteResult {
  /** What the taker receives, in base units of the output token. */
  amountOut: bigint;
  /** What the taker pays, in base units of the input token. */
  amountIn: bigint;
  /** The fee slice of the input, in input-token base units: `amountIn * feeBps / 10000`. */
  feeAmount: bigint;
  /**
   * Price impact in basis points, against the marginal (zero-size) price of the same curve.
   * Derived from the curve, not invented: `1 - (amountOut/amountIn) / (balanceOut/balanceIn)`.
   */
  priceImpactBps: bigint;
}

function fee(value: bigint | number): bigint {
  const feeBps = typeof value === "bigint" ? value : BigInt(Math.trunc(value));
  if (feeBps < BigInt(0) || feeBps >= BPS_BASE) {
    throw new Error(`feeBps must be in [0, ${BPS_BASE}), got ${feeBps}`);
  }
  return feeBps;
}

function requirePositive(value: bigint, label: string): bigint {
  if (value <= BigInt(0)) throw new Error(`${label} must be positive, got ${value}`);
  return value;
}

/**
 * `amountOut` for an exact input - XYCSwap's `_quoteExactIn`, verbatim:
 *
 *   amountInWithFee = amountIn * (10000 - feeBps) / 10000
 *   amountOut       = amountInWithFee * balanceOut / (balanceIn + amountInWithFee)
 */
export function quoteExactIn(state: CurveState, amountIn: bigint): QuoteResult {
  const feeBps = fee(state.feeBps);
  const balanceIn = requirePositive(state.balanceIn, "balanceIn");
  const balanceOut = requirePositive(state.balanceOut, "balanceOut");
  if (amountIn <= BigInt(0)) {
    return { amountIn: BigInt(0), amountOut: BigInt(0), feeAmount: BigInt(0), priceImpactBps: BigInt(0) };
  }

  const amountInWithFee = (amountIn * (BPS_BASE - feeBps)) / BPS_BASE;
  const amountOut = (amountInWithFee * balanceOut) / (balanceIn + amountInWithFee);

  return {
    amountIn,
    amountOut,
    feeAmount: (amountIn * feeBps) / BPS_BASE,
    priceImpactBps: priceImpactBps({ amountIn, amountOut, balanceIn, balanceOut }),
  };
}

/**
 * `amountIn` for an exact output - XYCSwap's `_quoteExactOut`, including its `ceilDiv`:
 *
 *   amountOutWithFee = amountOut * 10000 / (10000 - feeBps)
 *   amountIn         = ceil(balanceIn * amountOutWithFee / (balanceOut - amountOutWithFee))
 *
 * **This is not the exact inverse of `quoteExactIn`.** The reference app takes its fee off the
 * *input* when quoting an exact input and grosses up the *output* when quoting an exact output,
 * so a round trip drifts by about `feeBps × (amountIn / balanceIn)` - 0.003% for a trade of 1%
 * of the reserve at 30 bps, a second-order effect, not the fee itself (measured 2026-09-13).
 * That asymmetry is upstream's, and it is mirrored here deliberately - this function
 * exists to predict `swapExactOut`, which behaves exactly this way. Bank Rock's swap path is
 * exact-in only, so the asymmetry never reaches a user.
 *
 * Throws when the output is at or beyond the strategy's virtual balance - which is what the
 * contract does too, by underflowing. There is no size at which the curve can empty itself.
 */
export function quoteExactOut(state: CurveState, amountOut: bigint): QuoteResult {
  const feeBps = fee(state.feeBps);
  const balanceIn = requirePositive(state.balanceIn, "balanceIn");
  const balanceOut = requirePositive(state.balanceOut, "balanceOut");
  if (amountOut <= BigInt(0)) {
    return { amountIn: BigInt(0), amountOut: BigInt(0), feeAmount: BigInt(0), priceImpactBps: BigInt(0) };
  }

  const amountOutWithFee = (amountOut * BPS_BASE) / (BPS_BASE - feeBps);
  if (amountOutWithFee >= balanceOut) {
    throw new Error(
      `this strategy cannot pay out ${amountOut}: its virtual balance is ${balanceOut}`,
    );
  }
  const numerator = balanceIn * amountOutWithFee;
  const denominator = balanceOut - amountOutWithFee;
  const amountIn = ceilDiv(numerator, denominator); // Solidity's Math.ceilDiv

  return {
    amountIn,
    amountOut,
    feeAmount: (amountIn * feeBps) / BPS_BASE,
    priceImpactBps: priceImpactBps({ amountIn, amountOut, balanceIn, balanceOut }),
  };
}

/**
 * How much worse the executed price is than the curve's marginal price, in basis points.
 *
 * This is a property of the constant-product curve and the trade size, computed from the same
 * reserves the swap will use - not the invented formula the old trade modal carried (N-6).
 */
function priceImpactBps(args: {
  amountIn: bigint;
  amountOut: bigint;
  balanceIn: bigint;
  balanceOut: bigint;
}): bigint {
  const { amountIn, amountOut, balanceIn, balanceOut } = args;
  if (amountIn <= BigInt(0) || amountOut <= BigInt(0)) return BigInt(0);
  // executed = amountOut / amountIn; marginal = balanceOut / balanceIn.
  const executed = amountOut * balanceIn;
  const marginal = balanceOut * amountIn;
  if (marginal === BigInt(0) || executed >= marginal) return BigInt(0);
  return ((marginal - executed) * BPS_BASE) / marginal;
}

/**
 * The largest input this strategy can actually settle right now.
 *
 * The binding constraint is rarely the curve. It is the maker's wallet: the output is transferred
 * out of it, so nothing above `executableOut` can be filled however large the virtual balance is
 * (`contracts/aqua/NOTES.md` §7). This inverts `quoteExactIn` - the path a swap really takes -
 * and then walks the last unit or two of integer truncation off, so the returned input is the
 * largest one whose quote still fits inside `executableOut`.
 */
export function maxExecutableIn(state: CurveState, executableOut: bigint): bigint {
  if (executableOut <= BigInt(0)) return BigInt(0);
  const feeBps = fee(state.feeBps);
  const balanceIn = requirePositive(state.balanceIn, "balanceIn");
  const balanceOut = requirePositive(state.balanceOut, "balanceOut");

  const cap = executableOut >= balanceOut ? balanceOut - BigInt(1) : executableOut;
  if (cap <= BigInt(0)) return BigInt(0);

  // Invert amountOut = netIn * balanceOut / (balanceIn + netIn), then undo the fee.
  const netIn = ceilDiv(balanceIn * cap, balanceOut - cap);
  let amountIn = ceilDiv(netIn * BPS_BASE, BPS_BASE - feeBps);

  // Two truncations sit between here and the contract; step back over them rather than round.
  for (let i = 0; i < 64 && amountIn > BigInt(0); i++) {
    if (quoteExactIn(state, amountIn).amountOut <= cap) break;
    amountIn -= BigInt(1);
  }
  return amountIn;
}

function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (numerator === BigInt(0)) return BigInt(0);
  return (numerator - BigInt(1)) / denominator + BigInt(1);
}

/** `amountOutMin` for a quoted swap, given a slippage tolerance in basis points. */
export function minAmountOut(amountOut: bigint, slippageBps: bigint | number = BigInt(50)): bigint {
  const bps = typeof slippageBps === "bigint" ? slippageBps : BigInt(Math.trunc(slippageBps));
  if (bps < BigInt(0) || bps >= BPS_BASE) {
    throw new Error(`slippageBps must be in [0, ${BPS_BASE}), got ${bps}`);
  }
  return (amountOut * (BPS_BASE - bps)) / BPS_BASE;
}
