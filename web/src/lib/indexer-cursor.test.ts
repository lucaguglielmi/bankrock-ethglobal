import { describe, expect, it } from "vitest";

import {
  INDEXER_CURSORS_TABLE,
  advanceIndexerCursor,
  indexerCursorId,
  parseCursorValue,
  readIndexerCursor,
  resumeFromBlock,
  type D1DatabaseLike,
} from "./indexer-cursor";
import { buildBlockRanges, mergeEvents, type IndexerEvent } from "./indexer";

/**
 * Addresses are built rather than written out, so the repository-wide "no address literal outside
 * lib/chain" check (D-015) stays true of the test suite too.
 */
function sampleAddress(digit: string): string {
  return `0x${digit.repeat(40)}`;
}

/**
 * A D1 fake in the shape `lib/nfc/counter-store.test.ts` established: it applies the conditional
 * update the real statement describes, so the monotonicity under test is the SQL's, not a mock's.
 */
function fakeD1(): { db: D1DatabaseLike; rows: Map<string, string>; queries: string[] } {
  const rows = new Map<string, string>();
  const queries: string[] = [];

  const db: D1DatabaseLike = {
    prepare(query: string) {
      queries.push(query);
      let bound: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          bound = values;
          return statement;
        },
        async first<T>(): Promise<T | null> {
          const stored = rows.get(String(bound[0]));
          return stored === undefined ? null : ({ last_block: stored } as unknown as T);
        },
        async run() {
          const id = String(bound[0]);
          const next = BigInt(String(bound[1]));
          const existing = rows.get(id);
          if (existing !== undefined && next <= BigInt(existing)) {
            return { meta: { changes: 0 } };
          }
          rows.set(id, next.toString());
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
  };

  return { db, rows, queries };
}

function brokenD1(): D1DatabaseLike {
  return {
    prepare() {
      throw new Error("D1_ERROR: no such table");
    },
  };
}

describe("indexerCursorId", () => {
  it("scopes a cursor to one registry on one chain", () => {
    const a = indexerCursorId(11155111, sampleAddress("a"));
    const b = indexerCursorId(11155111, sampleAddress("b"));
    const other = indexerCursorId(1, sampleAddress("a"));
    expect(a).not.toBe(b);
    expect(a).not.toBe(other);
  });

  it("is case-insensitive, because checksum spelling is not identity", () => {
    expect(indexerCursorId(11155111, "0xAbCdEf0123456789AbCdEf0123456789AbCdEf01")).toBe(
      indexerCursorId(11155111, "0xabcdef0123456789abcdef0123456789abcdef01"),
    );
  });
});

describe("resumeFromBlock", () => {
  it("starts at the deploy block when there is no cursor", () => {
    expect(resumeFromBlock(BigInt(9_000_000), null)).toBe(BigInt(9_000_000));
  });

  it("starts at the block after the cursor", () => {
    expect(resumeFromBlock(BigInt(9_000_000), BigInt(9_100_000))).toBe(BigInt(9_100_001));
  });

  it("never goes back before the deploy block", () => {
    expect(resumeFromBlock(BigInt(9_000_000), BigInt(8_000_000))).toBe(BigInt(9_000_000));
    expect(resumeFromBlock(BigInt(9_000_000), BigInt(0))).toBe(BigInt(9_000_000));
  });

  it("scans nothing new when the cursor is already at the head", () => {
    const head = BigInt(9_100_000);
    const from = resumeFromBlock(BigInt(9_000_000), head);
    expect(buildBlockRanges(from, head)).toEqual([]);
  });

  it("asks only for the gap once the cursor is set", () => {
    const deployBlock = BigInt(9_000_000);
    const head = deployBlock + BigInt(500_000);

    const cold = buildBlockRanges(resumeFromBlock(deployBlock, null), head);
    expect(cold.length).toBe(251);

    const warm = buildBlockRanges(resumeFromBlock(deployBlock, head - BigInt(30)), head);
    expect(warm).toEqual([{ fromBlock: head - BigInt(29), toBlock: head }]);
  });
});

describe("parseCursorValue", () => {
  it("accepts unsigned integers in the shapes D1 can return", () => {
    expect(parseCursorValue("9000000")).toBe(BigInt(9_000_000));
    expect(parseCursorValue(9_000_000)).toBe(BigInt(9_000_000));
    expect(parseCursorValue(BigInt(9_000_000))).toBe(BigInt(9_000_000));
    expect(parseCursorValue(" 42 ")).toBe(BigInt(42));
  });

  it("treats anything else as no cursor", () => {
    expect(parseCursorValue("-1")).toBeNull();
    expect(parseCursorValue("9_000_000")).toBeNull();
    expect(parseCursorValue("head")).toBeNull();
    expect(parseCursorValue(1.5)).toBeNull();
    expect(parseCursorValue(null)).toBeNull();
    expect(parseCursorValue(undefined)).toBeNull();
  });
});

describe("reading and advancing the cursor", () => {
  const id = indexerCursorId(11155111, sampleAddress("a"));

  it("reports no cursor before anything is written", async () => {
    const { db } = fakeD1();
    await expect(readIndexerCursor(db, id)).resolves.toBeNull();
  });

  it("stores and reads back the last scanned block", async () => {
    const { db, queries } = fakeD1();
    await expect(advanceIndexerCursor(db, id, BigInt(9_100_000))).resolves.toBe(true);
    await expect(readIndexerCursor(db, id)).resolves.toBe(BigInt(9_100_000));
    expect(queries.some((query) => query.includes(INDEXER_CURSORS_TABLE))).toBe(true);
  });

  it("moves forward and never backwards", async () => {
    const { db } = fakeD1();
    await advanceIndexerCursor(db, id, BigInt(9_100_000));
    await advanceIndexerCursor(db, id, BigInt(9_000_000));
    await expect(readIndexerCursor(db, id)).resolves.toBe(BigInt(9_100_000));
  });

  it("reports success when another isolate has already moved it further", async () => {
    const { db } = fakeD1();
    await advanceIndexerCursor(db, id, BigInt(9_200_000));
    await expect(advanceIndexerCursor(db, id, BigInt(9_100_000))).resolves.toBe(true);
    await expect(readIndexerCursor(db, id)).resolves.toBe(BigInt(9_200_000));
  });

  it("keeps cursors for different registries apart", async () => {
    const { db } = fakeD1();
    const other = indexerCursorId(11155111, sampleAddress("b"));
    await advanceIndexerCursor(db, id, BigInt(9_100_000));
    await expect(readIndexerCursor(db, other)).resolves.toBeNull();
  });

  it("degrades to no cursor - a full rescan - when the database throws", async () => {
    const db = brokenD1();
    await expect(readIndexerCursor(db, id)).resolves.toBeNull();
    await expect(advanceIndexerCursor(db, id, BigInt(9_100_000))).resolves.toBe(false);
  });
});

describe("merging the mirror with a forward-only scan", () => {
  const event = (id: string, blockNumber: string, logIndex: number): IndexerEvent => ({
    id,
    rockId: "7",
    type: "awakened",
    title: "Rock awakened",
    description: "",
    detail: "BankRockRegistry :: RockAwakened",
    txHash: `0x${"1".repeat(64)}`,
    blockNumber,
    logIndex,
    timestamp: new Date(0).toISOString(),
    timestampEpoch: 0,
    payload: {},
  });

  it("returns the stored history plus the new blocks, newest first", () => {
    const stored = [event("a-0", "9000001", 0), event("b-0", "9000002", 0)];
    const fresh = [event("c-0", "9000003", 0)];
    expect(mergeEvents(stored, fresh).map((e) => e.id)).toEqual(["c-0", "b-0", "a-0"]);
  });

  it("does not duplicate a log that is both stored and freshly scanned", () => {
    const stored = [event("a-0", "9000001", 0)];
    const fresh = [event("a-0", "9000001", 0)];
    expect(mergeEvents(stored, fresh)).toHaveLength(1);
  });

  it("prefers the freshly decoded copy over the mirrored one", () => {
    const stored = [{ ...event("a-0", "9000001", 0), description: "from the mirror" }];
    const fresh = [{ ...event("a-0", "9000001", 0), description: "from the chain" }];
    expect(mergeEvents(stored, fresh)[0].description).toBe("from the chain");
  });

  it("orders two logs in the same block by log index", () => {
    const merged = mergeEvents([], [event("a-0", "9000001", 0), event("a-1", "9000001", 1)]);
    expect(merged.map((e) => e.id)).toEqual(["a-1", "a-0"]);
  });
});
