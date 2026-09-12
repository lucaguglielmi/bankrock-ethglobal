/**
 * Registry event indexer — a rock's provenance (X-5, spec 15 Phase 2 item 5).
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
 *  - with no registry address, no deploy block or an unreachable RPC, the result is UNAVAILABLE
 *    with the reason. An empty list only ever means the chain holds no events.
 */

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
import { addresses, chain, getPublicClient } from "@/lib/chain";
import { getDb } from "@/lib/db";
import { rockEvents } from "@/lib/db/schema";
import { optionalEnv, real, unavailable, type Capability } from "@/lib/demo";
import { logger } from "@/lib/telemetry";

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

/** Maximum span of a single `eth_getLogs` call. */
export const MAX_BLOCK_CHUNK = BigInt(2000);

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

export interface BlockRange {
  fromBlock: bigint;
  toBlock: bigint;
}

/** Splits [fromBlock, toBlock] into inclusive chunks of at most `chunkSize` blocks. */
export function buildBlockRanges(
  fromBlock: bigint,
  toBlock: bigint,
  chunkSize: bigint = MAX_BLOCK_CHUNK,
): BlockRange[] {
  if (chunkSize <= BigInt(0)) throw new Error("chunkSize must be positive");
  if (toBlock < fromBlock) return [];

  const ranges: BlockRange[] = [];
  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const end = cursor + chunkSize - BigInt(1);
    ranges.push({ fromBlock: cursor, toBlock: end > toBlock ? toBlock : end });
    cursor = end + BigInt(1);
  }
  return ranges;
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
 * from `getLogs` — or assembled in a test — needs no cast to be decoded.
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

/**
 * Indexes a rock's registry events.
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
      "NEXT_PUBLIC_REGISTRY_ADDRESS is not configured — the registry is not deployed yet, so no provenance exists on chain",
    );
  }

  const deployBlock = registryDeployBlock();
  if (deployBlock === null) {
    return unavailable(
      "REGISTRY_DEPLOY_BLOCK is not configured — without it the indexer has no starting block to scan from",
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

  try {
    const currentBlock = await client.getBlockNumber();
    const ranges = buildBlockRanges(deployBlock, currentBlock);

    logger.info("Indexing registry events", {
      action: "INDEXER_FETCH_START",
      rockId: cacheKey,
      fromBlock: deployBlock.toString(),
      toBlock: currentBlock.toString(),
      chunks: ranges.length,
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

    const events: IndexerEvent[] = [];

    for (const range of ranges) {
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
        if (event && event.rockId === cacheKey) events.push(event);
      }
    }

    events.sort((a, b) => {
      const blockDiff = BigInt(b.blockNumber) - BigInt(a.blockNumber);
      if (blockDiff !== BigInt(0)) return blockDiff > BigInt(0) ? 1 : -1;
      return b.logIndex - a.logIndex;
    });

    eventCache.set(cacheKey, { events, cachedAt: now });
    await mirrorToDatabase(events);

    logger.info("Registry indexing completed", {
      action: "INDEXER_FETCH_SUCCESS",
      rockId: cacheKey,
      eventsFound: events.length,
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
      `Could not read registry events from ${chain.name}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Mirrors decoded events into D1.
 *
 * Best effort and never fatal: the chain is the source of truth, and a failed cache write must
 * not turn a successful read into an error. The row id is `${txHash}-${logIndex}`, so
 * re-indexing the same range is idempotent.
 */
async function mirrorToDatabase(events: IndexerEvent[]): Promise<void> {
  if (events.length === 0) return;
  const db = getDb();
  if (!db) return;

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
  } catch (err) {
    logger.warn("Could not mirror indexed events into the database", {
      action: "INDEXER_MIRROR_FAILED",
      reason: err instanceof Error ? err.message : String(err),
    });
  }
}
