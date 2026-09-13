/**
 * Durable, atomic SDMReadCtr store.
 *
 * Threat model row 1 of specs/15-exit-demo-mode.md Part 5: a URL copied from a
 * genuine tap and replayed must be rejected. That requires the last accepted
 * counter per UID to survive in durable storage and to advance atomically, so
 * two concurrent replays of the same URL cannot both win (R-4: the previous
 * per-isolate `Map` reset continuously and was therefore not a defence).
 *
 * Table (owned by the Drizzle schema; this module only reads and writes it):
 *
 *   nfc_counters(uid TEXT PRIMARY KEY, counter INTEGER NOT NULL, updated_at INTEGER NOT NULL)
 */

export interface CounterStore {
  /** Last accepted counter for this UID, or `null` if the UID is unknown. */
  getLast(uidHex: string): Promise<number | null>;
  /**
   * Record `counter` for this UID if and only if it is strictly greater than
   * the stored value (or the UID is unknown). Returns whether it was accepted.
   * Must be atomic: concurrent calls with the same counter yield exactly one
   * `true`.
   */
  advance(uidHex: string, counter: number): Promise<boolean>;
}

/** Table name, kept in one place so the SQL below and the schema agree. */
export const NFC_COUNTERS_TABLE = "nfc_counters";

/** Normalise a UID to the canonical storage form: uppercase hex, no separators. */
export function normaliseUid(uidHex: string): string {
  return uidHex.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
}

/**
 * Non-durable in-process store — a test double, nothing more.
 *
 * WARNING: unit tests only. Worker isolates are created and discarded
 * continuously, so this provides no replay protection in production, and
 * `resolveCounterStore` never selects it: with no D1 binding the verifier
 * fails closed. A test that needs a working store injects an instance of this
 * class explicitly (see `verify.test.ts`).
 */
export class MemoryCounterStore implements CounterStore {
  /** Non-durable: lives and dies with the isolate. */
  private readonly counters = new Map<string, number>();

  async getLast(uidHex: string): Promise<number | null> {
    const key = normaliseUid(uidHex);
    const value = this.counters.get(key);
    return value === undefined ? null : value;
  }

  async advance(uidHex: string, counter: number): Promise<boolean> {
    const key = normaliseUid(uidHex);
    // JavaScript runs this method body to completion without interleaving, so
    // the read-compare-write below is atomic with respect to other callers in
    // the same isolate. That is the whole guarantee this class offers.
    const last = this.counters.get(key);
    if (last !== undefined && counter <= last) return false;
    this.counters.set(key, counter);
    return true;
  }

  /** Test helper: forget everything. */
  reset(): void {
    this.counters.clear();
  }
}

/* -------------------------------------------------------------------------- */
/* D1                                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Minimal structural view of the D1 binding. Declared locally so this module
 * does not depend on ambient Cloudflare Workers types being configured.
 */
interface D1MetaLike {
  changes?: number;
}

interface D1ResultLike {
  meta?: D1MetaLike;
}

interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run(): Promise<D1ResultLike>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
}

const SELECT_SQL = `SELECT counter FROM ${NFC_COUNTERS_TABLE} WHERE uid = ?1`;

/**
 * One statement, conditional on the stored value. SQLite applies the
 * `DO UPDATE ... WHERE` predicate inside the same implicit transaction as the
 * insert, so a replay either inserts a row that did not exist or updates a row
 * whose counter is strictly lower. When the predicate is false, nothing is
 * written and `meta.changes` is 0 — the replay loses the race.
 */
const ADVANCE_SQL = `INSERT INTO ${NFC_COUNTERS_TABLE} (uid, counter, updated_at)
VALUES (?1, ?2, ?3)
ON CONFLICT(uid) DO UPDATE SET counter = excluded.counter, updated_at = excluded.updated_at
WHERE excluded.counter > ${NFC_COUNTERS_TABLE}.counter`;

export class D1CounterStore implements CounterStore {
  constructor(private readonly db: D1DatabaseLike) {}

  async getLast(uidHex: string): Promise<number | null> {
    const row = await this.db
      .prepare(SELECT_SQL)
      .bind(normaliseUid(uidHex))
      .first<{ counter: number }>();
    if (row === null || row === undefined) return null;
    const value = typeof row === "object" ? row.counter : (row as unknown as number);
    return typeof value === "number" ? value : null;
  }

  async advance(uidHex: string, counter: number): Promise<boolean> {
    const result = await this.db
      .prepare(ADVANCE_SQL)
      .bind(normaliseUid(uidHex), counter, Date.now())
      .run();
    return (result.meta?.changes ?? 0) > 0;
  }
}

/* -------------------------------------------------------------------------- */
/* Selection                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Which store answered. `"d1"` is the only kind production ever reports;
 * `"memory"` is what an injected `MemoryCounterStore` reports in a unit test.
 */
export type CounterStoreKind = "d1" | "memory";

export type CounterStoreResolution =
  | { available: true; kind: CounterStoreKind; store: CounterStore }
  | { available: false; reason: "counter_store_unavailable" };

/**
 * Resolve the counter store for this request.
 *
 * D1 via the OpenNext Cloudflare context is the only option. When it is not
 * reachable the verifier fails closed (D-017): it returns `unavailable` and no
 * tap is verified. There is no fallback — not in development, not in a build
 * flag — because a non-durable store is no replay protection at all (R-4).
 */
export async function resolveCounterStore(): Promise<CounterStoreResolution> {
  let db: D1DatabaseLike | undefined;
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const context = await getCloudflareContext({ async: true });
    const binding = (context.env as unknown as { DB?: D1DatabaseLike }).DB;
    if (binding && typeof binding.prepare === "function") {
      db = binding;
    }
  } catch {
    // No Cloudflare context (unit tests, `next dev` without the adapter, or a
    // build without the binding). There is nothing to fall through to.
    db = undefined;
  }

  if (db) {
    return { available: true, kind: "d1", store: new D1CounterStore(db) };
  }

  return { available: false, reason: "counter_store_unavailable" };
}
