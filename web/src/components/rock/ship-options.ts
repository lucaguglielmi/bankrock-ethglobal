/**
 * The streams the ship sheet may offer - and nothing else.
 *
 * A strategy's identity is `(rockId, streamIndex, feeBps, maker, tokens)`: change the fee by one
 * basis point and the hash changes, so the stream has no balances and **no reader can find it**.
 * Every reader in the app probes exactly `DEFAULT_STREAMS` - `lib/aqua/read.ts` (`readRockStreams`),
 * `GET /api/rocks/[id]/strategy`, and `findShippedStream` in `hooks/useBankRock.ts`, which the
 * position card, the Trade button, the quote route and Cash in all sit behind.
 *
 * So the sheet's choices are derived from that same constant rather than written out again. A
 * fee tier the sheet offered but no reader probed would ship a strategy nothing could see, and
 * a shipped strategy cannot be re-shipped at a different fee: it would be a second stream, and
 * the first one's allowance would still be live. `ship-options.test.ts` pins the two lists
 * together.
 *
 * The owner-facing words come from the preset itself (`forWhom`, `description`), so a preset
 * added to the catalogue arrives here already described - there is no second table to update.
 */

import { DEFAULT_STREAMS, type StreamPreset } from "@/lib/aqua/strategy";

export interface ShipOption {
  /** The stream index this option ships. */
  streamIndex: number;
  /** The strategy's immutable fee, in basis points. */
  feeBps: number;
  /** Short name - "Wide", "Tight", "Patient". */
  label: string;
  /** What the fee means for the rock, in the owner's words. The preset's `forWhom`. */
  hint: string;
  /** The fee and what it is, in a phrase: "0.30% - the everyday curve". */
  description: string;
  /** The catalogue entry this option was derived from. */
  preset: StreamPreset;
}

export const SHIP_OPTIONS: readonly ShipOption[] = DEFAULT_STREAMS.map((preset) => ({
  streamIndex: preset.streamIndex,
  feeBps: preset.feeBps,
  label: preset.label,
  hint: preset.forWhom,
  description: preset.description,
  preset,
}));

/** The option a sheet opened at `streamIndex` should start on. Falls back to the first stream. */
export function shipOptionFor(streamIndex: number | undefined): ShipOption {
  return (
    SHIP_OPTIONS.find((option) => option.streamIndex === streamIndex) ?? SHIP_OPTIONS[0]
  );
}

/**
 * The options an owner can still add: every preset whose stream is not live. A live stream is
 * immutable and a docked one can never be revived, so neither is offered again.
 */
export function unshippedOptions(
  liveStreamIndexes: ReadonlyArray<number | bigint>,
): ShipOption[] {
  const live = new Set(liveStreamIndexes.map((index) => Number(index)));
  return SHIP_OPTIONS.filter((option) => !live.has(option.streamIndex));
}
