import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  D1CounterStore,
  MemoryCounterStore,
  NFC_COUNTERS_TABLE,
  normaliseUid,
  resetSharedMemoryCounterStore,
  resolveCounterStore,
  type D1DatabaseLike,
} from "./counter-store";

describe("normaliseUid", () => {
  it("uppercases and strips separators", () => {
    expect(normaliseUid("04:de:5f:1e:ac:c0:40")).toBe("04DE5F1EACC040");
    expect(normaliseUid("04de5f1eacc040")).toBe("04DE5F1EACC040");
  });
});

describe("MemoryCounterStore", () => {
  let store: MemoryCounterStore;

  beforeEach(() => {
    store = new MemoryCounterStore();
  });

  it("reports null for an unknown UID", async () => {
    await expect(store.getLast("04DE5F1EACC040")).resolves.toBeNull();
  });

  it("accepts the first counter, whatever its value", async () => {
    await expect(store.advance("04DE5F1EACC040", 61)).resolves.toBe(true);
    await expect(store.getLast("04DE5F1EACC040")).resolves.toBe(61);
  });

  it("advances monotonically", async () => {
    await store.advance("04DE5F1EACC040", 1);
    await expect(store.advance("04DE5F1EACC040", 2)).resolves.toBe(true);
    await expect(store.advance("04DE5F1EACC040", 3)).resolves.toBe(true);
    await expect(store.advance("04DE5F1EACC040", 100)).resolves.toBe(true);
    await expect(store.getLast("04DE5F1EACC040")).resolves.toBe(100);
  });

  it("rejects a replay of the same counter", async () => {
    await store.advance("04DE5F1EACC040", 61);
    await expect(store.advance("04DE5F1EACC040", 61)).resolves.toBe(false);
    await expect(store.getLast("04DE5F1EACC040")).resolves.toBe(61);
  });

  it("rejects a counter that went backwards", async () => {
    await store.advance("04DE5F1EACC040", 61);
    await expect(store.advance("04DE5F1EACC040", 60)).resolves.toBe(false);
    await expect(store.advance("04DE5F1EACC040", 0)).resolves.toBe(false);
    await expect(store.getLast("04DE5F1EACC040")).resolves.toBe(61);
  });

  it("tracks UIDs independently", async () => {
    await store.advance("04DE5F1EACC040", 61);
    await expect(store.advance("04AABBCCDDEE80", 1)).resolves.toBe(true);
    await expect(store.getLast("04DE5F1EACC040")).resolves.toBe(61);
  });

  it("normalises the UID, so casing cannot bypass the check", async () => {
    await store.advance("04de5f1eacc040", 61);
    await expect(store.advance("04:DE:5F:1E:AC:C0:40", 61)).resolves.toBe(false);
  });

  it("lets exactly one of many concurrent advances win", async () => {
    const results = await Promise.all(
      Array.from({ length: 50 }, () => store.advance("04DE5F1EACC040", 7)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    await expect(store.getLast("04DE5F1EACC040")).resolves.toBe(7);
  });

  it("lets only the highest of a concurrent burst of distinct counters survive", async () => {
    const counters = [5, 3, 9, 1, 7];
    const results = await Promise.all(counters.map((n) => store.advance("04DE5F1EACC040", n)));
    // Every accepted advance must have been strictly increasing at the time.
    expect(results.some(Boolean)).toBe(true);
    await expect(store.getLast("04DE5F1EACC040")).resolves.toBe(9);
    // Replaying any of them afterwards must fail.
    for (const n of counters) {
      await expect(store.advance("04DE5F1EACC040", n)).resolves.toBe(false);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* D1                                                                          */
/* -------------------------------------------------------------------------- */

/**
 * A fake D1 that implements the subset of SQLite semantics the statements rely
 * on: a primary key on `uid` and a conditional `DO UPDATE ... WHERE`.
 */
function fakeD1(): { db: D1DatabaseLike; rows: Map<string, number>; queries: string[] } {
  const rows = new Map<string, number>();
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
          const uid = String(bound[0]);
          const value = rows.get(uid);
          return value === undefined ? null : ({ counter: value } as unknown as T);
        },
        async run() {
          const uid = String(bound[0]);
          const counter = Number(bound[1]);
          const existing = rows.get(uid);
          if (existing !== undefined && counter <= existing) {
            return { meta: { changes: 0 } };
          }
          rows.set(uid, counter);
          return { meta: { changes: 1 } };
        },
      };
      return statement;
    },
  };

  return { db, rows, queries };
}

describe("D1CounterStore", () => {
  it("reads the stored counter", async () => {
    const { db, rows } = fakeD1();
    rows.set("04DE5F1EACC040", 61);
    const store = new D1CounterStore(db);
    await expect(store.getLast("04de5f1eacc040")).resolves.toBe(61);
    await expect(store.getLast("04AABBCCDDEE80")).resolves.toBeNull();
  });

  it("advances only when the counter is strictly greater", async () => {
    const { db } = fakeD1();
    const store = new D1CounterStore(db);
    await expect(store.advance("04DE5F1EACC040", 61)).resolves.toBe(true);
    await expect(store.advance("04DE5F1EACC040", 61)).resolves.toBe(false);
    await expect(store.advance("04DE5F1EACC040", 60)).resolves.toBe(false);
    await expect(store.advance("04DE5F1EACC040", 62)).resolves.toBe(true);
  });

  it("uses one conditional statement against the nfc_counters table", async () => {
    const { db, queries } = fakeD1();
    await new D1CounterStore(db).advance("04DE5F1EACC040", 1);
    expect(queries).toHaveLength(1);
    expect(queries[0]).toContain(NFC_COUNTERS_TABLE);
    expect(queries[0]).toContain("ON CONFLICT(uid) DO UPDATE");
    expect(queries[0]).toContain(`WHERE excluded.counter > ${NFC_COUNTERS_TABLE}.counter`);
  });
});

/* -------------------------------------------------------------------------- */
/* Selection                                                                   */
/* -------------------------------------------------------------------------- */

describe("resolveCounterStore", () => {
  const original = process.env.NEXT_PUBLIC_DEMO_MODE;

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_DEMO_MODE;
    else process.env.NEXT_PUBLIC_DEMO_MODE = original;
    resetSharedMemoryCounterStore();
  });

  it("is unavailable with no D1 binding and demo mode off", async () => {
    delete process.env.NEXT_PUBLIC_DEMO_MODE;
    await expect(resolveCounterStore()).resolves.toEqual({
      available: false,
      reason: "counter_store_unavailable",
    });
  });

  it("is unavailable when NEXT_PUBLIC_DEMO_MODE is any value other than the literal true", async () => {
    for (const value of ["false", "1", "TRUE", "yes", ""]) {
      process.env.NEXT_PUBLIC_DEMO_MODE = value;
      const resolved = await resolveCounterStore();
      expect(resolved.available).toBe(false);
    }
  });

  it("falls back to the non-durable memory store only in demo mode", async () => {
    process.env.NEXT_PUBLIC_DEMO_MODE = "true";
    const resolved = await resolveCounterStore();
    expect(resolved).toMatchObject({ available: true, kind: "memory" });
  });
});
