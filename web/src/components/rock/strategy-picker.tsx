"use client";

/**
 * "Choose how this rock earns" — one card per strategy the rock can run.
 *
 * The cards are `SHIP_OPTIONS`, which is derived from `DEFAULT_STREAMS`: the only strategies any
 * reader in the app probes (`ship-options.ts`). Nothing here names a strategy or a fee itself —
 * a new preset in the catalogue arrives here already described, and one that is already live is
 * left out by the caller (`unshippedOptions`), because a strategy is immutable and a docked one
 * can never be revived (`contracts/aqua/NOTES.md` §4).
 *
 * Picking a card does not ship anything. On the Liquidity tab it opens the ship sheet on that
 * option; inside the sheet it is the selection itself, and `renderDetail` lets the sheet write
 * under each card what that strategy would be allowed to trade at the current offer.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import { formatFeeRate } from "@/components/rock/util";
import type { ShipOption } from "@/components/rock/ship-options";
import { StrategyArt } from "@/components/rock/strategy-art";

export interface StrategyPickerProps {
  /** The strategies still open to this rock. Empty means everything is already live. */
  options: readonly ShipOption[];
  onPick: (option: ShipOption) => void;
  /**
   * The option currently chosen. `null` means the picker is a selection control with nothing
   * chosen yet; leave it undefined when picking a card is an action rather than a choice.
   */
  selectedStreamIndex?: number | null;
  /** When the owner's wallet may not act from the rock's account (D-037): the cards are disabled and this is shown. */
  disabledReason?: string | null;
  /** Disables the cards without adding a sentence — for when the surface already explains why. */
  disabled?: boolean;
  /** Inline content under the hint — the amounts this strategy would ship, for instance. */
  renderDetail?: (option: ShipOption) => ReactNode;
  /** Smaller cards — art, name and fee only — for the "Add another strategy" row. */
  compact?: boolean;
}

export function StrategyPicker({
  options,
  onPick,
  selectedStreamIndex,
  disabledReason = null,
  disabled = false,
  renderDetail,
  compact = false,
}: StrategyPickerProps) {
  const isDisabled = disabled || disabledReason !== null;
  const selectable = selectedStreamIndex !== undefined;

  return (
    <div className="flex flex-col gap-3">
      <ul className={cn("flex flex-col", compact ? "gap-2" : "gap-3")}>
        {options.map((option) => {
          const selected = option.streamIndex === selectedStreamIndex;
          return (
            <li key={option.streamIndex}>
              <button
                type="button"
                aria-pressed={selectable ? selected : undefined}
                disabled={isDisabled}
                onClick={() => onPick(option)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl border border-border bg-background text-left text-ink",
                  "motion-safe:transition-colors hover:bg-muted",
                  "aria-pressed:border-ink aria-pressed:inset-ring aria-pressed:inset-ring-ink",
                  "disabled:pointer-events-none disabled:opacity-50",
                  compact ? "min-h-14 px-3 py-2" : "min-h-20 px-4 py-4",
                )}
              >
                <StrategyArt
                  label={option.label}
                  className={cn("text-ink", compact ? "size-10" : "size-14")}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-base font-semibold text-ink">{option.label}</span>
                    <span className="shrink-0 text-num tabular-nums font-semibold text-ink">
                      {formatFeeRate(option.feeBps)}
                    </span>
                  </span>
                  {compact ? null : (
                    <>
                      <span className="max-w-prose text-sm text-ink-2">{option.hint}</span>
                      {renderDetail ? (
                        <span className="text-sm tabular-nums text-ink-3">
                          {renderDetail(option)}
                        </span>
                      ) : null}
                    </>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {disabledReason ? (
        <p role="status" className="max-w-prose text-sm text-ink-3">
          {disabledReason}
        </p>
      ) : null}
    </div>
  );
}
