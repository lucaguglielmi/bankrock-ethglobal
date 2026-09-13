import { describe, expect, it } from "vitest";
import { quoteExactIn } from "@/lib/aqua/quote";
import {
  archiveDemoRock,
  cancelDemoHandover,
  claimDemoHandover,
  dockDemoStrategy,
  fundDemoRock,
  openDemoHandover,
  shipDemoStrategy,
  swapDemo,
  topUpDemoStrategy,
} from "./actions";
import { DEMO_ADDRESSES, DEMO_ROCK_ID, isDemoRockId } from "./constants";
import { demoQuote } from "./quote";
import {
  demoOwnerFor,
  demoRecordFor,
  demoStrategyViewFor,
  deserializeDemoRock,
  seedDemoRock,
  serializeDemoRock,
  usdc,
  weth,
} from "./state";

/**
 * The demo rock's mutations, as rules.
 *
 * What is pinned: every result is `DEMO` or `UNAVAILABLE` and never `REAL`; no result and no
 * provenance row carries a `txHash`; a refused action leaves the state untouched; and a swap moves
 * exactly what `quoteExactIn` says it moves. Addresses are derived, never written.
 */

const NOW = Date.parse("2026-09-13T12:00:00Z");
const A_WALLET = DEMO_ADDRESSES.taker;

describe("the gate", () => {
  it("is the id alone, exactly", () => {
    expect(isDemoRockId(DEMO_ROCK_ID)).toBe(true);
    expect(isDemoRockId("0420")).toBe(false);
    expect(isDemoRockId(" 420")).toBe(false);
    expect(isDemoRockId("42")).toBe(false);
    expect(isDemoRockId(undefined)).toBe(false);
  });

  it("derives its addresses rather than writing them", () => {
    expect(DEMO_ADDRESSES.account).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(DEMO_ADDRESSES.account).not.toBe(DEMO_ADDRESSES.giver);
    expect(DEMO_ADDRESSES.giver).not.toBe(DEMO_ADDRESSES.taker);
  });
});

describe("the seed", () => {
  it("holds a lot of money and two live streams, and none of its history has a hash", () => {
    const seed = seedDemoRock(NOW);
    expect(seed.holdings).toEqual({ usdc: usdc("25000"), weth: weth("12.5") });
    expect(seed.streams.map((stream) => stream.label)).toEqual(["Wide", "Tight"]);
    expect(seed.streams[0].virtual).toEqual({ usdc: usdc("18000"), weth: weth("9") });
    expect(seed.streams[0].fees.swapCount).toBeGreaterThan(12);
    expect(seed.activity.length).toBeGreaterThan(10);
    for (const row of seed.activity) expect("txHash" in row).toBe(false);
  });

  it("survives a round trip through storage, bigints included", () => {
    const seed = seedDemoRock(NOW);
    const back = deserializeDemoRock(serializeDemoRock(seed));
    expect(back).toEqual(seed);
    expect(typeof back?.holdings.usdc).toBe("bigint");
  });

  it("refuses a payload that is not exactly its shape", () => {
    expect(deserializeDemoRock("not json")).toBeNull();
    expect(deserializeDemoRock(JSON.stringify({ version: 2 }))).toBeNull();
    expect(deserializeDemoRock(JSON.stringify({ version: 1, state: "awake" }))).toBeNull();
  });

  it("belongs to whoever is signed in, and to the previous owner when nobody is", () => {
    const seed = seedDemoRock(NOW);
    expect(demoOwnerFor(seed, A_WALLET)).toBe(A_WALLET);
    expect(demoOwnerFor(seed)).toBe(DEMO_ADDRESSES.giver);
    expect(demoRecordFor(seed, A_WALLET).state).toBe("awake");
    expect(demoRecordFor(seed, A_WALLET).rockId).toBe(DEMO_ROCK_ID);
  });

  it("computes real-looking strategy hashes and executable = min(virtual, held, allowance)", () => {
    const view = demoStrategyViewFor(seedDemoRock(NOW));
    expect(view.streams).toHaveLength(2);
    for (const stream of view.streams) expect(stream.strategyHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(view.streams[0].strategyHash).not.toBe(view.streams[1].strategyHash);
    // Tight allows 12,000 USDC; held is 25,000 and the allowance 18,000, so 12,000 is executable.
    expect(view.streams[1].executable.usdc).toBe(usdc("12000"));
    expect(view.stopped).toEqual([]);
  });
});

describe("funding", () => {
  it("credits the rock and writes a row, as DEMO", () => {
    const seed = seedDemoRock(NOW);
    const { state, result } = fundDemoRock(seed, { usdc: usdc("1000"), weth: weth("0.5") }, NOW);
    expect(result.state).toBe("DEMO");
    expect(state.holdings).toEqual({ usdc: usdc("26000"), weth: weth("13") });
    expect(state.activity[0].title).toBe("Funded");
    expect("txHash" in state.activity[0]).toBe(false);
  });

  it("refuses nothing at all, and leaves the state alone", () => {
    const seed = seedDemoRock(NOW);
    const { state, result } = fundDemoRock(seed, { usdc: usdc(0), weth: weth(0) }, NOW);
    expect(result.state).toBe("UNAVAILABLE");
    expect(state).toBe(seed);
  });
});

describe("strategies", () => {
  it("ships the third preset and raises the allowance only when the shipment is larger", () => {
    const seed = seedDemoRock(NOW);
    const { state, result } = shipDemoStrategy(
      seed,
      { streamIndex: 2, feeBps: 100, usdcAmount: usdc("20000"), wethAmount: weth("1") },
      NOW,
    );
    expect(result.state).toBe("DEMO");
    if (result.state !== "DEMO") return;
    expect(result.value.strategyHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(state.streams).toHaveLength(3);
    expect(state.streams[2].label).toBe("Patient");
    expect(state.allowance).toEqual({ usdc: usdc("20000"), weth: weth("9") });
    // Shipping moves nothing.
    expect(state.holdings).toEqual(seed.holdings);
  });

  it("refuses a live index, a stopped index, a wrong fee and more than the rock holds", () => {
    const seed = seedDemoRock(NOW);
    const amounts = { usdcAmount: usdc("1"), wethAmount: weth("0.001") };
    expect(shipDemoStrategy(seed, { streamIndex: 0, feeBps: 30, ...amounts }, NOW).result.state).toBe("UNAVAILABLE");
    expect(shipDemoStrategy(seed, { streamIndex: 2, feeBps: 31, ...amounts }, NOW).result.state).toBe("UNAVAILABLE");
    expect(
      shipDemoStrategy(seed, { streamIndex: 2, feeBps: 100, usdcAmount: usdc("25001"), wethAmount: weth("1") }, NOW)
        .result.state,
    ).toBe("UNAVAILABLE");
    const docked = dockDemoStrategy(seed, 1, NOW).state;
    expect(shipDemoStrategy(docked, { streamIndex: 1, feeBps: 5, ...amounts }, NOW).result.state).toBe("UNAVAILABLE");
  });

  it("tops up a live stream: more allowed, nothing moved, the fee untouched, and DEMO", () => {
    const seed = seedDemoRock(NOW);
    const wide = seed.streams[0];
    const { state, result } = topUpDemoStrategy(
      seed,
      { streamIndex: 0, usdcAmount: usdc("2000"), wethAmount: weth("1") },
      NOW,
    );
    expect(result.state).toBe("DEMO");
    if (result.state !== "DEMO") return;
    expect("txHash" in result.value).toBe(false);
    expect(result.value.virtual).toEqual({
      usdc: wide.virtual.usdc + usdc("2000"),
      weth: wide.virtual.weth + weth("1"),
    });

    const after = state.streams[0];
    expect(after.virtual).toEqual(result.value.virtual);
    expect(after.feeBps).toBe(wide.feeBps);
    expect(after.fees).toEqual(wide.fees);
    // A top-up moves nothing and is not a trade.
    expect(state.holdings).toEqual(seed.holdings);
    expect(state.taker).toEqual(seed.taker);
    // The allowance covers at least the new virtual balance: 18,000 → 20,000 USDC; WETH was
    // already 9 for a stream that now allows 10, so it rises to 10.
    expect(state.allowance).toEqual({ usdc: usdc("20000"), weth: weth("10") });
    expect(state.activity[0].title).toBe("Strategy topped up");
    expect("txHash" in state.activity[0]).toBe(false);
    // The other stream is untouched.
    expect(state.streams[1]).toEqual(seed.streams[1]);
  });

  it("tops up one token alone, and never lowers an allowance that was already wider", () => {
    const seed = seedDemoRock(NOW);
    const { state, result } = topUpDemoStrategy(
      seed,
      { streamIndex: 1, usdcAmount: usdc("1000"), wethAmount: weth(0) },
      NOW,
    );
    expect(result.state).toBe("DEMO");
    // Tight allowed 12,000 USDC; now 13,000. The 18,000 allowance already covers it.
    expect(state.streams[1].virtual.usdc).toBe(usdc("13000"));
    expect(state.streams[1].virtual.weth).toBe(seed.streams[1].virtual.weth);
    expect(state.allowance).toEqual(seed.allowance);
  });

  it("refuses a stream that is not live, nothing at all, and more than the rock holds - leaving the state alone", () => {
    const seed = seedDemoRock(NOW);
    const notLive = topUpDemoStrategy(seed, { streamIndex: 2, usdcAmount: usdc("1"), wethAmount: weth(0) }, NOW);
    expect(notLive.result.state).toBe("UNAVAILABLE");
    expect(notLive.state).toBe(seed);

    const nothing = topUpDemoStrategy(seed, { streamIndex: 0, usdcAmount: usdc(0), wethAmount: weth(0) }, NOW);
    expect(nothing.result.state).toBe("UNAVAILABLE");
    expect(nothing.state).toBe(seed);

    const tooMuch = topUpDemoStrategy(seed, { streamIndex: 0, usdcAmount: usdc("25001"), wethAmount: weth(0) }, NOW);
    expect(tooMuch.result.state).toBe("UNAVAILABLE");
    expect(tooMuch.state).toBe(seed);

    const docked = dockDemoStrategy(seed, 0, NOW).state;
    expect(topUpDemoStrategy(docked, { streamIndex: 0, usdcAmount: usdc("1"), wethAmount: weth(0) }, NOW).result.state).toBe("UNAVAILABLE");
  });

  it("docks a stream: it is gone, marked stopped, and nothing came back", () => {
    const seed = seedDemoRock(NOW);
    const { state, result } = dockDemoStrategy(seed, 0, NOW);
    expect(result.state).toBe("DEMO");
    expect(state.streams.map((stream) => stream.streamIndex)).toEqual([1]);
    expect(state.stopped).toEqual([0]);
    expect(state.holdings).toEqual(seed.holdings);
    expect(demoStrategyViewFor(state).stopped).toEqual([BigInt(0)]);
  });
});

describe("a swap", () => {
  it("moves exactly what quoteExactIn says, keeps the fee in the rock, and is DEMO", () => {
    const seed = seedDemoRock(NOW);
    const wide = seed.streams[0];
    const amountIn = usdc("500");
    const expected = quoteExactIn(
      { balanceIn: wide.virtual.usdc, balanceOut: wide.virtual.weth, feeBps: wide.feeBps },
      amountIn,
    );

    const { state, result } = swapDemo(
      seed,
      { streamIndex: 0, tokenIn: "USDC", amountIn, minAmountOut: BigInt(0) },
      NOW,
    );
    expect(result.state).toBe("DEMO");
    if (result.state !== "DEMO") return;
    expect(result.value.amountOut).toBe(expected.amountOut);
    expect("txHash" in result.value).toBe(false);

    const after = state.streams[0];
    expect(after.virtual.usdc).toBe(wide.virtual.usdc + amountIn);
    expect(after.virtual.weth).toBe(wide.virtual.weth - expected.amountOut);
    expect(after.fees.usdc).toBe(wide.fees.usdc + expected.feeAmount);
    expect(after.fees.swapCount).toBe(wide.fees.swapCount + 1);
    expect(state.holdings.usdc).toBe(seed.holdings.usdc + amountIn);
    expect(state.holdings.weth).toBe(seed.holdings.weth - expected.amountOut);
    expect(state.allowance.weth).toBe(seed.allowance.weth - expected.amountOut);
    expect(state.taker.usdc).toBe(seed.taker.usdc - amountIn);
    expect(state.taker.weth).toBe(seed.taker.weth + expected.amountOut);
    expect(state.activity[0].type).toBe("trade");
  });

  it("agrees with the quote the route serves for the same trade", () => {
    const seed = seedDemoRock(NOW);
    const quote = demoQuote({ streamIndex: 1, tokenIn: "WETH", amountIn: "0.25" }, seed);
    expect(quote.state).toBe("DEMO");
    if (quote.state !== "DEMO") return;
    expect(quote.value.source).toBe("demo");
    expect(quote.value.feeBps).toBe(5);
    const { result } = swapDemo(
      seed,
      { streamIndex: 1, tokenIn: "WETH", amountIn: weth("0.25"), minAmountOut: BigInt(0) },
      NOW,
    );
    if (result.state !== "DEMO") throw new Error("expected DEMO");
    expect(result.value.amountOut.toString()).toBe(quote.value.amountOut);
  });

  it("honours the floor, the stream's payable size and the visitor's balance", () => {
    const seed = seedDemoRock(NOW);
    const floorTooHigh = swapDemo(
      seed,
      { streamIndex: 0, tokenIn: "USDC", amountIn: usdc("100"), minAmountOut: weth("1") },
      NOW,
    );
    expect(floorTooHigh.result.state).toBe("UNAVAILABLE");
    expect(floorTooHigh.state).toBe(seed);

    // The curve alone never pays out a whole balance, so the binding cap is the wallet: with only
    // 1 WETH held, Tight can settle min(3 virtual, 1 held, 9 allowance) = 1 WETH, and a swap that
    // would pull ~2.6 WETH is refused rather than half-filled (NOTES.md §7).
    const thin = { ...seed, holdings: { ...seed.holdings, weth: weth("1") } };
    const tooBig = swapDemo(
      thin,
      { streamIndex: 1, tokenIn: "USDC", amountIn: usdc("40000"), minAmountOut: BigInt(0) },
      NOW,
    );
    expect(tooBig.result.state).toBe("UNAVAILABLE");
    expect(tooBig.state).toBe(thin);

    const broke = { ...seed, taker: { usdc: usdc("1"), weth: weth("0") } };
    expect(
      swapDemo(broke, { streamIndex: 0, tokenIn: "USDC", amountIn: usdc("2"), minAmountOut: BigInt(0) }, NOW)
        .result.state,
    ).toBe("UNAVAILABLE");
  });

  it("refuses a stream that is not live", () => {
    const seed = seedDemoRock(NOW);
    expect(
      swapDemo(seed, { streamIndex: 2, tokenIn: "USDC", amountIn: usdc("1"), minAmountOut: BigInt(0) }, NOW)
        .result.state,
    ).toBe("UNAVAILABLE");
    expect(demoQuote({ streamIndex: 2, tokenIn: "USDC", amountIn: "1" }, seed).state).toBe("UNAVAILABLE");
  });
});

describe("a gift", () => {
  const expiresAt = Math.floor(NOW / 1000) + 7 * 24 * 60 * 60;

  it("opens, shows, cancels", () => {
    const seed = seedDemoRock(NOW);
    const opened = openDemoHandover(seed, { recipient: A_WALLET, expiresAt, message: " Happy birthday. " }, NOW);
    expect(opened.result.state).toBe("DEMO");
    expect(opened.state.state).toBe("handover_pending");
    expect(opened.state.handover?.message).toBe("Happy birthday.");

    const record = demoRecordFor(opened.state, DEMO_ADDRESSES.giver);
    expect(record.state).toBe("handover_pending");
    expect(record.handover?.recipient).toBe(A_WALLET);
    expect(record.handover?.expiresAt).toBe(expiresAt);

    // Signed in as the named recipient, the rock is not yours yet.
    expect(demoOwnerFor(opened.state, A_WALLET)).toBe(DEMO_ADDRESSES.giver);

    // Strategies are frozen while it is open.
    expect(dockDemoStrategy(opened.state, 0, NOW).result.state).toBe("UNAVAILABLE");

    const cancelled = cancelDemoHandover(opened.state, NOW);
    expect(cancelled.result.state).toBe("DEMO");
    expect(cancelled.state.state).toBe("awake");
    expect(cancelled.state.handover).toBeNull();
  });

  it("is claimed only by the named wallet, before it expires, and then that wallet owns the rock", () => {
    const seed = seedDemoRock(NOW);
    const opened = openDemoHandover(seed, { recipient: A_WALLET, expiresAt }, NOW).state;
    expect(claimDemoHandover(opened, DEMO_ADDRESSES.giver, NOW).result.state).toBe("UNAVAILABLE");
    expect(claimDemoHandover(opened, A_WALLET, (expiresAt + 1) * 1000).result.state).toBe("UNAVAILABLE");
    const claimed = claimDemoHandover(opened, A_WALLET, NOW);
    expect(claimed.result.state).toBe("DEMO");
    expect(claimed.state.owner).toBe(A_WALLET);
    expect(demoOwnerFor(claimed.state, DEMO_ADDRESSES.giver)).toBe(A_WALLET);
  });

  it("refuses an expiry in the past and a second handover", () => {
    const seed = seedDemoRock(NOW);
    expect(
      openDemoHandover(seed, { recipient: A_WALLET, expiresAt: Math.floor(NOW / 1000) - 1 }, NOW).result.state,
    ).toBe("UNAVAILABLE");
    const opened = openDemoHandover(seed, { recipient: A_WALLET, expiresAt }, NOW).state;
    expect(openDemoHandover(opened, { recipient: A_WALLET, expiresAt }, NOW).result.state).toBe("UNAVAILABLE");
  });
});

describe("retiring", () => {
  it("ends the streams and refuses everything after", () => {
    const seed = seedDemoRock(NOW);
    const { state, result } = archiveDemoRock(seed, NOW);
    expect(result.state).toBe("DEMO");
    expect(state.state).toBe("archived");
    expect(state.streams).toEqual([]);
    expect(fundDemoRock(state, { usdc: usdc("1"), weth: weth(0) }, NOW).result.state).toBe("UNAVAILABLE");
    expect(archiveDemoRock(state, NOW).result.state).toBe("UNAVAILABLE");
  });
});

describe("no result is ever REAL", () => {
  it("across every action", () => {
    const seed = seedDemoRock(NOW);
    const results = [
      fundDemoRock(seed, { usdc: usdc("1"), weth: weth(0) }, NOW).result,
      shipDemoStrategy(seed, { streamIndex: 2, feeBps: 100, usdcAmount: usdc("1"), wethAmount: weth("0.001") }, NOW).result,
      dockDemoStrategy(seed, 0, NOW).result,
      topUpDemoStrategy(seed, { streamIndex: 0, usdcAmount: usdc("1"), wethAmount: weth(0) }, NOW).result,
      swapDemo(seed, { streamIndex: 0, tokenIn: "USDC", amountIn: usdc("1"), minAmountOut: BigInt(0) }, NOW).result,
      openDemoHandover(seed, { recipient: A_WALLET, expiresAt: Math.floor(NOW / 1000) + 60 }, NOW).result,
      archiveDemoRock(seed, NOW).result,
    ];
    for (const result of results) expect(result.state).toBe("DEMO");
  });
});
