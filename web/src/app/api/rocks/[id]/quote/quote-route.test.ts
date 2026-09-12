import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encodeStrategy } from "@/lib/aqua/strategy";

/**
 * `GET /api/rocks/[id]/quote`.
 *
 * The route is exercised with the chain stubbed at two seams: `readRockStreams` (what is shipped
 * and at what balances) and the public client (whether `XYCSwap.quoteExactIn` can be called). That
 * covers the two answers it can give — the app's own view, and the mirrored constant-product
 * arithmetic — and every way it must refuse instead of inventing a price.
 */

const MAKER = `0x${"11".repeat(20)}` as const;
const AQUA = `0x${"22".repeat(20)}` as const;
const APP = `0x${"33".repeat(20)}` as const;
const USDC = `0x${"44".repeat(20)}` as const;
const WETH = `0x${"55".repeat(20)}` as const;

// 2,000 USDC (6 dp) against 1 WETH (18 dp), 30 bps.
const VIRTUAL = { usdc: BigInt(2_000_000_000), weth: BigInt(10) ** BigInt(18) };
const FEE_BPS = BigInt(30);

/** Built, never written out, so the "no template-literal hashes" check holds here too (D-014b). */
function sampleHash(pair: string): `0x${string}` {
  return `0x${pair.repeat(32)}`;
}

const readRockStreams = vi.fn();
const readContract = vi.fn();

vi.mock("@/lib/aqua", async () => {
  const actual = await vi.importActual<typeof import("@/lib/aqua")>("@/lib/aqua");
  return {
    ...actual,
    readRockStreams: (...args: unknown[]) => readRockStreams(...args),
    getAquaAddresses: () => ({
      state: "REAL",
      value: { aqua: AQUA, app: APP, usdc: USDC, weth: WETH },
    }),
  };
});

vi.mock("@/lib/chain", async () => {
  const actual = await vi.importActual<typeof import("@/lib/chain")>("@/lib/chain");
  return {
    ...actual,
    getPublicClient: () => ({ readContract: (...args: unknown[]) => readContract(...args) }),
  };
});

vi.mock("@/lib/rate-limit", () => ({
  consumeIpRateLimit: async () => ({ allowed: true, enforced: true, remaining: 59 }),
}));

async function call(query: string) {
  const { GET } = await import("./route");
  const response = await GET(new Request(`https://bank-rock.com/api/rocks/1/quote${query}`), {
    params: Promise.resolve({ id: "1" }),
  });
  return { status: response.status, body: JSON.parse(await response.text()) };
}

function shippedStream(overrides: Partial<{ virtual: typeof VIRTUAL; streamIndex: bigint }> = {}) {
  const strategy = encodeStrategy({
    maker: MAKER,
    token0: USDC,
    token1: WETH,
    feeBps: FEE_BPS,
    rockId: "1",
    streamIndex: overrides.streamIndex ?? BigInt(0),
  });
  return {
    state: "REAL",
    value: {
      rockId: "1",
      maker: MAKER,
      app: APP,
      aqua: AQUA,
      actual: VIRTUAL,
      allowance: VIRTUAL,
      streams: [
        {
          strategyHash: sampleHash("ab"),
          strategy,
          feeBps: FEE_BPS,
          streamIndex: overrides.streamIndex ?? BigInt(0),
          virtual: overrides.virtual ?? VIRTUAL,
          executable: overrides.virtual ?? VIRTUAL,
        },
      ],
    },
  };
}

beforeEach(() => {
  vi.resetModules();
  readRockStreams.mockReset();
  readContract.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("the mirrored constant-product path", () => {
  it("quotes from the strategy's virtual balances when the app view cannot be called", async () => {
    readRockStreams.mockResolvedValue(shippedStream());
    readContract.mockRejectedValue(new Error("no RPC"));

    const { status, body } = await call("?maker=" + MAKER + "&tokenIn=USDC&amountIn=100");

    expect(status).toBe(200);
    expect(body.state).toBe("REAL");
    expect(body.value.source).toBe("lib/aqua/quote");
    expect(body.value.feeBps).toBe(30);

    // XYCSwap._quoteExactIn on 100 USDC against 2,000 USDC / 1 WETH at 30 bps:
    //   inWithFee = 100e6 * 9970 / 10000      = 99_700_000
    //   out       = inWithFee * 1e18 / (2e9 + inWithFee)
    const inWithFee = (BigInt(100_000_000) * BigInt(9970)) / BigInt(10_000);
    const expected = (inWithFee * VIRTUAL.weth) / (VIRTUAL.usdc + inWithFee);
    expect(body.value.amountOut).toBe(expected.toString());
    expect(BigInt(body.value.amountOut)).toBeGreaterThan(BigInt(0));
  });

  it("reports price impact in basis points, derived from the curve", async () => {
    readRockStreams.mockResolvedValue(shippedStream());
    readContract.mockRejectedValue(new Error("no RPC"));

    const small = await call(`?maker=${MAKER}&tokenIn=USDC&amountIn=1`);
    const large = await call(`?maker=${MAKER}&tokenIn=USDC&amountIn=500`);

    // Bigger trade, worse price: a property of x·y=k, not an annualisation of anything (D-004).
    expect(large.body.value.priceImpactBps).toBeGreaterThan(small.body.value.priceImpactBps);
    expect(Number.isInteger(large.body.value.priceImpactBps)).toBe(true);
  });

  it("formats the output in the output token's own decimals", async () => {
    readRockStreams.mockResolvedValue(shippedStream());
    readContract.mockRejectedValue(new Error("no RPC"));

    const usdcIn = await call(`?maker=${MAKER}&tokenIn=USDC&amountIn=100`);
    expect(usdcIn.body.tokenOut).toBe("WETH");
    // 18 decimals: the formatted figure is far below 1 for a 100-USDC trade on this curve.
    expect(Number(usdcIn.body.value.amountOutFormatted)).toBeLessThan(1);

    const wethIn = await call(`?maker=${MAKER}&tokenIn=WETH&amountIn=0.01`);
    expect(wethIn.body.tokenOut).toBe("USDC");
    expect(Number(wethIn.body.value.amountOutFormatted)).toBeGreaterThan(1);
  });
});

describe("the app's own view", () => {
  it("prefers XYCSwap.quoteExactIn and reports it as the source", async () => {
    readRockStreams.mockResolvedValue(shippedStream());
    readContract.mockResolvedValue(BigInt(123_456_789));

    const { body } = await call(`?maker=${MAKER}&tokenIn=USDC&amountIn=100`);

    expect(body.value.source).toBe("XYCSwap.quoteExactIn");
    expect(body.value.amountOut).toBe("123456789");
    expect(readContract).toHaveBeenCalledTimes(1);
  });
});

describe("refusals", () => {
  it("refuses when no strategy is shipped, rather than quoting zero", async () => {
    readRockStreams.mockResolvedValue({
      state: "UNAVAILABLE",
      reason: "This rock has no live Aqua strategy",
    });

    const { body } = await call(`?maker=${MAKER}&tokenIn=USDC&amountIn=100`);
    expect(body.state).toBe("UNAVAILABLE");
    expect(body.value).toBeNull();
    expect(body.reason).toMatch(/no live Aqua strategy/i);
  });

  it("refuses when the requested stream is not among the live ones", async () => {
    readRockStreams.mockResolvedValue(shippedStream({ streamIndex: BigInt(0) }));
    const { body } = await call(`?maker=${MAKER}&tokenIn=USDC&amountIn=100&streamIndex=1`);
    expect(body.state).toBe("UNAVAILABLE");
    expect(body.reason).toMatch(/stream 1/);
  });

  it("refuses when one side of the strategy is empty", async () => {
    readRockStreams.mockResolvedValue(
      shippedStream({ virtual: { usdc: VIRTUAL.usdc, weth: BigInt(0) } }),
    );
    const { body } = await call(`?maker=${MAKER}&tokenIn=USDC&amountIn=100`);
    expect(body.state).toBe("UNAVAILABLE");
    expect(body.reason).toMatch(/no balance on one side/i);
  });

  it("rejects a missing or malformed maker", async () => {
    expect((await call("?tokenIn=USDC&amountIn=1")).status).toBe(400);
    expect((await call("?maker=nope&tokenIn=USDC&amountIn=1")).status).toBe(400);
  });

  it("rejects an unknown token and a non-positive amount", async () => {
    expect((await call(`?maker=${MAKER}&tokenIn=DAI&amountIn=1`)).status).toBe(400);
    expect((await call(`?maker=${MAKER}&tokenIn=USDC&amountIn=0`)).status).toBe(400);
    expect((await call(`?maker=${MAKER}&tokenIn=USDC&amountIn=-1`)).status).toBe(400);
    expect((await call(`?maker=${MAKER}&tokenIn=USDC&amountIn=abc`)).status).toBe(400);
  });

  it("never answers with a price when it refuses", async () => {
    readRockStreams.mockResolvedValue({ state: "UNAVAILABLE", reason: "nothing shipped" });
    const { body } = await call(`?maker=${MAKER}&tokenIn=USDC&amountIn=100`);
    expect(JSON.stringify(body)).not.toMatch(/amountOutFormatted/);
  });
});
