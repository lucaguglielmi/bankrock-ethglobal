import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Address, Hex } from "viem";

/**
 * The fee scan (B6): chunked at 2,000 blocks, resumed from what has already been scanned, and
 * UNAVAILABLE — never a short total — when a chunk fails.
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

const state = {
  head: BigInt(0),
  ranges: [] as LoggedRange[],
  pushed: [] as PushedLog[],
  shipped: [] as ShippedLog[],
  failFrom: null as bigint | null,
};

const client = {
  async getBlockNumber() {
    return state.head;
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
  state.failFrom = null;
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

describe("readAccruedFees — chunking (D-036)", () => {
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

  it("asks for Shipped over the same chunk as Pushed, so a launch push is never split off", async () => {
    state.head = BigInt(1000 + 3_000);
    await readFees();
    const spans = (event: string) =>
      pushedRange(event).map((range) => `${range.fromBlock}-${range.toBlock}`);
    expect(spans("Shipped")).toEqual(spans("Pushed"));
  });
});

describe("readAccruedFees — resuming", () => {
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
    state.head = BigInt(4_000);

    const result = await readFees();
    expect(result.state).toBe("REAL");
    if (result.state === "REAL") {
      expect(result.value.earned.usdc).toBe(BigInt(0));
      expect(result.value.earned.weth).toBe(BigInt(60));
      expect(result.value.swapCount).toBe(1);
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
    state.head = BigInt(3_000);

    const result = await readFees();
    if (result.state === "REAL") {
      expect(result.value.swapCount).toBe(0);
      expect(result.value.earned.usdc).toBe(BigInt(0));
    }
  });
});

describe("readAccruedFees — failure", () => {
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
