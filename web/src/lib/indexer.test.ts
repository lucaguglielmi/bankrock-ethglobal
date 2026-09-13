import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics } from "viem";
import { BANK_ROCK_REGISTRY_ABI } from "@/lib/chain/abi/registry";
import {
  EVENT_TYPE_BY_NAME,
  INDEXER_CONFIRMATIONS,
  MAX_BLOCK_CHUNK,
  buildBlockRanges,
  confirmedHead,
  decodeRegistryLog,
  sanitizeRockId,
  sanitizeTxHash,
} from "./indexer";

// Addresses are built rather than written out, so the repository-wide "no address literals
// outside lib/chain" check (D-015, spec 15 Part 7) stays true of the test suite too.
function sampleAddress(digit: string): `0x${string}` {
  return `0x${digit.repeat(40)}`;
}

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

/* -------------------------------------------------------------------------- */
/* Event decoding                                                              */
/* -------------------------------------------------------------------------- */

describe("decodeRegistryLog", () => {
  const TX = `0x${"ab".repeat(32)}` as const;
  const OWNER = sampleAddress("1");
  const PREVIOUS = sampleAddress("2");
  const SAFE = sampleAddress("3");
  const UID_HASH = `0x${"cd".repeat(32)}` as const;
  const TIMESTAMP = 1_700_000_000_000;

  /**
   * Builds a log exactly as a node would return it: indexed arguments in topics, the rest
   * ABI-encoded in `data`. viem has no `encodeEventLog`, so this assembles the two halves.
   */
  function logFor(eventName: string, args: Record<string, unknown>) {
    const abiEvent = BANK_ROCK_REGISTRY_ABI.find(
      (entry) => entry.type === "event" && entry.name === eventName,
    ) as { inputs: readonly { name: string; type: string; indexed?: boolean }[] };

    const topics = encodeEventTopics({
      abi: BANK_ROCK_REGISTRY_ABI,
      eventName: eventName as never,
      args: args as never,
    });

    const nonIndexed = abiEvent.inputs.filter((input) => !input.indexed);
    const data =
      nonIndexed.length === 0
        ? "0x"
        : encodeAbiParameters(
            nonIndexed.map((input) => ({ name: input.name, type: input.type })),
            nonIndexed.map((input) => args[input.name]),
          );

    return {
      topics,
      data: data as `0x${string}`,
      transactionHash: TX,
      blockNumber: BigInt(6_123_456),
      logIndex: 3,
    };
  }

  it("decodes RockAwakened", () => {
    const event = decodeRegistryLog(
      logFor("RockAwakened", {
        rockId: BigInt(7),
        rockOwner: OWNER,
        uidHash: UID_HASH,
        smartAccount: SAFE,
        counter: 4,
      }),
      TIMESTAMP,
    );

    expect(event).not.toBeNull();
    expect(event).toMatchObject({
      id: `${TX}-3`,
      rockId: "7",
      type: "awakened",
      txHash: TX,
      blockNumber: "6123456",
      logIndex: 3,
      timestampEpoch: TIMESTAMP,
      detail: "BankRockRegistry :: RockAwakened",
    });
    // The timestamp is the block's, never "now".
    expect(event!.timestamp).toBe(new Date(TIMESTAMP).toISOString());
    expect(event!.payload).toMatchObject({ smartAccount: SAFE, counter: "4" });
  });

  it("decodes HandoverClaimed, including the previous owner", () => {
    const event = decodeRegistryLog(
      logFor("HandoverClaimed", {
        rockId: BigInt(12),
        previousOwner: PREVIOUS,
        newOwner: OWNER,
        // `claimHandover` rebinds the rock's account to the claimant's, and the event now carries
        // it - non-indexed, so it lands in `data` alongside the counter.
        smartAccount: SAFE,
        counter: 9,
      }),
      TIMESTAMP,
    );

    expect(event).not.toBeNull();
    expect(event).toMatchObject({ rockId: "12", type: "handover_claimed" });
    expect(event!.payload).toMatchObject({
      previousOwner: PREVIOUS,
      newOwner: OWNER,
      smartAccount: SAFE,
      counter: "9",
    });
    expect(event!.description).toContain("physical tap");
  });

  it("decodes the rest of the lifecycle vocabulary", () => {
    const cases: Array<[string, Record<string, unknown>, string]> = [
      [
        "HandoverInitiated",
        {
          rockId: BigInt(1),
          from: OWNER,
          recipient: PREVIOUS,
          expiresAt: BigInt(1800000000),
          messageHash: UID_HASH,
        },
        "handover_initiated",
      ],
      ["HandoverCancelled", { rockId: BigInt(1), by: OWNER }, "handover_cancelled"],
      ["RockArchived", { rockId: BigInt(1), by: OWNER, uidHash: UID_HASH }, "archived"],
      ["RockMarkedLost", { rockId: BigInt(1), by: OWNER }, "marked_lost"],
      ["RockLostCleared", { rockId: BigInt(1), by: OWNER }, "lost_cleared"],
    ];

    for (const [eventName, args, expected] of cases) {
      const event = decodeRegistryLog(logFor(eventName, args), TIMESTAMP);
      expect(event?.type, eventName).toBe(expected);
    }
  });

  it("ignores registry events that are not about a rock", () => {
    const event = decodeRegistryLog(
      logFor("AttesterUpdated", { previousAttester: OWNER, newAttester: PREVIOUS }),
      TIMESTAMP,
    );
    expect(event).toBeNull();
  });

  it("returns null rather than a partial entry for an undecodable log", () => {
    expect(
      decodeRegistryLog(
        { topics: [`0x${"11".repeat(32)}`], data: "0x", transactionHash: TX, blockNumber: BigInt(1), logIndex: 0 },
        TIMESTAMP,
      ),
    ).toBeNull();

    // A pending log has no transaction hash or position yet.
    expect(
      decodeRegistryLog(
        {
          ...logFor("RockMarkedLost", { rockId: BigInt(1), by: OWNER }),
          transactionHash: null,
        },
        TIMESTAMP,
      ),
    ).toBeNull();
  });
});

describe("EVENT_TYPE_BY_NAME", () => {
  it("covers every rock event the registry emits, and nothing else", () => {
    expect(Object.keys(EVENT_TYPE_BY_NAME).sort()).toEqual(
      [
        "HandoverCancelled",
        "HandoverClaimed",
        "HandoverInitiated",
        "RockArchived",
        "RockAwakened",
        "RockLostCleared",
        "RockMarkedLost",
      ].sort(),
    );
    // The instant-transfer event is gone with the function that emitted it (D-020).
    expect(EVENT_TYPE_BY_NAME.RockOwnershipTransferred).toBeUndefined();
  });
});

describe("confirmedHead", () => {
  it("stops the mirror a fixed number of blocks below the head", () => {
    expect(confirmedHead(BigInt(1000))).toBe(BigInt(1000) - INDEXER_CONFIRMATIONS);
    expect(confirmedHead(BigInt(1000), BigInt(5))).toBe(BigInt(995));
  });

  it("never goes below the genesis block", () => {
    expect(confirmedHead(BigInt(0))).toBe(BigInt(0));
    expect(confirmedHead(BigInt(1))).toBe(BigInt(0));
    expect(confirmedHead(INDEXER_CONFIRMATIONS)).toBe(BigInt(0));
  });

  it("splits a scan into a confirmed range and an unconfirmed tail with no gap or overlap", () => {
    const fromBlock = BigInt(100);
    const head = BigInt(2500);
    const safeHead = confirmedHead(head);
    const confirmed = buildBlockRanges(fromBlock, safeHead);
    const tailFrom = safeHead + BigInt(1) > fromBlock ? safeHead + BigInt(1) : fromBlock;
    const tail = buildBlockRanges(tailFrom, head);

    expect(confirmed[confirmed.length - 1].toBlock).toBe(safeHead);
    expect(tail[0].fromBlock).toBe(safeHead + BigInt(1));
    expect(tail[tail.length - 1].toBlock).toBe(head);
    expect(tail.every((r) => r.fromBlock > safeHead)).toBe(true);
  });

  it("scans only the tail when the cursor is already at the confirmed head", () => {
    const head = BigInt(2500);
    const safeHead = confirmedHead(head);
    const fromBlock = safeHead + BigInt(1);
    expect(buildBlockRanges(fromBlock, safeHead)).toEqual([]);
    const tailFrom = safeHead + BigInt(1) > fromBlock ? safeHead + BigInt(1) : fromBlock;
    expect(buildBlockRanges(tailFrom, head)).toEqual([{ fromBlock, toBlock: head }]);
  });
});
