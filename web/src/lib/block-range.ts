/**
 * Block-range chunking for `eth_getLogs`, in one place (X-5, D-036).
 *
 * Every provider caps the span of a single `eth_getLogs`, and a public endpoint caps it lower
 * than a keyed one. D-036 measured the default public Sepolia endpoint serving a *filtered*
 * 2,000-block query in 129 ms and a 10,000-block one in 521 ms, and refusing an unfiltered
 * 2,000-block query. 2,000 is therefore the chunk every scan in this application uses: it is the
 * size that was actually proven, on the endpoint the demo may well run on.
 *
 * This module exists because the same arithmetic was needed by two scanners - the registry
 * indexer and the Aqua fee scan - and one of them did not have it.
 */

/** Maximum span of a single `eth_getLogs` call. */
export const MAX_BLOCK_CHUNK = BigInt(2000);

export interface BlockRange {
  fromBlock: bigint;
  toBlock: bigint;
}

/**
 * Splits [fromBlock, toBlock] into inclusive chunks of at most `chunkSize` blocks.
 *
 * An inverted range yields no chunks, which is what "there is nothing new to scan" looks like
 * when a cursor has already reached the head of the chain.
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
