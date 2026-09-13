import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `readRockStrategyView` — the read shared by `GET /api/rocks/[id]/strategy` and the hosted MCP
 * tools. The chain is stubbed at the three seams it crosses (the registry record, the Aqua
 * stream probe, the fee scan), so what is under test is the sequence and every way it must say
 * UNAVAILABLE instead of inventing a number.
 */

const MAKER = `0x${"11".repeat(20)}` as const;
const APP = `0x${"33".repeat(20)}` as const;
const AQUA = `0x${"22".repeat(20)}` as const;

function sampleHash(pair: string): `0x${string}` {
  return `0x${pair.repeat(32)}`;
}

const readRock = vi.fn();
const readRockStreams = vi.fn();
const readAccruedFees = vi.fn();
const getAppDeployBlock = vi.fn();
const loggerError = vi.fn();

vi.mock("@/lib/rock-account", () => ({
  readRock: (...args: unknown[]) => readRock(...args),
}));

vi.mock("./read", () => ({
  readRockStreams: (...args: unknown[]) => readRockStreams(...args),
  readAccruedFees: (...args: unknown[]) => readAccruedFees(...args),
}));

vi.mock("./config", () => ({
  getAppDeployBlock: () => getAppDeployBlock(),
}));

vi.mock("@/lib/telemetry", () => ({
  logger: { error: (...args: unknown[]) => loggerError(...args) },
}));

function liveView() {
  return {
    state: "REAL",
    value: {
      rockId: "3",
      maker: MAKER,
      app: APP,
      aqua: AQUA,
      actual: { usdc: BigInt(5_000_000), weth: BigInt(5_000_000_000_000_000) },
      allowance: { usdc: BigInt(2_000_000), weth: BigInt(300_000_000_000_000) },
      streams: [
        {
          strategyHash: sampleHash("ab"),
          feeBps: BigInt(30),
          streamIndex: BigInt(0),
          label: "Wide",
          virtual: { usdc: BigInt(2_000_000), weth: BigInt(300_000_000_000_000) },
          executable: { usdc: BigInt(2_000_000), weth: BigInt(300_000_000_000_000) },
        },
      ],
    },
  };
}

describe("readRockStrategyView", () => {
  beforeEach(() => {
    vi.resetModules();
    readRock.mockReset();
    readRockStreams.mockReset();
    readAccruedFees.mockReset();
    getAppDeployBlock.mockReset();
    loggerError.mockReset();
    getAppDeployBlock.mockReturnValue(BigInt(11_689_724));
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function subject() {
    return import("./strategy-view");
  }

  it("resolves the maker from the registry when the caller does not name one", async () => {
    readRock.mockResolvedValue({ state: "REAL", value: { smartAccount: MAKER, state: "awake" } });
    readRockStreams.mockResolvedValue(liveView());
    readAccruedFees.mockResolvedValue({
      state: "REAL",
      value: {
        earned: { usdc: BigInt(600), weth: BigInt(0) },
        swapCount: 1,
        fromBlock: BigInt(11_689_724),
        toBlock: BigInt(11_695_620),
        complete: true,
      },
    });

    const { readRockStrategyView } = await subject();
    const result = await readRockStrategyView({ rockId: "3" });

    expect(readRock).toHaveBeenCalledWith("3");
    expect(readRockStreams).toHaveBeenCalledWith(
      expect.objectContaining({ rockId: "3", maker: MAKER }),
    );
    expect(result.state).toBe("REAL");
    if (result.state !== "REAL") throw new Error("unreachable");
    expect(result.value.maker).toBe(MAKER);
    expect(result.value.streams[0]).toMatchObject({
      streamIndex: "0",
      feeBps: "30",
      label: "Wide",
      virtual: { usdc: "2000000", weth: "300000000000000" },
      fees: { earned: { usdc: "600", weth: "0" }, swapCount: 1, complete: true },
    });
  });

  it("skips the registry when the maker is given", async () => {
    readRockStreams.mockResolvedValue(liveView());
    const { readRockStrategyView } = await subject();
    const result = await readRockStrategyView({ rockId: "3", maker: MAKER, fees: false });

    expect(readRock).not.toHaveBeenCalled();
    expect(readAccruedFees).not.toHaveBeenCalled();
    expect(result.state).toBe("REAL");
    if (result.state !== "REAL") throw new Error("unreachable");
    expect(result.value.streams[0].fees).toBeUndefined();
    expect(result.value.streams[0].feesUnavailable).toBeUndefined();
  });

  it("relays the registry's own reason when the record is unavailable", async () => {
    readRock.mockResolvedValue({ state: "UNAVAILABLE", reason: "registry is asleep" });
    const { readRockStrategyView } = await subject();
    const result = await readRockStrategyView({ rockId: "3" });
    expect(result).toEqual({ state: "UNAVAILABLE", reason: "registry is asleep" });
    expect(readRockStreams).not.toHaveBeenCalled();
  });

  it("says a rock with no Rock Account has no strategy", async () => {
    readRock.mockResolvedValue({
      state: "REAL",
      value: { smartAccount: `0x${"0".repeat(40)}`, state: "dormant" },
    });
    const { readRockStrategyView, NO_ROCK_ACCOUNT_STRATEGY_REASON } = await subject();
    const result = await readRockStrategyView({ rockId: "3" });
    expect(result).toEqual({ state: "UNAVAILABLE", reason: NO_ROCK_ACCOUNT_STRATEGY_REASON });
  });

  it("keeps the fee rate but marks the fee figure unavailable when the scan fails", async () => {
    readRockStreams.mockResolvedValue(liveView());
    readAccruedFees.mockResolvedValue({ state: "UNAVAILABLE", reason: "the RPC refused the log range" });
    const { readRockStrategyView } = await subject();
    const result = await readRockStrategyView({ rockId: "3", maker: MAKER });
    expect(result.state).toBe("REAL");
    if (result.state !== "REAL") throw new Error("unreachable");
    expect(result.value.streams[0].feeBps).toBe("30");
    expect(result.value.streams[0].fees).toBeUndefined();
    expect(result.value.streams[0].feesUnavailable).toBe("the RPC refused the log range");
  });

  it("names the missing deploy block instead of scanning from nowhere", async () => {
    getAppDeployBlock.mockReturnValue(undefined);
    readRockStreams.mockResolvedValue(liveView());
    const { readRockStrategyView, FEES_NEED_DEPLOY_BLOCK_REASON } = await subject();
    const result = await readRockStrategyView({ rockId: "3", maker: MAKER });
    expect(readAccruedFees).not.toHaveBeenCalled();
    if (result.state !== "REAL") throw new Error("unreachable");
    expect(result.value.streams[0].feesUnavailable).toBe(FEES_NEED_DEPLOY_BLOCK_REASON);
  });

  it("turns a thrown read into UNAVAILABLE with a fixed reason, and logs it", async () => {
    readRockStreams.mockRejectedValue(new Error("http://user:secret@rpc.example/ timed out"));
    const { readRockStrategyView, STRATEGY_READ_FAILED_REASON } = await subject();
    const result = await readRockStrategyView({ rockId: "3", maker: MAKER });
    expect(result).toEqual({ state: "UNAVAILABLE", reason: STRATEGY_READ_FAILED_REASON });
    expect(loggerError).toHaveBeenCalledTimes(1);
  });
});
