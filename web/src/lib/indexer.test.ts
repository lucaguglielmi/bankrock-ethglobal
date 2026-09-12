import { describe, expect, it } from "vitest";
import { MAX_BLOCK_CHUNK, buildBlockRanges, sanitizeRockId, sanitizeTxHash } from "./indexer";

describe("block chunking (X-5)", () => {
  it("never asks for more than 2,000 blocks at a time", () => {
    const ranges = buildBlockRanges(BigInt(1000), BigInt(1000) + BigInt(9999));
    expect(MAX_BLOCK_CHUNK).toBe(BigInt(2000));
    for (const range of ranges) {
      expect(range.toBlock - range.fromBlock + BigInt(1)).toBeLessThanOrEqual(MAX_BLOCK_CHUNK);
    }
  });

  it("covers the whole range exactly once, with no gaps or overlaps", () => {
    const from = BigInt(7_000_000);
    const to = BigInt(7_005_001);
    const ranges = buildBlockRanges(from, to);

    expect(ranges[0].fromBlock).toBe(from);
    expect(ranges[ranges.length - 1].toBlock).toBe(to);
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i].fromBlock).toBe(ranges[i - 1].toBlock + BigInt(1));
    }
    const covered = ranges.reduce(
      (sum, r) => sum + (r.toBlock - r.fromBlock + BigInt(1)),
      BigInt(0),
    );
    expect(covered).toBe(to - from + BigInt(1));
  });

  it("returns a single range when the span fits in one chunk", () => {
    expect(buildBlockRanges(BigInt(10), BigInt(20))).toEqual([
      { fromBlock: BigInt(10), toBlock: BigInt(20) },
    ]);
  });

  it("handles a single block", () => {
    expect(buildBlockRanges(BigInt(10), BigInt(10))).toEqual([
      { fromBlock: BigInt(10), toBlock: BigInt(10) },
    ]);
  });

  it("returns nothing for an inverted range", () => {
    expect(buildBlockRanges(BigInt(20), BigInt(10))).toEqual([]);
  });

  it("starts at the deploy block rather than a rolling window", () => {
    const deployBlock = BigInt(6_000_000);
    const head = deployBlock + BigInt(500_000);
    const ranges = buildBlockRanges(deployBlock, head);
    // The old implementation began at head - 50,000, so the deploy block was unreachable.
    expect(ranges[0].fromBlock).toBe(deployBlock);
    // 500,001 inclusive blocks in 2,000-block chunks.
    expect(ranges.length).toBe(251);
  });
});

describe("indexer input validation", () => {
  it("accepts unsigned integers only", () => {
    expect(sanitizeRockId("12")).toBe(BigInt(12));
    expect(sanitizeRockId(0)).toBe(BigInt(0));
    expect(sanitizeRockId("-1")).toBeNull();
    expect(sanitizeRockId("1.5")).toBeNull();
    expect(sanitizeRockId("1; DROP TABLE rocks")).toBeNull();
    expect(sanitizeRockId(null)).toBeNull();
  });

  it("accepts 32-byte hashes only", () => {
    expect(sanitizeTxHash(`0x${"ab".repeat(32)}`)).toBe(`0x${"ab".repeat(32)}`);
    expect(sanitizeTxHash("0x123...abc")).toBeNull();
    expect(sanitizeTxHash(`0x${"ab".repeat(31)}`)).toBeNull();
  });
});

describe("registryDeployBlock", () => {
  it("is null when unset, so the indexer reports UNAVAILABLE instead of scanning from 0", async () => {
    delete process.env.REGISTRY_DEPLOY_BLOCK;
    const { registryDeployBlock } = await import("./indexer");
    expect(registryDeployBlock()).toBeNull();
  });

  it("reads an unsigned integer", async () => {
    process.env.REGISTRY_DEPLOY_BLOCK = "6123456";
    const { registryDeployBlock } = await import("./indexer");
    expect(registryDeployBlock()).toBe(BigInt(6123456));
    delete process.env.REGISTRY_DEPLOY_BLOCK;
  });
});
