import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decodeFunctionData, zeroAddress } from "viem";

/**
 * The visitor's swap path.
 *
 * The hook itself is not rendered — there is no React test renderer in this project — so what is
 * pinned here is everything the hook composes: the two calls it submits, the receipt decoding that
 * decides what the user is told they received, and the gating that must refuse rather than
 * half-build a transaction.
 */

const TAKER = `0x${"77".repeat(20)}` as const;
const AQUA = `0x${"22".repeat(20)}` as const;
const APP = `0x${"33".repeat(20)}` as const;
const USDC = `0x${"44".repeat(20)}` as const;
const WETH = `0x${"55".repeat(20)}` as const;
const MAKER = `0x${"11".repeat(20)}` as const;

/** Built, never written out, so the "no template-literal hashes" check holds here too (D-014b). */
function sampleHash(pair: string): `0x${string}` {
  return `0x${pair.repeat(32)}`;
}

async function loadAqua() {
  const { buildStrategy, buildSwapCall } = await import("@/lib/aqua");
  return { buildStrategy, buildSwapCall };
}

function strategyFor(feeBps = 30) {
  return import("@/lib/aqua").then(({ buildStrategy }) =>
    buildStrategy({
      maker: MAKER,
      token0: USDC,
      token1: WETH,
      feeBps,
      rockId: "1",
      streamIndex: 0,
    }),
  );
}

beforeEach(() => {
  vi.resetModules();
  process.env.NEXT_PUBLIC_AQUA_APP_ADDRESS = APP;
  process.env.NEXT_PUBLIC_AQUA_TAKER_ADDRESS = TAKER;
  process.env.NEXT_PUBLIC_AQUA_ADDRESS = AQUA;
  process.env.NEXT_PUBLIC_USDC_ADDRESS = USDC;
  process.env.NEXT_PUBLIC_WETH_ADDRESS = WETH;
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_AQUA_APP_ADDRESS;
  delete process.env.NEXT_PUBLIC_AQUA_TAKER_ADDRESS;
  delete process.env.NEXT_PUBLIC_AQUA_ADDRESS;
  delete process.env.NEXT_PUBLIC_USDC_ADDRESS;
  delete process.env.NEXT_PUBLIC_WETH_ADDRESS;
  delete process.env.NEXT_PUBLIC_PIMLICO_API_KEY;
  vi.resetModules();
});

describe("the batch a visitor submits", () => {
  it("approves the periphery — not Aqua, not the app — and then calls it", async () => {
    const { buildSwapCall } = await loadAqua();
    const { approvalCalls } = await import("@/lib/rock-account");
    const { XYC_SWAP_TAKER_ABI } = await import("@/lib/chain/abi/aqua-app");

    const plan = buildSwapCall({
      strategy: await strategyFor(),
      tokenIn: USDC,
      amountIn: BigInt(100_000_000),
      minAmountOut: BigInt(1),
    });
    expect(plan.state).toBe("REAL");
    if (plan.state !== "REAL") return;

    const batch = [
      ...approvalCalls({
        token: USDC,
        spender: plan.value.taker,
        currentAllowance: BigInt(0),
        amount: BigInt(100_000_000),
      }),
      plan.value.call,
    ];

    expect(batch).toHaveLength(2);

    const { ERC20_ABI } = await import("@/lib/chain/abi/erc20");
    const approve = decodeFunctionData({ abi: ERC20_ABI, data: batch[0].data });
    expect(approve.functionName).toBe("approve");
    // The taker approves the periphery, because XYCSwap calls back into its caller and the
    // periphery is what answers (NOTES.md §5). Approving Aqua here would revert.
    expect((approve.args as readonly [string, bigint])[0].toLowerCase()).toBe(TAKER);
    expect(batch[0].to.toLowerCase()).toBe(USDC);

    expect(batch[1].to.toLowerCase()).toBe(TAKER);
    const swap = decodeFunctionData({ abi: XYC_SWAP_TAKER_ABI, data: batch[1].data });
    expect(swap.functionName).toBe("swapExactIn");
    const args = swap.args as readonly unknown[];
    // The 2026-09-12 audit removed the caller-supplied `app` argument — the periphery is bound to
    // one app at deployment now, so nobody can point it at a contract of their own (finding F-6) —
    // and added a trailing `deadline` (finding F-8). Every argument shifted down one.
    expect(args[0]).toMatchObject({ token0: USDC, token1: WETH });
    expect(args[1]).toBe(true); // zeroForOne: selling token0 (USDC)
    expect(args[2]).toBe(BigInt(100_000_000));
    expect(args[3]).toBe(BigInt(1));
    expect(String(args[4])).toBe(zeroAddress); // "pay the caller"
    expect(args[5]).toBe(plan.value.deadline);
    expect(args[5]).toBeGreaterThan(BigInt(Math.floor(Date.now() / 1000)));
  });

  it("prefixes three calls when a stale USDC allowance has to be reset first", async () => {
    const { buildSwapCall } = await loadAqua();
    const { approvalCalls } = await import("@/lib/rock-account");

    const plan = buildSwapCall({
      strategy: await strategyFor(),
      tokenIn: USDC,
      amountIn: BigInt(50),
      minAmountOut: BigInt(0),
    });
    if (plan.state !== "REAL") {
      throw new Error(plan.state === "UNAVAILABLE" ? plan.reason : "expected REAL");
    }

    const batch = [
      ...approvalCalls({
        token: USDC,
        spender: plan.value.taker,
        currentAllowance: BigInt(10),
        amount: BigInt(50),
      }),
      plan.value.call,
    ];

    expect(batch).toHaveLength(3);
  });

  it("reads the direction from the token being sold", async () => {
    const { buildSwapCall } = await loadAqua();
    const strategy = await strategyFor();

    const selling0 = buildSwapCall({
      strategy,
      tokenIn: USDC,
      amountIn: BigInt(1),
      minAmountOut: BigInt(0),
    });
    const selling1 = buildSwapCall({
      strategy,
      tokenIn: WETH,
      amountIn: BigInt(1),
      minAmountOut: BigInt(0),
    });

    if (selling0.state !== "REAL" || selling1.state !== "REAL") throw new Error("expected REAL");
    expect(selling0.value.zeroForOne).toBe(true);
    expect(selling0.value.tokenOut.toLowerCase()).toBe(WETH);
    expect(selling1.value.zeroForOne).toBe(false);
    expect(selling1.value.tokenOut.toLowerCase()).toBe(USDC);
  });
});

describe("what the visitor is told they received", () => {
  it("reads the executed amount from Aqua's Pulled event, not from the preview", async () => {
    const { readAmountOutFromLogs } = await import("./useTakerActions");
    const { encodeAbiParameters, encodeEventTopics } = await import("viem");
    const { AQUA_ABI } = await import("@/lib/chain/abi/aqua");

    const strategyHash = sampleHash("ab");
    const paid = BigInt(987_654_321);

    // No Aqua event parameter is indexed, so everything lives in `data` (NOTES.md §8.2).
    const log = {
      address: AQUA,
      topics: encodeEventTopics({ abi: AQUA_ABI, eventName: "Pulled" }) as string[],
      data: encodeAbiParameters(
        [
          { name: "maker", type: "address" },
          { name: "app", type: "address" },
          { name: "strategyHash", type: "bytes32" },
          { name: "token", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        [MAKER, APP, strategyHash, WETH, paid],
      ) as string,
    };

    expect(readAmountOutFromLogs([log], { aqua: AQUA, strategyHash, tokenOut: WETH })).toBe(paid);
  });

  it("returns null — never a guess — when no matching event is in the receipt", async () => {
    const { readAmountOutFromLogs } = await import("./useTakerActions");
    const strategyHash = sampleHash("ab");

    expect(readAmountOutFromLogs([], { aqua: AQUA, strategyHash, tokenOut: WETH })).toBeNull();
    expect(
      readAmountOutFromLogs(
        [{ address: MAKER, topics: [sampleHash("11")], data: "0x" }],
        { aqua: AQUA, strategyHash, tokenOut: WETH },
      ),
    ).toBeNull();
  });

  it("ignores a Pulled event for a different strategy or a different token", async () => {
    const { readAmountOutFromLogs } = await import("./useTakerActions");
    const { encodeAbiParameters, encodeEventTopics } = await import("viem");
    const { AQUA_ABI } = await import("@/lib/chain/abi/aqua");

    const mine = sampleHash("ab");
    const theirs = sampleHash("cd");
    const topics = encodeEventTopics({ abi: AQUA_ABI, eventName: "Pulled" }) as string[];
    const data = (hash: string, token: string) =>
      encodeAbiParameters(
        [
          { name: "maker", type: "address" },
          { name: "app", type: "address" },
          { name: "strategyHash", type: "bytes32" },
          { name: "token", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        [MAKER, APP, hash as `0x${string}`, token as `0x${string}`, BigInt(5)],
      ) as string;

    expect(
      readAmountOutFromLogs([{ address: AQUA, topics, data: data(theirs, WETH) }], {
        aqua: AQUA,
        strategyHash: mine,
        tokenOut: WETH,
      }),
    ).toBeNull();

    expect(
      readAmountOutFromLogs([{ address: AQUA, topics, data: data(mine, USDC) }], {
        aqua: AQUA,
        strategyHash: mine,
        tokenOut: WETH,
      }),
    ).toBeNull();
  });
});

describe("availability gating", () => {
  it("refuses to build a swap when the periphery address is unset", async () => {
    delete process.env.NEXT_PUBLIC_AQUA_TAKER_ADDRESS;
    vi.resetModules();
    const { getAquaTakerAddress } = await import("@/lib/aqua");
    const result = getAquaTakerAddress();
    expect(result.state).toBe("UNAVAILABLE");
    if (result.state === "UNAVAILABLE") {
      expect(result.reason).toMatch(/NEXT_PUBLIC_AQUA_TAKER_ADDRESS/);
    }
  });

  it("refuses when the app address is unset", async () => {
    delete process.env.NEXT_PUBLIC_AQUA_APP_ADDRESS;
    vi.resetModules();
    const { getAquaAddresses } = await import("@/lib/aqua");
    const result = getAquaAddresses();
    expect(result.state).toBe("UNAVAILABLE");
    if (result.state === "UNAVAILABLE") {
      expect(result.reason).toMatch(/NEXT_PUBLIC_AQUA_APP_ADDRESS/);
    }
  });

  it("refuses when account abstraction is unconfigured — a visitor cannot pay gas without it", async () => {
    delete process.env.NEXT_PUBLIC_PIMLICO_API_KEY;
    vi.resetModules();
    const { pimlicoApiKey } = await import("@/lib/rock-account");
    const result = pimlicoApiKey();
    expect(result.state).toBe("UNAVAILABLE");
    if (result.state === "UNAVAILABLE") {
      expect(result.reason).toMatch(/NEXT_PUBLIC_PIMLICO_API_KEY/);
    }
  });

  it("uses a personal account salt that is not tied to any tag", async () => {
    const { PERSONAL_ACCOUNT_SALT, rockAccountSaltFor } = await import("@/lib/rock-account");
    expect(PERSONAL_ACCOUNT_SALT).toBe(BigInt(0));
    // A rock's account is salted with its tag; a visitor's is not, so the two can never collide.
    expect(rockAccountSaltFor(sampleHash("ab"))).not.toBe(PERSONAL_ACCOUNT_SALT);
  });
});
