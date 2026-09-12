import { describe, expect, it } from "vitest";
import { decodeAbiParameters, encodeAbiParameters, getAddress } from "viem";
import {
  buildTradePlan,
  decodeStrategyBytes,
  ethereumAddressFrom,
  main,
  minOutWithSlippage,
  parseArgs,
  rpcRequestFor,
  txHashFrom,
} from "./trade-with-rock.mjs";

/**
 * The agent's plan builder, offline. The calldata must be what a visitor's wallet would send:
 * the same `swapExactIn` tuple the web app encodes, with the agent as the recipient and a
 * positive floor — a script must never pass a zero floor (contracts/aqua/NOTES.md).
 */

const MAKER = getAddress("0x1111111111111111111111111111111111111111");
const USDC = getAddress("0x2222222222222222222222222222222222222222");
const WETH = getAddress("0x3333333333333333333333333333333333333333");
const TAKER = getAddress("0x4444444444444444444444444444444444444444");
const AGENT = getAddress("0x5555555555555555555555555555555555555555");
const SALT = `0x${"ab".repeat(32)}`;

const strategyHex = encodeAbiParameters(
  [{ type: "address" }, { type: "address" }, { type: "address" }, { type: "uint256" }, { type: "bytes32" }],
  [MAKER, USDC, WETH, 30n, SALT],
);

describe("decodeStrategyBytes", () => {
  it("reads the five words of an encoded XYCSwap.Strategy", () => {
    const fields = decodeStrategyBytes(strategyHex);
    expect(fields).toEqual({ maker: MAKER, token0: USDC, token1: WETH, feeBps: 30n, salt: SALT });
  });
});

describe("minOutWithSlippage", () => {
  it("floors the quote by the tolerance", () => {
    expect(minOutWithSlippage(1_000_000n, 100)).toBe(990_000n);
    expect(minOutWithSlippage(1_000_000n, 0)).toBe(1_000_000n);
  });

  it("refuses an impossible tolerance", () => {
    expect(() => minOutWithSlippage(1n, 10_001)).toThrow();
  });
});

describe("buildTradePlan", () => {
  const deadline = 1_800_000_000n;

  it("encodes approve(periphery, amountIn) then swapExactIn with the agent as recipient", () => {
    const plan = buildTradePlan({
      strategyHex,
      tokenIn: USDC,
      amountIn: 1_000_000n,
      minAmountOut: 1n,
      recipient: AGENT,
      taker: TAKER,
      deadline,
    });
    expect(plan.zeroForOne).toBe(true);
    expect(plan.tokenOut).toBe(WETH);
    expect(plan.approve.to).toBe(USDC);
    // approve(address,uint256) selector, spender, amount.
    expect(plan.approve.data.slice(0, 10)).toBe("0x095ea7b3");
    expect(plan.approve.data.toLowerCase()).toContain(TAKER.slice(2).toLowerCase());
    expect(plan.swap.to).toBe(TAKER);
    const [maker, token0, token1, feeBps, salt, zeroForOne, amountIn, minOut, to, dl] = decodeAbiParameters(
      [
        { type: "address" },
        { type: "address" },
        { type: "address" },
        { type: "uint256" },
        { type: "bytes32" },
        { type: "bool" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "address" },
        { type: "uint256" },
      ],
      `0x${plan.swap.data.slice(10)}`,
    );
    expect([maker, token0, token1, feeBps, salt]).toEqual([MAKER, USDC, WETH, 30n, SALT]);
    expect(zeroForOne).toBe(true);
    expect(amountIn).toBe(1_000_000n);
    expect(minOut).toBe(1n);
    expect(to).toBe(AGENT);
    expect(dl).toBe(deadline);
  });

  it("sells WETH for USDC when tokenIn is token1", () => {
    const plan = buildTradePlan({
      strategyHex,
      tokenIn: WETH,
      amountIn: 10n ** 15n,
      minAmountOut: 1n,
      recipient: AGENT,
      taker: TAKER,
      deadline,
    });
    expect(plan.zeroForOne).toBe(false);
    expect(plan.tokenOut).toBe(USDC);
    expect(plan.approve.to).toBe(WETH);
  });

  it("refuses a foreign token, a zero floor, and the periphery as recipient", () => {
    const base = { strategyHex, amountIn: 1n, minAmountOut: 1n, recipient: AGENT, taker: TAKER, deadline };
    expect(() => buildTradePlan({ ...base, tokenIn: TAKER })).toThrow(/not one of/);
    expect(() => buildTradePlan({ ...base, tokenIn: USDC, minAmountOut: 0n })).toThrow(/never pass 0/);
    expect(() => buildTradePlan({ ...base, tokenIn: USDC, recipient: TAKER })).toThrow(/real wallet/);
  });
});

describe("the CLI envelope", () => {
  it("is an eth_sendTransaction on Sepolia with the calldata", () => {
    const request = rpcRequestFor({ to: TAKER, data: "0xdeadbeef" });
    expect(request).toEqual({
      method: "eth_sendTransaction",
      caip2: "eip155:11155111",
      params: { transaction: { to: TAKER, data: "0xdeadbeef", value: "0x0" } },
    });
  });

  it("finds a hash or an address in whatever the CLI prints", () => {
    const hash = `0x${"cd".repeat(32)}`;
    expect(txHashFrom(`{"hash":"${hash}"}`)).toBe(hash);
    expect(txHashFrom(`Sent! ${hash}\n`)).toBe(hash);
    expect(txHashFrom("nothing here")).toBeNull();
    expect(ethereumAddressFrom(`ethereum: ${AGENT.toLowerCase()} (wallet_1)`)).toBe(AGENT);
  });

  it("parses flags", () => {
    expect(parseArgs(["--rock", "1", "--dry-run", "--token", "WETH"])).toEqual({
      rock: "1",
      "dry-run": true,
      token: "WETH",
    });
  });
});

describe("main --dry-run", () => {
  it("builds the plan from the API and sends nothing", async () => {
    const calls = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      calls.push(String(url));
      if (String(url).includes("/strategy")) {
        return new Response(
          JSON.stringify({
            state: "REAL",
            value: {
              maker: MAKER,
              streams: [{ streamIndex: "0", feeBps: "30", strategyHash: "0x01", strategy: strategyHex, virtual: {} }],
            },
          }),
          { status: 200 },
        );
      }
      if (String(url).includes("/quote")) {
        return new Response(
          JSON.stringify({ state: "REAL", value: { amountOut: "500000000000000", source: "test" } }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch ${url}`);
    };
    const originalWrite = process.stdout.write;
    process.stdout.write = () => true;
    try {
      const summary = await main([
        "--rock", "7", "--token", "USDC", "--amount", "2.5", "--taker", TAKER, "--api", "https://example.test", "--dry-run",
      ]);
      expect(summary.amountIn).toBe("2500000");
      expect(summary.quotedAmountOut).toBe("500000000000000");
      expect(summary.minAmountOut).toBe("495000000000000");
      expect(summary.transactions).toHaveLength(2);
      expect(summary.transactions[0].params.transaction.to).toBe(USDC);
      expect(summary.transactions[1].params.transaction.to).toBe(TAKER);
      expect(calls.every((c) => c.startsWith("https://example.test/api/rocks/7/"))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
      process.stdout.write = originalWrite;
    }
  });
});
