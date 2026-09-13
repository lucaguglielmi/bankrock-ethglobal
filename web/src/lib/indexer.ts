/**
 * Registry event indexer - a rock's provenance (X-5, spec 15 Phase 2 item 5).
 *
 *  - the scan starts at `REGISTRY_DEPLOY_BLOCK` and walks forward in chunks of at most 2,000
 *    blocks. The old code scanned a rolling `currentBlock - 50000` window, so provenance aged out
 *    silently and the deploy block was unreachable, and a 50,000-block `eth_getLogs` is rejected
 *    by most providers anyway;
 *  - timestamps come from the block the log is in. The old code wrote `now - 3600000`;
 *  - the event vocabulary is the current contract's. `RockOwnershipTransferred` is gone: there is
 *    no instant transfer any more, only `initiateHandover` -> `claimHandover`, so a change of
 *    owner in the history is always backed by a physical tap;
 *  - decoded events are mirrored into D1 so `/api/rocks/next-id` and the admin figures have
 *    something to count. The chain remains the source of truth; the table is a cache;
 *  - the mirror is now also *read back*. A per-registry cursor (`lib/indexer-cursor.ts`, B7)
 *    records how far the scan has got, so a fifteen-second poll asks for the blocks that are new
 *    instead of re-walking the whole chain from the deploy block every time. The cursor advances
 *    only after the events in that range are stored, and with no D1 binding the indexer does
 *    exactly what it did before: a full, chunked scan from `REGISTRY_DEPLOY_BLOCK`;
 *  - with no registry address, no deploy block or an unreachable RPC, the result is UNAVAILABLE
 *    with the reason. An empty list only ever means the chain holds no events;
 *  - the mirror and the cursor stop `INDEXER_CONFIRMATIONS` blocks below the head (security
 *    review 2026-09-13, R-17). The mirror only ever adds rows, so a log that a reorganisation
 *    later removes would otherwise stay in the history for good. The unconfirmed tail is still
 *    scanned and answered on every call - a transaction mined seconds ago is shown - it is just
 *    not written down until it has settled.
 */

import { eq } from "drizzle-orm";
import {
  decodeEventLog,
  isAddress,
  getAddress,
  zeroAddress,
  type Address,
  type Hash,
  type Hex,
} from "viem";
import { BANK_ROCK_REGISTRY_ABI } from "@/lib/chain/abi/registry";
import { MAX_BLOCK_CHUNK, buildBlockRanges, type BlockRange } from "@/lib/block-range";
import { addresses, chain, chainId, getPublicClient } from "@/lib/chain";
import { getD1, getDb } from "@/lib/db";
import { rockEvents } from "@/lib/db/schema";
import {
  advanceIndexerCursor,
  indexerCursorId,
  readIndexerCursor,
  resumeFromBlock,
  type D1DatabaseLike,
} from "@/lib/indexer-cursor";
import { optionalEnv, real, unavailable, type Capability } from "@/lib/demo";
import { publicReasonWith } from "@/lib/errors";
import { logger } from "@/lib/telemetry";

/** Chunking lives in `lib/block-range` now that the Aqua fee scan needs it too. */
export { MAX_BLOCK_CHUNK, buildBlockRanges };
export type { BlockRange };

/** The provenance vocabulary. One value per registry event that concerns a rock. */
export type IndexerEventType =
  | "awakened"
  | "handover_initiated"
  | "handover_claimed"
  | "handover_cancelled"
  | "archived"
  | "marked_lost"
  | "lost_cleared";

export interface IndexerEvent {
  id: string;
  rockId: string;
  type: IndexerEventType;
  title: string;
  description: string;
  detail: string;
  txHash: Hash;
  blockNumber: string;
  logIndex: number;
  /** ISO-8601, read from the block header. Never synthesized. */
  timestamp: string;
  /** Unix epoch milliseconds, read from the block header. */
  timestampEpoch: number;
  /** Decoded, non-indexed arguments, as strings. */
  payload: Record<string, string>;
}

const TX_HASH_REGEX = /^0x[0-9a-fA-F]{64}$/;
const NUMERIC_REGEX = /^\d+$/;

/**
 * How many blocks below the head an event must sit before it is mirrored and the cursor moves
 * past it. Three Sepolia blocks is about forty seconds; a deeper reorganisation than that is
 * rare enough that the mirror can be rebuilt by hand if it ever happens.
 */
export const INDEXER_CONFIRMATIONS = BigInt(3);

/**
 * The newest block whose events are settled enough to mirror: the head minus the confirmation
 * depth, never below zero. Pure, so the boundary can be tested without a chain.
 */
export function confirmedHead(
  currentBlock: bigint,
  confirmations: bigint = INDEXER_CONFIRMATIONS,
): bigint {
  const head = currentBlock - confirmations;
  return head < BigInt(0) ? BigInt(0) : head;
}

/** Registry event name -> provenance type. Events not listed here are not about a rock. */
export const EVENT_TYPE_BY_NAME: Record<string, IndexerEventType> = {
  RockAwakened: "awakened",
  HandoverInitiated: "handover_initiated",
  HandoverClaimed: "handover_claimed",
  HandoverCancelled: "handover_cancelled",
  RockArchived: "archived",
  RockMarkedLost: "marked_lost",
  RockLostCleared: "lost_cleared",
};

export function sanitizeRockId(input: unknown): bigint | null {
  if (typeof input === "bigint") return input >= BigInt(0) ? input : null;
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0 || !Number.isInteger(input)) return null;
    return BigInt(input);
  }
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!NUMERIC_REGEX.test(trimmed)) return null;
    try {
      const bn = BigInt(trimmed);
      return bn >= BigInt(0) ? bn : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function sanitizeTxHash(hash: unknown): Hash | null {
  if (typeof hash !== "string") return null;
  const trimmed = hash.trim();
  return TX_HASH_REGEX.test(trimmed) ? (trimmed as Hash) : null;
}

export function sanitizeAddress(addr: unknown): string | null {
  if (typeof addr !== "string") return null;
  const trimmed = addr.trim();
  if (!isAddress(trimmed)) return null;
  try {
    return getAddress(trimmed);
  } catch {
    return null;
  }
}

/** The block the registry was deployed in. Unset means the indexer has no starting point. */
export function registryDeployBlock(): bigint | null {
  const raw = optionalEnv("REGISTRY_DEPLOY_BLOCK");
  if (!raw || !NUMERIC_REGEX.test(raw)) return null;
  return BigInt(raw);
}

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function describe(
  type: IndexerEventType,
  args: Record<string, unknown>,
): { title: string; description: string } {
  const owner = sanitizeAddress(args.rockOwner) ?? sanitizeAddress(args.newOwner);
  switch (type) {
    case "awakened": {
      const smartAccount = sanitizeAddress(args.smartAccount);
      return {
        title: "Rock awakened",
        description: `Bound to Rock Account ${smartAccount ? shorten(smartAccount) : "unknown"}${
          owner ? ` with owner ${shorten(owner)}` : ""
        }.`,
      };
    }
    case "handover_initiated": {
      const recipient = sanitizeAddress(args.recipient);
      const isOpen = !recipient || recipient === zeroAddress;
      return {
        title: "Gift opened",
        description: isOpen
          ? "Offered to whoever taps the rock next."
          : `Offered to ${shorten(recipient)}.`,
      };
    }
    case "handover_claimed": {
      const previous = sanitizeAddress(args.previousOwner);
      return {
        title: "Gift claimed",
        description: `Passed${previous ? ` from ${shorten(previous)}` : ""}${
          owner ? ` to ${shorten(owner)}` : ""
        }, proven by a physical tap.`,
      };
    }
    case "handover_cancelled":
      return { title: "Gift withdrawn", description: "The owner cancelled the pending handover." };
    case "archived":
      return {
        title: "Rock archived",
        description: "Retired by its owner. Its tag is released and it can never be awakened again.",
      };
    case "marked_lost":
      return {
        title: "Marked lost",
        description: "The owner flagged the physical tag as lost or copied.",
      };
    case "lost_cleared":
      return { title: "Lost flag cleared", description: "The owner withdrew the lost flag." };
  }
}

/**
 * A log as this module consumes it.
 *
 * `topics` is typed as the loose array a node returns rather than viem's tuple, so a log read
 * from `getLogs` - or assembled in a test - needs no cast to be decoded.
 */
export interface RegistryLog {
  topics: readonly (Hex | Hex[] | null)[];
  data: Hex;
  transactionHash: Hash | null;
  blockNumber: bigint | null;
  logIndex: number | null;
}

/**
 * Decodes one registry log into a provenance event.
 *
 * Pure: everything it needs is in the log and the timestamp handed to it. A log that is not one of
 * the seven rock events, or that is missing the fields an event needs, returns null rather than a
 * partially-filled entry.
 */
export function decodeRegistryLog(
  log: RegistryLog,
  timestampEpochMs: number,
): IndexerEvent | null {
  const txHash = sanitizeTxHash(log.transactionHash);
  if (!txHash || log.blockNumber === null || log.logIndex === null) return null;

  let decoded: { eventName: string; args: Record<string, unknown> };
  try {
    decoded = decodeEventLog({
      abi: BANK_ROCK_REGISTRY_ABI,
      data: log.data as Hex,
      topics: log.topics as [Hex, ...Hex[]],
    }) as unknown as { eventName: string; args: Record<string, unknown> };
  } catch {
    return null;
  }

  const type = EVENT_TYPE_BY_NAME[decoded.eventName];
  if (!type) return null;

  const args = decoded.args ?? {};
  const rockId = sanitizeRockId(args.rockId);
  if (rockId === null) return null;

  const payload: Record<string, string> = {};
  for (const [key, value] of Object.entries(args)) {
    if (key === "rockId") continue;
    if (typeof value === "bigint") payload[key] = value.toString();
    else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      payload[key] = String(value);
    }
  }

  const { title, description } = describe(type, args);

  return {
    id: `${txHash}-${log.logIndex}`,
    rockId: rockId.toString(),
    type,
    title,
    description,
    detail: `BankRockRegistry :: ${decoded.eventName}`,
    txHash,
    blockNumber: log.blockNumber.toString(),
    logIndex: log.logIndex,
    timestamp: new Date(timestampEpochMs).toISOString(),
    timestampEpoch: timestampEpochMs,
    payload,
  };
}

interface CacheEntry {
  events: IndexerEvent[];
  cachedAt: number;
}
const eventCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15_000;

/** Drops the in-process event cache. Tests use it; nothing in the request path does. */
export function resetIndexerCache(): void {
  eventCache.clear();
}

/** The event name a stored row came from, so a mirrored row can be described like a fresh log. */
const EVENT_NAME_BY_TYPE: Record<IndexerEventType, string> = Object.fromEntries(
  Object.entries(EVENT_TYPE_BY_NAME).map(([name, type]) => [type, name]),
) as Record<IndexerEventType, string>;

/** One mirrored row, rebuilt into the event the chain produced. */
export function rowToIndexerEvent(row: {
  id: string;
  rockId: string;
  eventType: string;
  txHash: string;
  logIndex: number | null;
  blockNumber: string | null;
  payload: Record<string, string> | null;
  timestamp: number;
}): IndexerEvent | null {
  const type = row.eventType as IndexerEventType;
  const eventName = EVENT_NAME_BY_TYPE[type];
  if (!eventName) return null;
  const txHash = sanitizeTxHash(row.txHash);
  if (!txHash || row.blockNumber === null) return null;

  const payload = row.payload ?? {};
  const { title, description } = describe(type, payload);

  return {
    id: row.id,
    rockId: row.rockId,
    type,
    title,
    description,
    detail: `BankRockRegistry :: ${eventName}`,
    txHash,
    blockNumber: row.blockNumber,
    logIndex: row.logIndex ?? 0,
    timestamp: new Date(row.timestamp).toISOString(),
    timestampEpoch: row.timestamp,
    payload,
  };
}

/** Newest first, by block then log index - the order the activity list renders in. */
export function sortEventsNewestFirst(events: IndexerEvent[]): IndexerEvent[] {
  return [...events].sort((a, b) => {
    const blockDiff = BigInt(b.blockNumber) - BigInt(a.blockNumber);
    if (blockDiff !== BigInt(0)) return blockDiff > BigInt(0) ? 1 : -1;
    return b.logIndex - a.logIndex;
  });
}

/**
 * Merges the mirrored history with what this scan just read from the chain.
 *
 * Pure, and deliberately chain-last: the log id is `${txHash}-${logIndex}`, so a freshly decoded
 * event replaces the stored copy of the same log rather than appearing twice. The chain stays the
 * source of truth; D1 only supplies the blocks this scan did not have to ask for.
 */
export function mergeEvents(
  stored: IndexerEvent[],
  fresh: IndexerEvent[],
): IndexerEvent[] {
  const byId = new Map<string, IndexerEvent>();
  for (const event of stored) byId.set(event.id, event);
  for (const event of fresh) byId.set(event.id, event);
  return sortEventsNewestFirst([...byId.values()]);
}

/**
 * Indexes a rock's registry events.
 *
 * The scan resumes from the D1 cursor (B7, `lib/indexer-cursor.ts`) and only ever moves forward:
 * every decoded event in the new range is mirrored, the cursor is advanced **after** that write
 * succeeds, and the rock's older history is read back out of the mirror. With no D1 binding, a
 * failed mirror or an unreadable cursor, the behaviour is exactly what it was before - a full
 * scan from `REGISTRY_DEPLOY_BLOCK`, chunked at 2,000 blocks.
 *
 * @returns REAL with the (possibly empty) event list, or UNAVAILABLE naming what is missing.
 */
export async function getRockOnchainEvents(
  rawRockId: unknown,
): Promise<Capability<IndexerEvent[]>> {
  const rockId = sanitizeRockId(rawRockId);
  if (rockId === null) return unavailable("rockId must be an unsigned integer");

  const registry = addresses.registry;
  if (!registry) {
    return unavailable(
      "NEXT_PUBLIC_REGISTRY_ADDRESS is not configured - the registry is not deployed yet, so no provenance exists on chain",
    );
  }

  const deployBlock = registryDeployBlock();
  if (deployBlock === null) {
    return unavailable(
      "REGISTRY_DEPLOY_BLOCK is not configured - without it the indexer has no starting block to scan from",
    );
  }

  const cacheKey = rockId.toString();
  const cached = eventCache.get(cacheKey);
  const now = Date.now();
  if (cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return real(cached.events);
  }

  const start = Date.now();
  const client = getPublicClient();

  // The cursor is per (chain, registry): a redeployed registry starts its own.
  //
  // `lib/db` types the binding as the narrowest thing it uses (`prepare(): unknown`), because
  // `@cloudflare/workers-types` is not a dependency here. The cursor store needs the statement
  // surface, so it is widened once, in one place, exactly as the Drizzle driver is.
  const d1 = getD1() as D1DatabaseLike | null;
  const cursorId = indexerCursorId(chainId, registry);
  const cursor = d1 ? await readIndexerCursor(d1, cursorId) : null;
  const fromBlock = resumeFromBlock(deployBlock, cursor);

  try {
    const currentBlock = await client.getBlockNumber();
    // Only blocks a few confirmations below the head are mirrored and counted by the cursor
    // (review R-17). The tail above that is scanned as well, so the answer is as fresh as the
    // chain - it is just not written down until it has settled.
    const safeHead = confirmedHead(currentBlock);
    const ranges = buildBlockRanges(fromBlock, safeHead);
    const tailFrom = safeHead + BigInt(1) > fromBlock ? safeHead + BigInt(1) : fromBlock;
    const tailRanges = buildBlockRanges(tailFrom, currentBlock);

    logger.info("Indexing registry events", {
      action: "INDEXER_FETCH_START",
      rockId: cacheKey,
      fromBlock: fromBlock.toString(),
      toBlock: currentBlock.toString(),
      confirmedToBlock: safeHead.toString(),
      chunks: ranges.length + tailRanges.length,
      resumed: cursor !== null,
    });

    const blockTimestamps = new Map<string, number>();
    const readBlockTimestamp = async (blockNumber: bigint): Promise<number> => {
      const key = blockNumber.toString();
      const known = blockTimestamps.get(key);
      if (known !== undefined) return known;
      const block = await client.getBlock({ blockNumber });
      const epochMs = Number(block.timestamp) * 1000;
      blockTimestamps.set(key, epochMs);
      return epochMs;
    };

    // Every rock's events, not just this one's: the cursor is shared, so a range scanned for one
    // rock must be mirrored in full or another rock's history would be skipped for good.
    const scanned: IndexerEvent[] = [];
    // Events in the unconfirmed tail: answered, never mirrored, never behind the cursor.
    const unconfirmed: IndexerEvent[] = [];

    const scanRanges = async (blockRanges: BlockRange[], into: IndexerEvent[]) => {
      for (const range of blockRanges) {
        // One address-filtered query per chunk, then decode. The registry emits few logs, and
        // filtering by topic per event name would be seven round trips for the same data.
        const logs = await client.getLogs({
          address: registry as Address,
          fromBlock: range.fromBlock,
          toBlock: range.toBlock,
        });

        for (const log of logs) {
          if (log.blockNumber === null) continue;
          const epochMs = await readBlockTimestamp(log.blockNumber);
          const event = decodeRegistryLog(log, epochMs);
          if (event) into.push(event);
        }
      }
    };

    await scanRanges(ranges, scanned);
    await scanRanges(tailRanges, unconfirmed);

    const fresh = [...scanned, ...unconfirmed].filter((event) => event.rockId === cacheKey);
    let events = sortEventsNewestFirst(fresh);

    if (d1) {
      const mirrored = await mirrorToDatabase(scanned);
      // Only ever advance the cursor over blocks whose events are durably stored. A cursor ahead
      // of the mirror skips history permanently, which is the one failure this cache must not have.
      // And only as far as the confirmed head: the tail is read again on the next poll.
      if (mirrored && safeHead >= fromBlock) {
        await advanceIndexerCursor(d1, cursorId, safeHead);
      }

      const stored = await readStoredEvents(cacheKey);
      if (stored === null) {
        if (cursor !== null) {
          // This scan started after the deploy block, so what it holds is a window, not a
          // history. Saying so is the only honest answer (D-013).
          return unavailable(
            "The indexed history could not be read from the database, and this scan covered only the most recent blocks",
          );
        }
      } else {
        events = mergeEvents(stored, fresh);
      }
    }

    eventCache.set(cacheKey, { events, cachedAt: now });

    logger.info("Registry indexing completed", {
      action: "INDEXER_FETCH_SUCCESS",
      rockId: cacheKey,
      eventsFound: events.length,
      eventsScanned: scanned.length + unconfirmed.length,
      latencyMs: Date.now() - start,
    });

    return real(events);
  } catch (err) {
    logger.error("Registry indexing failed", err, {
      action: "INDEXER_FETCH_ERROR",
      rockId: cacheKey,
      latencyMs: Date.now() - start,
    });
    // A failed scan is not "no events". Say so.
    return unavailable(
      publicReasonWith(`Could not read registry events from ${chain.name}`, err),
    );
  }
}

/**
 * The rock's mirrored history, or null when it could not be read.
 *
 * Null is not "no events": an empty list is a real answer and null is a failure, and the caller
 * treats them differently - see `getRockOnchainEvents`.
 */
async function readStoredEvents(rockId: string): Promise<IndexerEvent[] | null> {
  const db = getDb();
  if (!db) return null;
  try {
    const rows = await db.select().from(rockEvents).where(eq(rockEvents.rockId, rockId));
    const events: IndexerEvent[] = [];
    for (const row of rows) {
      const event = rowToIndexerEvent({
        id: row.id,
        rockId: row.rockId,
        eventType: row.eventType,
        txHash: row.txHash,
        logIndex: row.logIndex,
        blockNumber: row.blockNumber,
        payload: row.payload ?? null,
        timestamp: row.timestamp,
      });
      if (event) events.push(event);
    }
    return events;
  } catch (err) {
    logger.warn("Could not read the indexed events back from the database", {
      action: "INDEXER_READ_FAILED",
      reason: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Mirrors decoded events into D1.
 *
 * The row id is `${txHash}-${logIndex}`, so re-indexing the same range is idempotent.
 *
 * The return value matters now: the cursor may only advance over blocks whose events are in the
 * table. A failed write is still not fatal to the read - the chain remains the source of truth,
 * and the next poll simply re-scans the same range.
 */
async function mirrorToDatabase(events: IndexerEvent[]): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  if (events.length === 0) return true;

  try {
    for (const event of events) {
      await db
        .insert(rockEvents)
        .values({
          id: event.id,
          rockId: event.rockId,
          eventType: event.type,
          txHash: event.txHash,
          logIndex: event.logIndex,
          blockNumber: event.blockNumber,
          payload: event.payload,
          amountUsdc: null,
          amountWeth: null,
          timestamp: event.timestampEpoch,
        })
        .onConflictDoNothing();
    }
    return true;
  } catch (err) {
    logger.warn("Could not mirror indexed events into the database", {
      action: "INDEXER_MIRROR_FAILED",
      reason: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
