import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";
import { buildStrategy, DEFAULT_STREAMS } from "./strategy";

/**
 * The fee scan (B6): chunked at 2,000 blocks, resumed from what has already been scanned, and
 * UNAVAILABLE - never a short total - when a chunk fails.
 *
 * Addresses are built rather than written out, so the repository-wide "no address literal outside
 * lib/chain" check (D-015) stays true of the test suite too.
 */
function sampleAddress(digit: string): Address {
  return `0x${digit.repeat(40)}` as Address;
}

const AQUA = sampleAddress("a");
const APP = sampleAddress("b");
const USDC = sampleAddress("c");
const WETH = sampleAddress("d");
const MAKER = sampleAddress("e");
const STRATEGY_HASH = `0x${"f".repeat(64)}` as Hex;

interface LoggedRange {
  fromBlock: bigint;
  toBlock: bigint;
  event: string;
}

interface PushedLog {
  blockNumber: bigint;
  transactionHash: string;
  args: { maker: Address; app: Address; strategyHash: Hex; token: Address; amount: bigint };
}

interface ShippedLog {
  blockNumber: bigint;
  transactionHash: string;
  args: { maker: Address; app: Address; strategyHash: Hex };
}

/** `Pulled` has the same shape as `Pushed`; a swap emits one of each in one transaction. */
type PulledLog = PushedLog;

/** The `Pulled` a swap emits beside its `Pushed`: same transaction, the other token. */
function pullFor(push: PushedLog, amount: bigint = BigInt(1)): PulledLog {
  const token = push.args.token.toLowerCase() === USDC.toLowerCase() ? WETH : USDC;
  return { ...push, args: { ...push.args, token, amount } };
}

const state = {
  head: BigInt(0),
  ranges: [] as LoggedRange[],
  pushed: [] as PushedLog[],
  shipped: [] as ShippedLog[],
  pulled: [] as PulledLog[],
  failFrom: null as bigint | null,
  /** Strategy hashes `safeBalances` answers for, with their virtual balances. */
  live: new Map<string, readonly [bigint, bigint]>(),
  /** Strategy hashes `rawBalances` reports as docked (tokensCount 0xff). */
  docked: new Set<string>(),
  /** Every `readContract` made, by function name. */
  calls: [] as string[],
  wallet: { usdc: BigInt(0), weth: BigInt(0) },
  allowance: { usdc: BigInt(0), weth: BigInt(0) },
};

const client = {
  async getBlockNumber() {
    return state.head;
  },
  async readContract({
    address,
    functionName,
    args,
  }: {
    address: Address;
    functionName: string;
    args: readonly unknown[];
  }) {
    state.calls.push(functionName);
    const token = address.toLowerCase() === USDC.toLowerCase() ? "usdc" : "weth";
    if (functionName === "balanceOf") return state.wallet[token];
    if (functionName === "allowance") return state.allowance[token];
    if (functionName === "safeBalances") {
      const balances = state.live.get(String(args[2]).toLowerCase());
      if (!balances) throw new Error("SafeBalancesForTokenNotInActiveStrategy");
      return balances;
    }
    if (functionName === "rawBalances") {
      return state.docked.has(String(args[2]).toLowerCase())
        ? ([BigInt(0), 0xff] as const)
        : ([BigInt(0), 0] as const);
    }
    throw new Error(`unexpected read: ${functionName}`);
  },
  async getLogs({
    event,
    fromBlock,
    toBlock,
  }: {
    event: { name: string };
    fromBlock: bigint;
    toBlock: bigint;
  }) {
    state.ranges.push({ fromBlock, toBlock, event: event.name });
    if (state.failFrom !== null && toBlock >= state.failFrom) {
      throw new Error("query returned more than 10000 results");
    }
    const within = (block: bigint) => block >= fromBlock && block <= toBlock;
    if (event.name === "Pushed") return state.pushed.filter((log) => within(log.blockNumber));
    if (event.name === "Pulled") return state.pulled.filter((log) => within(log.blockNumber));
    return state.shipped.filter((log) => within(log.blockNumber));
  },
};

vi.mock("@/lib/chain", async () => {
  const demo = await import("@/lib/demo");
  return {
    getPublicClient: () => client,
    requireAddress: () => demo.real(AQUA),
    addresses: { aqua: AQUA, usdc: USDC, weth: WETH },
  };
});

process.env.NEXT_PUBLIC_AQUA_APP_ADDRESS = APP;
process.env.AQUA_APP_DEPLOY_BLOCK = "1000";

type ReadModule = typeof import("./read");
let readModule: ReadModule;

async function readFees(overrides: Partial<Parameters<ReadModule["readAccruedFees"]>[0]> = {}) {
  return readModule.readAccruedFees({
    maker: MAKER,
    app: APP,
    strategyHash: STRATEGY_HASH,
    feeBps: 30,
    ...overrides,
  });
}

function pushedRange(event: string): LoggedRange[] {
  return state.ranges.filter((range) => range.event === event);
}

beforeEach(async () => {
  readModule = await import("./read");
  readModule.resetFeeScanCache();
  state.head = BigInt(0);
  state.ranges = [];
  state.pushed = [];
  state.shipped = [];
  state.pulled = [];
  state.failFrom = null;
  state.live = new Map();
  state.docked = new Set();
  state.calls = [];
  state.wallet = { usdc: BigInt(0), weth: BigInt(0) };
  state.allowance = { usdc: BigInt(0), weth: BigInt(0) };
});

/**
 * The catalogue probe: one `safeBalances` per preset, live streams in catalogue order, docked
 * ones told apart from never-shipped ones, and virtual balances never summed.
 */
describe("readRockStreams - probing the catalogue", () => {
  const ROCK_ID = "42";

  function hashFor(preset: { streamIndex: number; feeBps: number }) {
    return buildStrategy({
      maker: MAKER,
      token0: USDC,
      token1: WETH,
      feeBps: preset.feeBps,
      rockId: ROCK_ID,
      streamIndex: preset.streamIndex,
    }).strategyHash.toLowerCase();
  }

  it("asks Aqua once per catalogue preset, whatever the catalogue's length", async () => {
    const result = await readModule.readRockStreams({ rockId: ROCK_ID, maker: MAKER, app: APP });
    // Nothing shipped is a REAL, empty answer - not an error - so the owner's way in stays on
    // screen (main, 2026-09-13).
    expect(result.state).toBe("REAL");
    if (result.state !== "REAL") return;
    expect(result.value.streams).toEqual([]);
    expect(result.value.stopped).toEqual([]);
    expect(state.calls.filter((name) => name === "safeBalances")).toHaveLength(
      DEFAULT_STREAMS.length,
    );
  });

  it("returns the live streams in catalogue order, each with its own executable amount", async () => {
    state.wallet = { usdc: BigInt(1_000), weth: BigInt(10) };
    state.allowance = { usdc: BigInt(5_000), weth: BigInt(5) };
    // Every preset live, and each one is allowed more than the wallet holds: virtual balances
    // over one reserve may sum past it, which is exactly why they are never added up.
    for (const preset of DEFAULT_STREAMS) {
      state.live.set(hashFor(preset), [BigInt(4_000), BigInt(8)]);
    }

    const result = await readModule.readRockStreams({ rockId: ROCK_ID, maker: MAKER, app: APP });
    expect(result.state).toBe("REAL");
    if (result.state !== "REAL") return;

    expect(result.value.streams.map((stream) => Number(stream.streamIndex))).toEqual(
      DEFAULT_STREAMS.map((preset) => preset.streamIndex),
    );
    for (const [i, stream] of result.value.streams.entries()) {
      expect(stream.feeBps).toBe(BigInt(DEFAULT_STREAMS[i].feeBps));
      expect(stream.label).toBe(DEFAULT_STREAMS[i].label);
      expect(stream.virtual).toEqual({ usdc: BigInt(4_000), weth: BigInt(8) });
      // executable = min(virtual, wallet, allowance): USDC is capped by the wallet, WETH by the
      // allowance to Aqua.
      expect(stream.executable).toEqual({ usdc: BigInt(1_000), weth: BigInt(5) });
    }
    expect(result.value.actual).toEqual({ usdc: BigInt(1_000), weth: BigInt(10) });
    expect(result.value.stopped).toEqual([]);
  });

  it("tells a stopped (docked) stream apart from one never shipped", async () => {
    const [first, second, ...rest] = DEFAULT_STREAMS;
    state.live.set(hashFor(first), [BigInt(1), BigInt(1)]);
    state.docked.add(hashFor(second));

    const result = await readModule.readRockStreams({ rockId: ROCK_ID, maker: MAKER, app: APP });
    expect(result.state).toBe("REAL");
    if (result.state !== "REAL") return;

    expect(result.value.streams.map((stream) => Number(stream.streamIndex))).toEqual([
      first.streamIndex,
    ]);
    expect(result.value.stopped).toEqual([BigInt(second.streamIndex)]);
    // The never-shipped presets are in neither list - they are what "Add another strategy" offers.
    for (const preset of rest) {
      expect(result.value.stopped).not.toContain(BigInt(preset.streamIndex));
    }
    // `rawBalances` is only asked about the presets `safeBalances` refused.
    expect(state.calls.filter((name) => name === "rawBalances")).toHaveLength(
      DEFAULT_STREAMS.length - 1,
    );
  });

  it("probes only the streams the caller names, when it names them", async () => {
    const preset = DEFAULT_STREAMS[1];
    state.live.set(hashFor(preset), [BigInt(1), BigInt(1)]);

    const result = await readModule.readRockStreams({
      rockId: ROCK_ID,
      maker: MAKER,
      app: APP,
      streams: [preset],
    });
    expect(result.state).toBe("REAL");
    expect(state.calls.filter((name) => name === "safeBalances")).toHaveLength(1);
  });
});

describe("planFeeScan", () => {
  it("scans the whole range when nothing is cached", () => {
    const plan = readModule.planFeeScan(undefined, BigInt(1000));
    expect(plan).toEqual({ reuse: false, fromBlock: BigInt(1000), scanFrom: BigInt(1000) });
  });

  it("resumes one block after what was already scanned", () => {
    const plan = readModule.planFeeScan(
      { fromBlock: BigInt(1000), scannedTo: BigInt(5000) },
      BigInt(1000),
    );
    expect(plan).toEqual({ reuse: true, fromBlock: BigInt(1000), scanFrom: BigInt(5001) });
  });

  it("keeps the earlier start when the caller asks for a later one", () => {
    const plan = readModule.planFeeScan(
      { fromBlock: BigInt(900), scannedTo: BigInt(5000) },
      BigInt(1000),
    );
    expect(plan.reuse).toBe(true);
    expect(plan.fromBlock).toBe(BigInt(900));
  });

  it("discards a cache that starts later than the caller wants, rather than narrowing the range", () => {
    const plan = readModule.planFeeScan(
      { fromBlock: BigInt(4000), scannedTo: BigInt(5000) },
      BigInt(1000),
    );
    expect(plan).toEqual({ reuse: false, fromBlock: BigInt(1000), scanFrom: BigInt(1000) });
  });
});

describe("readAccruedFees - chunking (D-036)", () => {
  it("never asks for more than 2,000 blocks in one call", async () => {
    state.head = BigInt(1000 + 9_999);
    const result = await readFees();
    expect(result.state).toBe("REAL");

    const ranges = pushedRange("Pushed");
    expect(ranges.length).toBeGreaterThan(1);
    for (const range of ranges) {
      expect(range.toBlock - range.fromBlock + BigInt(1)).toBeLessThanOrEqual(BigInt(2000));
    }
  });

  it("covers the deploy block to the head exactly once", async () => {
    state.head = BigInt(1000 + 5_001);
    await readFees();

    const ranges = pushedRange("Pushed");
    expect(ranges[0].fromBlock).toBe(BigInt(1000));
    expect(ranges[ranges.length - 1].toBlock).toBe(state.head);
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i].fromBlock).toBe(ranges[i - 1].toBlock + BigInt(1));
    }
  });

  it("asks for Shipped and Pulled over the same chunk as Pushed, so a launch or a swap is never split", async () => {
    state.head = BigInt(1000 + 3_000);
    await readFees();
    const spans = (event: string) =>
      pushedRange(event).map((range) => `${range.fromBlock}-${range.toBlock}`);
    expect(spans("Shipped")).toEqual(spans("Pushed"));
    expect(spans("Pulled")).toEqual(spans("Pushed"));
  });
});

describe("readAccruedFees - resuming", () => {
  it("fetches only the new blocks on the next poll", async () => {
    state.head = BigInt(3_000);
    await readFees();
    state.ranges = [];

    state.head = BigInt(3_010);
    const result = await readFees();
    expect(result.state).toBe("REAL");

    const ranges = pushedRange("Pushed");
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toMatchObject({ fromBlock: BigInt(3_001), toBlock: BigInt(3_010) });
  });

  it("asks for nothing at all when the head has not moved", async () => {
    state.head = BigInt(3_000);
    await readFees();
    state.ranges = [];

    const result = await readFees();
    expect(result.state).toBe("REAL");
    expect(state.ranges).toHaveLength(0);
    if (result.state === "REAL") {
      expect(result.value.fromBlock).toBe(BigInt(1000));
      expect(result.value.toBlock).toBe(BigInt(3_000));
    }
  });

  it("counts a swap once, not once per poll", async () => {
    state.pushed = [
      {
        blockNumber: BigInt(2_000),
        transactionHash: "0xswap",
        args: { maker: MAKER, app: APP, strategyHash: STRATEGY_HASH, token: USDC, amount: BigInt(10_000) },
      },
    ];
    state.pulled = state.pushed.map((push) => pullFor(push));
    state.head = BigInt(3_000);

    const first = await readFees();
    state.head = BigInt(3_500);
    const second = await readFees();

    expect(first.state).toBe("REAL");
    expect(second.state).toBe("REAL");
    if (first.state === "REAL" && second.state === "REAL") {
      // 10,000 base units at 30 bps is 30.
      expect(first.value.earned.usdc).toBe(BigInt(30));
      expect(first.value.swapCount).toBe(1);
      expect(second.value.earned.usdc).toBe(BigInt(30));
      expect(second.value.swapCount).toBe(1);
      expect(second.value.toBlock).toBe(BigInt(3_500));
      expect(second.value.complete).toBe(true);
    }
  });

  it("still excludes the pushes that share a transaction with Shipped", async () => {
    state.pushed = [
      {
        blockNumber: BigInt(1_500),
        transactionHash: "0xship",
        args: { maker: MAKER, app: APP, strategyHash: STRATEGY_HASH, token: USDC, amount: BigInt(1_000_000) },
      },
      {
        blockNumber: BigInt(2_500),
        transactionHash: "0xswap",
        args: { maker: MAKER, app: APP, strategyHash: STRATEGY_HASH, token: WETH, amount: BigInt(20_000) },
      },
    ];
    state.shipped = [
      {
        blockNumber: BigInt(1_500),
        transactionHash: "0xship",
        args: { maker: MAKER, app: APP, strategyHash: STRATEGY_HASH },
      },
    ];
    state.pulled = [pullFor(state.pushed[1])];
    state.head = BigInt(4_000);

    const result = await readFees();
    expect(result.state).toBe("REAL");
    if (result.state === "REAL") {
      expect(result.value.earned.usdc).toBe(BigInt(0));
      expect(result.value.earned.weth).toBe(BigInt(60));
      expect(result.value.swapCount).toBe(1);
    }
  });

  it("does not count a push with no pull in its transaction - the owner's top-up is not a trade", async () => {
    state.pushed = [
      {
        // The owner made more USDC available to the strategy (Edit → `Aqua.push`). No `Shipped`
        // and no `Pulled` in this transaction: nothing was traded, so no fee was earned.
        blockNumber: BigInt(2_000),
        transactionHash: "0xtopup",
        args: { maker: MAKER, app: APP, strategyHash: STRATEGY_HASH, token: USDC, amount: BigInt(5_000_000) },
      },
      {
        blockNumber: BigInt(2_500),
        transactionHash: "0xswap",
        args: { maker: MAKER, app: APP, strategyHash: STRATEGY_HASH, token: USDC, amount: BigInt(10_000) },
      },
    ];
    state.pulled = [pullFor(state.pushed[1])];
    state.head = BigInt(3_000);

    const result = await readFees();
    expect(result.state).toBe("REAL");
    if (result.state === "REAL") {
      // Only the swap: 10,000 at 30 bps. The 5,000,000 top-up would have booked 15,000 of fees.
      expect(result.value.earned.usdc).toBe(BigInt(30));
      expect(result.value.earned.weth).toBe(BigInt(0));
      expect(result.value.swapCount).toBe(1);
    }
  });

  it("does not let a pull for another strategy in the same transaction vouch for a push", async () => {
    const other = `0x${"2".repeat(64)}` as Hex;
    state.pushed = [
      {
        blockNumber: BigInt(2_000),
        transactionHash: "0xbatch",
        args: { maker: MAKER, app: APP, strategyHash: STRATEGY_HASH, token: USDC, amount: BigInt(10_000) },
      },
    ];
    state.pulled = [
      {
        blockNumber: BigInt(2_000),
        transactionHash: "0xbatch",
        args: { maker: MAKER, app: APP, strategyHash: other, token: WETH, amount: BigInt(1) },
      },
    ];
    state.head = BigInt(3_000);

    const result = await readFees();
    expect(result.state).toBe("REAL");
    if (result.state === "REAL") {
      expect(result.value.swapCount).toBe(0);
      expect(result.value.earned.usdc).toBe(BigInt(0));
    }
  });

  it("ignores logs belonging to another strategy", async () => {
    state.pushed = [
      {
        blockNumber: BigInt(2_000),
        transactionHash: "0xother",
        args: {
          maker: MAKER,
          app: APP,
          strategyHash: `0x${"1".repeat(64)}` as Hex,
          token: USDC,
          amount: BigInt(1_000_000),
        },
      },
    ];
    state.pulled = state.pushed.map((push) => pullFor(push));
    state.head = BigInt(3_000);

    const result = await readFees();
    if (result.state === "REAL") {
      expect(result.value.swapCount).toBe(0);
      expect(result.value.earned.usdc).toBe(BigInt(0));
    }
  });
});

describe("readAccruedFees - failure", () => {
  it("is UNAVAILABLE when a chunk fails, and reports no total", async () => {
    state.head = BigInt(1000 + 5_000);
    state.failFrom = BigInt(4_000);

    const result = await readFees();
    expect(result.state).toBe("UNAVAILABLE");
    if (result.state === "UNAVAILABLE") {
      expect(result.reason).toMatch(/Fee history could not be read/);
    }
  });

  it("keeps the chunks that landed, so the next poll resumes instead of restarting", async () => {
    state.head = BigInt(1000 + 5_000);
    state.failFrom = BigInt(4_000);
    await readFees();

    state.ranges = [];
    state.failFrom = null;
    const result = await readFees();
    expect(result.state).toBe("REAL");

    const ranges = pushedRange("Pushed");
    // The first two chunks (1000-2999, 3000-4999) already landed; 3000-4999 did not, so the
    // resume starts at 3000 and never re-reads block 1000.
    expect(ranges[0].fromBlock).toBe(BigInt(3_000));
    expect(ranges[ranges.length - 1].toBlock).toBe(state.head);
  });

  it("is UNAVAILABLE when the head cannot be read", async () => {
    const original = client.getBlockNumber;
    client.getBlockNumber = async () => {
      throw new Error("rpc down");
    };
    try {
      const result = await readFees();
      expect(result.state).toBe("UNAVAILABLE");
    } finally {
      client.getBlockNumber = original;
    }
  });
});
