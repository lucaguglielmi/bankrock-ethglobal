/**
 * The quote maths, pinned against the contract.
 *
 * The two headline numbers here are asserted verbatim in
 * `contracts/test/aqua/XYCSwapStrategy.t.sol`, where they are also checked against
 * `XYCSwap.quoteExactIn` on a live EVM. The reserves are the ones the Solidity fixture ships:
 * 2,000 USDC (6 decimals) against 1 WETH (18 decimals), at 30 bps.
 */

import { describe, expect, it } from "vitest";
import { maxExecutableIn, minAmountOut, quoteExactIn, quoteExactOut } from "./quote";

const USDC = BigInt(10) ** BigInt(6);
const WETH = BigInt(10) ** BigInt(18);

const curve = {
  balanceIn: BigInt(2_000) * USDC,
  balanceOut: WETH,
  feeBps: 30,
};

describe("quoteExactIn", () => {
  it("matches the contract for 100 USDC in, 30 bps, on 2000/1", () => {
    const result = quoteExactIn(curve, BigInt(100) * USDC);
    // Asserted in Solidity as 47_482_973_758_155_927.
    expect(result.amountOut).toBe(BigInt("47482973758155927"));
    expect(result.feeAmount).toBe(BigInt(300_000)); // 0.3 USDC
  });

  it("matches the contract for 0.1 WETH in, the other direction", () => {
    const result = quoteExactIn(
      { balanceIn: WETH, balanceOut: BigInt(2_000) * USDC, feeBps: 30 },
      WETH / BigInt(10),
    );
    // Asserted in Solidity as 181_322_178 (181.322178 USDC).
    expect(result.amountOut).toBe(BigInt(181_322_178));
  });

  it("truncates exactly like Solidity's integer division", () => {
    // amountInWithFee = 7 * 9970 / 10000 = 6 (not 6.979); out = 6 * 50 / (50 + 6) = 5 (not 5.35).
    const tiny = quoteExactIn({ balanceIn: BigInt(50), balanceOut: BigInt(50), feeBps: 30 }, BigInt(7));
    expect(tiny.amountOut).toBe(BigInt(5));
  });

  it("reproduces the upstream example: 5 in and 20 in on a 50/50 pool", () => {
    // github.com/1inch/aqua examples/test/XYCSwap.t.sol::testPriceImpact asserts 3 and 13.
    const pool = { balanceIn: BigInt(50), balanceOut: BigInt(50), feeBps: 30 };
    expect(quoteExactIn(pool, BigInt(5)).amountOut).toBe(BigInt(3));
    expect(quoteExactIn(pool, BigInt(20)).amountOut).toBe(BigInt(13));
  });

  it("charges the fee on the input and never pays out the whole reserve", () => {
    const huge = quoteExactIn(curve, BigInt(1_000_000) * USDC);
    expect(huge.amountOut).toBeLessThan(curve.balanceOut);
    expect(huge.feeAmount).toBe((BigInt(1_000_000) * USDC * BigInt(30)) / BigInt(10_000));
  });

  it("reports a price impact that grows with size", () => {
    const small = quoteExactIn(curve, BigInt(10) * USDC);
    const large = quoteExactIn(curve, BigInt(500) * USDC);
    expect(large.priceImpactBps).toBeGreaterThan(small.priceImpactBps);
    expect(small.priceImpactBps).toBeGreaterThan(BigInt(0));
  });

  it("returns zero for a zero input rather than dividing by zero", () => {
    expect(quoteExactIn(curve, BigInt(0)).amountOut).toBe(BigInt(0));
    expect(quoteExactIn(curve, BigInt(-5)).amountOut).toBe(BigInt(0));
  });

  it("refuses an empty or impossible curve", () => {
    expect(() => quoteExactIn({ ...curve, balanceIn: BigInt(0) }, USDC)).toThrow(/balanceIn/);
    expect(() => quoteExactIn({ ...curve, balanceOut: BigInt(0) }, USDC)).toThrow(/balanceOut/);
    expect(() => quoteExactIn({ ...curve, feeBps: 10_000 }, USDC)).toThrow(/feeBps/);
  });
});

describe("quoteExactOut", () => {
  it("matches the contract for the output 100 USDC buys", () => {
    // Asserted in Solidity against XYCSwap.quoteExactOut as 100_015_003.
    expect(quoteExactOut(curve, BigInt("47482973758155927")).amountIn).toBe(BigInt(100_015_003));
  });

  it("is deliberately *not* the inverse of quoteExactIn — the fee lands on the other side", () => {
    const amountIn = BigInt(100) * USDC;
    const { amountOut } = quoteExactIn(curve, amountIn);
    const back = quoteExactOut(curve, amountOut);
    // Upstream charges the fee on the input when quoting in and on the output when quoting out,
    // so the round trip comes back about 30 bps heavy. Mirrored on purpose; see quote.ts.
    expect(back.amountIn).toBeGreaterThan(amountIn);
    const driftBps = ((back.amountIn - amountIn) * BigInt(10_000)) / amountIn;
    expect(driftBps).toBeGreaterThanOrEqual(BigInt(1));
    expect(driftBps).toBeLessThanOrEqual(BigInt(31));
  });

  it("cannot be asked for the strategy's entire virtual balance", () => {
    expect(() => quoteExactOut(curve, curve.balanceOut)).toThrow(/virtual balance/);
    expect(() => quoteExactOut(curve, curve.balanceOut * BigInt(2))).toThrow(/virtual balance/);
  });
});

describe("maxExecutableIn", () => {
  it("is the largest input the wallet can still settle", () => {
    // The strategy claims 1 WETH but the rock's wallet only holds 0.2 WETH.
    const executableOut = WETH / BigInt(5);
    const maxIn = maxExecutableIn(curve, executableOut);

    expect(quoteExactIn(curve, maxIn).amountOut).toBeLessThanOrEqual(executableOut);
    // And it really is the largest: one base unit more overshoots the wallet.
    expect(quoteExactIn(curve, maxIn + BigInt(1)).amountOut).toBeGreaterThan(executableOut);
  });

  it("never exceeds the curve, even when the wallet holds more than the strategy", () => {
    const maxIn = maxExecutableIn(curve, curve.balanceOut * BigInt(10));
    expect(quoteExactIn(curve, maxIn).amountOut).toBeLessThan(curve.balanceOut);
  });

  it("is zero when the wallet is empty", () => {
    expect(maxExecutableIn(curve, BigInt(0))).toBe(BigInt(0));
  });
});

describe("minAmountOut", () => {
  it("applies a slippage tolerance in basis points", () => {
    expect(minAmountOut(BigInt(10_000), 50)).toBe(BigInt(9_950));
    expect(minAmountOut(BigInt(10_000), 0)).toBe(BigInt(10_000));
    expect(() => minAmountOut(BigInt(10_000), 10_000)).toThrow(/slippageBps/);
  });
});
