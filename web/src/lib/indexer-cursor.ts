/**
 * The registry indexer's resume point (B7).
 *
 * `lib/indexer.ts` has always mirrored decoded registry events into D1 and never read the mirror
 * back, so every fifteen-second poll re-scanned `REGISTRY_DEPLOY_BLOCK` to the head in
 * 2,000-block chunks - work that grows without bound while the demo is running, against an RPC
 * whose rate limit is shared with strangers (D-036). This module stores how far the scan has got
 * so the next one starts there.
 *
 * Two rules make that safe:
 *
 *  1. **The cursor only moves forward.** The write is one conditional UPDATE, so two isolates
 *     racing cannot rewind it, and a stale isolate's lower value is simply dropped.
 *  2. **The cursor is only advanced after the events in that range are durably mirrored.** A
 *     cursor ahead of the mirror would skip history permanently, which is the one failure this
 *     cache must not have. `lib/indexer.ts` enforces the ordering; this module refuses to guess
 *     at it.
 *
 * With no D1 binding every function here reports "no cursor", and the indexer falls back to the
 * full scan it did before - slower, never wrong.
 *
 * Raw D1 statements rather than Drizzle, for the same reason `lib/nfc/counter-store.ts` uses
 * them: the conditional update has to be one statement, and a thin `prepare`/`bind`/`run` surface
 * is the one shape the test suite can stand a fake in front of.
 */

export const INDEXER_CURSORS_TABLE = "indexer_cursors";

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<{ meta?: { changes?: number } }>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
}

const SELECT_SQL = `SELECT last_block FROM ${INDEXER_CURSORS_TABLE} WHERE id = ?1`;

/**
 * Insert, or advance an existing cursor. The `WHERE` predicate is evaluated inside the same
 * implicit transaction as the insert, so a cursor can never go backwards.
 */
const ADVANCE_SQL = `INSERT INTO ${INDEXER_CURSORS_TABLE} (id, last_block, updated_at)
VALUES (?1, ?2, ?3)
ON CONFLICT(id) DO UPDATE SET last_block = excluded.last_block, updated_at = excluded.updated_at
WHERE CAST(excluded.last_block AS INTEGER) > CAST(${INDEXER_CURSORS_TABLE}.last_block AS INTEGER)`;

const NUMERIC_REGEX = /^\d+$/;

/**
 * The scope a cursor belongs to.
 *
 * A cursor is only meaningful for one registry on one chain: a redeployed contract has a
 * different history from the same block numbers, and inheriting the old progress would silently
 * skip the new contract's first events.
 */
export function indexerCursorId(chainId: number, registry: string): string {
  return `chain:${chainId}:registry:${registry.toLowerCase()}`;
}

/**
 * Where the next scan starts.
 *
 * Pure, and the whole of the resume decision: no cursor means start at the deploy block; a cursor
 * means start at the block after it; a cursor at or below the deploy block (a stale row from an
 * earlier deployment, or a hand-edit) is ignored rather than trusted to point backwards.
 */
export function resumeFromBlock(deployBlock: bigint, cursor: bigint | null): bigint {
  if (cursor === null) return deployBlock;
  const next = cursor + BigInt(1);
  return next > deployBlock ? next : deployBlock;
}

/** Parses a stored cursor value. Anything that is not a plain unsigned integer is "no cursor". */
export function parseCursorValue(value: unknown): bigint | null {
  if (typeof value === "bigint") return value >= BigInt(0) ? value : null;
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!NUMERIC_REGEX.test(trimmed)) return null;
  return BigInt(trimmed);
}

/**
 * The last block already scanned for this scope, or null when there is none - including when the
 * read fails. A cursor that cannot be read is indistinguishable, for the caller, from a cursor
 * that does not exist yet: both mean "scan the whole range", which is correct, just slower.
 */
export async function readIndexerCursor(
  db: D1DatabaseLike,
  id: string,
): Promise<bigint | null> {
  try {
    const row = await db.prepare(SELECT_SQL).bind(id).first<{ last_block?: unknown }>();
    if (row === null || row === undefined) return null;
    return parseCursorValue(typeof row === "object" ? row.last_block : row);
  } catch {
    return null;
  }
}

/**
 * Advances the cursor to `lastBlock`. Returns true when the row now names that block - including
 * the case where another isolate had already moved it further, which is not a failure.
 */
export async function advanceIndexerCursor(
  db: D1DatabaseLike,
  id: string,
  lastBlock: bigint,
): Promise<boolean> {
  if (lastBlock < BigInt(0)) return false;
  try {
    const result = await db
      .prepare(ADVANCE_SQL)
      .bind(id, lastBlock.toString(), Date.now())
      .run();
    if ((result.meta?.changes ?? 0) > 0) return true;
    // No row changed: either the stored cursor is already at or beyond this block, or the write
    // was refused. Re-read rather than report progress that did not happen.
    const stored = await readIndexerCursor(db, id);
    return stored !== null && stored >= lastBlock;
  } catch {
    return false;
  }
}
