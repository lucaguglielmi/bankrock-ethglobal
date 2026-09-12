/**
 * The streams the ship sheet may offer — and nothing else.
 *
 * A strategy's identity is `(rockId, streamIndex, feeBps, maker, tokens)`: change the fee by one
 * basis point and the hash changes, so the stream has no balances and **no reader can find it**.
 * Every reader in the app probes exactly `DEFAULT_STREAMS` — `lib/aqua/read.ts` (`readRockStreams`),
 * `GET /api/rocks/[id]/strategy`, and `findShippedStream` in `hooks/useBankRock.ts`, which the
 * position card, the Trade button, the quote route and Cash in all sit behind.
 *
 * So the sheet's choices are derived from that same constant rather than written out again. A
 * fee tier the sheet offered but no reader probed would ship a strategy nothing could see, and
 * a shipped strategy cannot be re-shipped at a different fee: it would be a second stream, and
 * the first one's allowance would still be live. `ship-options.test.ts` pins the two lists
 * together.
 */

import { DEFAULT_STREAMS } from "@/lib/aqua/strategy";

export interface ShipOption {
  /** The stream index this option ships. */
  streamIndex: number;
  /** The strategy's immutable fee, in basis points. */
  feeBps: number;
  /** Short name — "Wide", "Tight". */
  label: string;
  /** What the fee means for the rock, in the owner's words. */
  hint: string;
}

/**
 * What each stream means for the person shipping it. Keyed by the preset's own label so a new
 * preset in `DEFAULT_STREAMS` still appears here, described by its own text rather than silently
 * dropped.
 */
const HINTS: Record<string, string> = {
  Wide: "Trades less often, earns more per trade",
  Tight: "Trades more often, earns less per trade",
};

export const SHIP_OPTIONS: readonly ShipOption[] = DEFAULT_STREAMS.map((preset) => ({
  streamIndex: preset.streamIndex,
  feeBps: preset.feeBps,
  label: preset.label,
  hint: HINTS[preset.label] ?? preset.description,
}));

/** The option a sheet opened at `streamIndex` should start on. Falls back to the first stream. */
export function shipOptionFor(streamIndex: number | undefined): ShipOption {
  return (
    SHIP_OPTIONS.find((option) => option.streamIndex === streamIndex) ?? SHIP_OPTIONS[0]
  );
}
