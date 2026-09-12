/**
 * Every option the ship sheet offers must be findable afterwards.
 *
 * `findShippedStream` (hooks/useBankRock.ts) asks `readRockStreams`, which probes
 * `DEFAULT_STREAMS`: for each preset it rebuilds `(rockId, streamIndex, feeBps, maker, tokens)`,
 * hashes it, and asks Aqua for that hash's balances. A stream is "live" only when the hash the
 * reader computes is the hash the owner shipped.
 *
 * This test reproduces that probe against the sheet's own list. It fails if a fee tier is ever
 * added to the sheet that no reader looks for — which is the defect it was written for: stream 0
 * at 5 or 100 bps shipped a real allowance that the position card, the Trade button, the quote
 * route and Cash in all reported as "not trading".
 */

import { describe, expect, it } from "vitest";
import type { Address } from "viem";
import { buildStrategy, DEFAULT_STREAMS } from "@/lib/aqua/strategy";
import { SHIP_OPTIONS, shipOptionFor } from "./ship-options";

const ROCK_ID = "42";
const MAKER = "0x00000000000000000000000000000000000000A1" as Address;
const USDC = "0x00000000000000000000000000000000000000c0" as Address;
const WETH = "0x00000000000000000000000000000000000000C1" as Address;

/** What `readRockStreams` probes for a rock: one hash per preset, in order. */
const PROBED = DEFAULT_STREAMS.map((preset) =>
  buildStrategy({
    maker: MAKER,
    token0: USDC,
    token1: WETH,
    feeBps: preset.feeBps,
    rockId: ROCK_ID,
    streamIndex: preset.streamIndex,
  }),
);

describe("the ship sheet's choices", () => {
  it("offers at least one stream, and never more than the readers probe", () => {
    expect(SHIP_OPTIONS.length).toBeGreaterThan(0);
    expect(SHIP_OPTIONS.length).toBeLessThanOrEqual(DEFAULT_STREAMS.length);
  });

  it("is exactly the streams every reader knows about", () => {
    expect(SHIP_OPTIONS.map((option) => [option.streamIndex, option.feeBps])).toEqual(
      DEFAULT_STREAMS.map((preset) => [preset.streamIndex, preset.feeBps]),
    );
  });

  it.each(SHIP_OPTIONS.map((option) => [option.label, option]))(
    "%s ships a strategy findShippedStream finds",
    (_label, option) => {
      // What the ship batch encodes for this option.
      const shipped = buildStrategy({
        maker: MAKER,
        token0: USDC,
        token1: WETH,
        feeBps: option.feeBps,
        rockId: ROCK_ID,
        streamIndex: option.streamIndex,
      });

      // The reader probes by hash, then `findShippedStream` picks the stream by index.
      const probedHashes = PROBED.map((candidate) => candidate.strategyHash);
      expect(probedHashes).toContain(shipped.strategyHash);

      const found = PROBED.find(
        (candidate) => candidate.params.streamIndex === BigInt(option.streamIndex),
      );
      expect(found).toBeDefined();
      expect(found!.strategyHash).toBe(shipped.strategyHash);
      expect(found!.params.feeBps).toBe(BigInt(option.feeBps));
    },
  );

  it("names 'Wide, 30 bps' on stream 0 — the stream every default caller opens on", () => {
    const first = shipOptionFor(undefined);
    expect(first.streamIndex).toBe(0);
    expect(first.feeBps).toBe(30);
    expect(first.label).toBe("Wide");
    expect(shipOptionFor(0)).toEqual(first);
  });

  it("falls back to the first stream rather than an index no reader probes", () => {
    expect(shipOptionFor(7)).toEqual(SHIP_OPTIONS[0]);
  });

  it("gives every option a hint of its own", () => {
    for (const option of SHIP_OPTIONS) {
      expect(option.hint.trim().length).toBeGreaterThan(0);
    }
    expect(new Set(SHIP_OPTIONS.map((option) => option.hint)).size).toBe(SHIP_OPTIONS.length);
  });
});
