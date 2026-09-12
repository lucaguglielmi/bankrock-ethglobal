/**
 * Calldata tests.
 *
 * `lib/chain` and `lib/aqua/config` read their addresses once, at module load, so each case sets
 * the environment and then imports the module — the same `vi.resetModules()` pattern
 * `rock-account.server.test.ts` uses.
 *
 * The point being defended here is the shape of the two batches: who is approved, in what order,
 * and against which contract. Approving the *app* instead of Aqua, or the *app* instead of the
 * periphery, produces calldata that looks right and reverts on chain (E-3, `NOTES.md` §5).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeFunctionData, getAddress, type Address } from "viem";
import { ERC20_ABI } from "@/lib/chain/abi/erc20";
import { AQUA_ABI as AQUA } from "@/lib/chain/abi/aqua";
import { XYC_SWAP_TAKER_ABI } from "@/lib/chain/abi/aqua-app";

// Addresses are built, never written out, so the "no address literals outside lib/chain" rule
// (D-015) holds for the test suite too.
function sampleAddress(digit: string): Address {
  // Checksummed, because every builder returns checksummed addresses (viem's `getAddress`).
  return getAddress(`0x${digit.repeat(40)}`);
}

const AQUA_ADDRESS = sampleAddress("a");
const APP = sampleAddress("b");
const TAKER = sampleAddress("c");
const USDC = sampleAddress("d");
const WETH = sampleAddress("e");
const MAKER = sampleAddress("f");
const VISITOR = sampleAddress("9");

const ENV = {
  NEXT_PUBLIC_AQUA_ADDRESS: AQUA_ADDRESS,
  NEXT_PUBLIC_USDC_ADDRESS: USDC,
  NEXT_PUBLIC_WETH_ADDRESS: WETH,
  NEXT_PUBLIC_AQUA_APP_ADDRESS: APP,
  NEXT_PUBLIC_AQUA_TAKER_ADDRESS: TAKER,
};

async function load(overrides: Record<string, string | undefined> = {}) {
  for (const [key, value] of Object.entries({ ...ENV, ...overrides })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
  return import("./index");
}

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  for (const key of Object.keys(ENV)) delete process.env[key];
  vi.resetModules();
});

const shipParams = {
  maker: MAKER,
  rockId: 42,
  streamIndex: 0,
  feeBps: 30,
  usdcAmount: BigInt(2_000_000_000), // 2,000 USDC
  wethAmount: BigInt(10) ** BigInt(18), // 1 WETH
};

describe("buildShipCalls", () => {
  it("is three calls: approve USDC to Aqua, approve WETH to Aqua, then ship", async () => {
    const aqua = await load();
    const plan = aqua.buildShipCalls(shipParams);
    expect(plan.state).toBe("REAL");
    if (plan.state !== "REAL") return;

    const { calls } = plan.value;
    expect(calls).toHaveLength(3);

    // 1 & 2 — the approvals go to the token contracts, and the spender is Aqua, never the app.
    for (const [index, token, amount] of [
      [0, USDC, shipParams.usdcAmount],
      [1, WETH, shipParams.wethAmount],
    ] as const) {
      expect(calls[index].to).toBe(token);
      expect(calls[index].value).toBe(BigInt(0));
      const decoded = decodeFunctionData({ abi: ERC20_ABI, data: calls[index].data });
      expect(decoded.functionName).toBe("approve");
      expect(decoded.args?.[0]).toBe(AQUA_ADDRESS);
      expect(decoded.args?.[0]).not.toBe(APP);
      expect(decoded.args?.[1]).toBe(amount);
    }

    // 3 — ship(app, strategy, [USDC, WETH], [a, b]) against Aqua itself.
    expect(calls[2].to).toBe(AQUA_ADDRESS);
    const ship = decodeFunctionData({ abi: AQUA, data: calls[2].data });
    expect(ship.functionName).toBe("ship");
    expect(ship.args?.[0]).toBe(APP);
    expect(ship.args?.[1]).toBe(plan.value.strategy);
    expect(ship.args?.[2]).toEqual([USDC, WETH]);
    expect(ship.args?.[3]).toEqual([shipParams.usdcAmount, shipParams.wethAmount]);
  });

  it("returns the strategy hash the balances will be filed under", async () => {
    const aqua = await load();
    const plan = aqua.buildShipCalls(shipParams);
    if (plan.state !== "REAL") throw new Error("expected REAL");
    expect(plan.value.strategyHash).toBe(
      aqua.strategyHash(
        aqua.encodeStrategy({ ...shipParams, token0: USDC, token1: WETH }),
      ),
    );
  });

  it("can approve more than it ships, for a second stream over the same reserve", async () => {
    const aqua = await load();
    const plan = aqua.buildShipCalls({
      ...shipParams,
      approveUsdcAmount: aqua.maxUint256,
      approveWethAmount: aqua.maxUint256,
    });
    if (plan.state !== "REAL") throw new Error("expected REAL");
    const approve = decodeFunctionData({ abi: ERC20_ABI, data: plan.value.calls[0].data });
    expect(approve.args?.[1]).toBe(aqua.maxUint256);
    // The shipped amount is unchanged — the allowance is wider, the strategy is not.
    const ship = decodeFunctionData({ abi: AQUA, data: plan.value.calls[2].data });
    expect(ship.args?.[3]).toEqual([shipParams.usdcAmount, shipParams.wethAmount]);
  });

  it("is UNAVAILABLE, naming the variable, when the app address is unset", async () => {
    const aqua = await load({ NEXT_PUBLIC_AQUA_APP_ADDRESS: undefined });
    const plan = aqua.buildShipCalls(shipParams);
    expect(plan.state).toBe("UNAVAILABLE");
    if (plan.state === "UNAVAILABLE") {
      expect(plan.reason).toContain("NEXT_PUBLIC_AQUA_APP_ADDRESS");
    }
  });

  it("is UNAVAILABLE when Aqua itself is unset", async () => {
    const aqua = await load({ NEXT_PUBLIC_AQUA_ADDRESS: undefined });
    const plan = aqua.buildShipCalls(shipParams);
    expect(plan.state).toBe("UNAVAILABLE");
    if (plan.state === "UNAVAILABLE") {
      expect(plan.reason).toContain("NEXT_PUBLIC_AQUA_ADDRESS");
    }
  });

  it("refuses a strategy with nothing to trade", async () => {
    const aqua = await load();
    const plan = aqua.buildShipCalls({
      ...shipParams,
      usdcAmount: BigInt(0),
      wethAmount: BigInt(0),
    });
    expect(plan.state).toBe("UNAVAILABLE");
  });
});

describe("buildDockCalls", () => {
  it("is one call to Aqua listing both tokens", async () => {
    const aqua = await load();
    const plan = aqua.buildShipCalls(shipParams);
    if (plan.state !== "REAL") throw new Error("expected REAL");

    const dock = aqua.buildDockCalls({ strategyHash: plan.value.strategyHash });
    if (dock.state !== "REAL") throw new Error("expected REAL");
    expect(dock.value.calls).toHaveLength(1);
    expect(dock.value.calls[0].to).toBe(AQUA_ADDRESS);

    const decoded = decodeFunctionData({ abi: AQUA, data: dock.value.calls[0].data });
    expect(decoded.functionName).toBe("dock");
    expect(decoded.args?.[0]).toBe(APP);
    expect(decoded.args?.[1]).toBe(plan.value.strategyHash);
    // Both tokens, or Aqua reverts DockingShouldCloseAllTokens.
    expect(decoded.args?.[2]).toEqual([USDC, WETH]);
  });
});

describe("buildSwapCall", () => {
  async function plan(overrides: Record<string, string | undefined> = {}) {
    const aqua = await load(overrides);
    const strategy = aqua.buildStrategy({
      maker: MAKER,
      token0: USDC,
      token1: WETH,
      feeBps: 30,
      rockId: 42,
      streamIndex: 0,
    });
    return { aqua, strategy };
  }

  it("approves the periphery — not Aqua, not the app — and then calls it", async () => {
    const { aqua, strategy } = await plan();
    const swap = aqua.buildSwapCall({
      strategy,
      tokenIn: USDC,
      amountIn: BigInt(100_000_000),
      minAmountOut: BigInt(1),
      to: VISITOR,
    });
    if (swap.state !== "REAL") throw new Error(`expected REAL`);

    expect(swap.value.calls).toHaveLength(2);
    const approve = decodeFunctionData({ abi: ERC20_ABI, data: swap.value.calls[0].data });
    expect(swap.value.calls[0].to).toBe(USDC);
    expect(approve.args?.[0]).toBe(TAKER);
    expect(approve.args?.[0]).not.toBe(AQUA_ADDRESS);
    expect(approve.args?.[0]).not.toBe(APP);
    expect(approve.args?.[1]).toBe(BigInt(100_000_000));

    expect(swap.value.call.to).toBe(TAKER);
    expect(swap.value.calls[1]).toEqual(swap.value.call);
    // The audit of 2026-09-12 removed the caller-supplied `app` argument (finding F-6: the
    // periphery is bound to one app at deployment now) and added a `deadline` (finding F-8).
    const decoded = decodeFunctionData({ abi: XYC_SWAP_TAKER_ABI, data: swap.value.call.data });
    expect(decoded.functionName).toBe("swapExactIn");
    expect(decoded.args?.[0]).toMatchObject({ maker: MAKER, token0: USDC, token1: WETH });
    expect(decoded.args?.[1]).toBe(true); // zeroForOne: selling token0 (USDC)
    expect(decoded.args?.[2]).toBe(BigInt(100_000_000));
    expect(decoded.args?.[3]).toBe(BigInt(1));
    expect(decoded.args?.[4]).toBe(VISITOR);
    expect(decoded.args?.[5]).toBe(swap.value.deadline);
  });

  it("reads the direction from the token being sold", async () => {
    const { aqua, strategy } = await plan();
    const swap = aqua.buildSwapCall({
      strategy,
      tokenIn: WETH,
      amountIn: BigInt(10) ** BigInt(17),
      minAmountOut: BigInt(0),
    });
    if (swap.state !== "REAL") throw new Error("expected REAL");
    expect(swap.value.zeroForOne).toBe(false);
    expect(swap.value.tokenOut).toBe(USDC);
  });

  it("rejects a token that is not in the strategy", async () => {
    const { aqua, strategy } = await plan();
    const swap = aqua.buildSwapCall({
      strategy,
      tokenIn: sampleAddress("7"),
      amountIn: BigInt(1),
      minAmountOut: BigInt(0),
    });
    expect(swap.state).toBe("UNAVAILABLE");
  });

  it("is UNAVAILABLE, naming the variable, without a deployed periphery", async () => {
    const { aqua, strategy } = await plan({ NEXT_PUBLIC_AQUA_TAKER_ADDRESS: undefined });
    const swap = aqua.buildSwapCall({
      strategy,
      tokenIn: USDC,
      amountIn: BigInt(1),
      minAmountOut: BigInt(0),
    });
    expect(swap.state).toBe("UNAVAILABLE");
    if (swap.state === "UNAVAILABLE") {
      expect(swap.reason).toContain("NEXT_PUBLIC_AQUA_TAKER_ADDRESS");
    }
  });

  it("refuses a zero-sized swap", async () => {
    const { aqua, strategy } = await plan();
    const swap = aqua.buildSwapCall({
      strategy,
      tokenIn: USDC,
      amountIn: BigInt(0),
      minAmountOut: BigInt(0),
    });
    expect(swap.state).toBe("UNAVAILABLE");
  });
});
