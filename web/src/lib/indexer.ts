/**
 * On-chain event indexer and provenance engine (X-5).
 *
 * Corrected behaviour:
 *  - the scan starts at `REGISTRY_DEPLOY_BLOCK` and walks forward. The old code scanned
 *    `currentBlock - 50000`, a rolling ~27-hour window, so provenance silently aged out and the
 *    deploy block was unreachable;
 *  - the range is walked in chunks of at most 2,000 blocks. A single 50,000-block `eth_getLogs`
 *    is rejected by most providers;
 *  - timestamps are read from the block the log is in. The old code wrote `now - 3600000` and
 *    `now - 1800000` — fabricated times presented as provenance;
 *  - with no registry address, no deploy block or no reachable RPC, the result is UNAVAILABLE
 *    with the reason. An empty list is only ever returned when the chain really has no events.
 */

import { isAddress, getAddress, type Address, type Hash } from "viem";
import { BANK_ROCK_REGISTRY_ABI } from "@/lib/chain/abi/registry";
import { addresses, chain, getPublicClient } from "@/lib/chain";
import { optionalEnv, real, unavailable, type Capability } from "@/lib/demo";
import { logger } from "@/lib/telemetry";

export interface IndexerEvent {
  id: string;
  type: "awaken" | "transfer" | "trade" | "hardware";
  title: string;
  description: string;
  detail?: string;
  txHash?: Hash;
  blockNumber: string;
  logIndex: number;
  /** ISO-8601, read from the block header. Never synthesized. */
  timestamp: string;
  /** Unix epoch milliseconds, read from the block header. */
  timestampEpoch: number;
}

const TX_HASH_REGEX = /^0x[0-9a-fA-F]{64}$/;
const NUMERIC_REGEX = /^\d+$/;

/** Maximum span of a single `eth_getLogs` call. */
export const MAX_BLOCK_CHUNK = BigInt(2000);

export function sanitizeRockId(input: unknown): bigint | null {
  if (typeof input === "bigint") {
    return input >= BigInt(0) ? input : null;
  }
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
  if (!TX_HASH_REGEX.test(trimmed)) return null;
  return trimmed as Hash;
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

/**
 * Splits [fromBlock, toBlock] into inclusive chunks of at most `chunkSize` blocks.
 * Returns an empty list when the range is empty or inverted.
 */
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

interface CacheEntry {
  events: IndexerEvent[];
  cachedAt: number;
}
const eventCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15_000;

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Indexes a rock's registry events.
 *
 * @returns REAL with the (possibly empty) event list, or UNAVAILABLE naming what is missing.
 */
export async function getRockOnchainEvents(
  rawRockId: unknown,
): Promise<Capability<IndexerEvent[]>> {
  const rockId = sanitizeRockId(rawRockId);
  if (rockId === null) {
    return unavailable("rockId must be an unsigned integer");
  }

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

    const parsedEvents: IndexerEvent[] = [];
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

    for (const range of ranges) {
      const [awakenLogs, transferLogs] = await Promise.all([
        client.getContractEvents({
          address: registry as Address,
          abi: BANK_ROCK_REGISTRY_ABI,
          eventName: "RockAwakened",
          args: { rockId },
          fromBlock: range.fromBlock,
          toBlock: range.toBlock,
        }),
        client.getContractEvents({
          address: registry as Address,
          abi: BANK_ROCK_REGISTRY_ABI,
          eventName: "RockOwnershipTransferred",
          args: { rockId },
          fromBlock: range.fromBlock,
          toBlock: range.toBlock,
        }),
      ]);

      for (const log of awakenLogs) {
        const txHash = sanitizeTxHash(log.transactionHash);
        const owner = sanitizeAddress(log.args.owner);
        const smartAccount = sanitizeAddress(log.args.smartAccount);
        if (!txHash || !owner || log.blockNumber === null || log.logIndex === null) continue;

        const epochMs = await readBlockTimestamp(log.blockNumber);
        parsedEvents.push({
          id: `onchain-awaken-${log.blockNumber}-${log.logIndex}`,
          type: "awaken",
          title: "Rock awakened on-chain",
          description: `Bound to Rock Account ${smartAccount ? shorten(smartAccount) : "unknown"} with custodian ${shorten(owner)}.`,
          detail: "BankRockRegistry :: RockAwakened",
          txHash,
          blockNumber: log.blockNumber.toString(),
          logIndex: log.logIndex,
          timestamp: new Date(epochMs).toISOString(),
          timestampEpoch: epochMs,
        });
      }

      for (const log of transferLogs) {
        const txHash = sanitizeTxHash(log.transactionHash);
        const prevOwner = sanitizeAddress(log.args.previousOwner);
        const newOwner = sanitizeAddress(log.args.newOwner);
        if (!txHash || !prevOwner || !newOwner || log.blockNumber === null || log.logIndex === null)
          continue;

        const epochMs = await readBlockTimestamp(log.blockNumber);
        parsedEvents.push({
          id: `onchain-transfer-${log.blockNumber}-${log.logIndex}`,
          type: "transfer",
          title: "Custody handover finalised",
          description: `Ownership transferred from ${shorten(prevOwner)} to ${shorten(newOwner)} on ${chain.name}.`,
          detail: "BankRockRegistry :: RockOwnershipTransferred",
          txHash,
          blockNumber: log.blockNumber.toString(),
          logIndex: log.logIndex,
          timestamp: new Date(epochMs).toISOString(),
          timestampEpoch: epochMs,
        });
      }
    }

    parsedEvents.sort((a, b) => {
      const blockDiff = BigInt(b.blockNumber) - BigInt(a.blockNumber);
      if (blockDiff !== BigInt(0)) return blockDiff > BigInt(0) ? 1 : -1;
      return b.logIndex - a.logIndex;
    });

    eventCache.set(cacheKey, { events: parsedEvents, cachedAt: now });

    logger.info("Registry indexing completed", {
      action: "INDEXER_FETCH_SUCCESS",
      rockId: cacheKey,
      eventsFound: parsedEvents.length,
      latencyMs: Date.now() - start,
    });

    return real(parsedEvents);
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
