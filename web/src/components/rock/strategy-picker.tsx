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
 * Picking a card does not ship anything. It opens the ship sheet on that option, where the
 * amounts are chosen and the consequence is stated before anything is signed.
 */

import { Button } from "@/components/ui/button";
import { formatFeeRate } from "@/components/rock/util";
import type { ShipOption } from "@/components/rock/ship-options";

export interface StrategyPickerProps {
  /** The strategies still open to this rock. Empty means everything is already live. */
  options: readonly ShipOption[];
  onPick: (option: ShipOption) => void;
  /** When the owner's wallet may not act from the rock's account (D-037): the cards are disabled and this is shown. */
  disabledReason?: string | null;
  /** The option currently chosen, when the picker is used to change a choice. */
  selectedStreamIndex?: number;
}

export function StrategyPicker({
  options,
  onPick,
  disabledReason = null,
  selectedStreamIndex,
}: StrategyPickerProps) {
  const disabled = disabledReason !== null;

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-3">
        {options.map((option) => {
          const selected = option.streamIndex === selectedStreamIndex;
          return (
            <li key={option.streamIndex}>
              <Button
                variant="outline"
                aria-pressed={selected}
                disabled={disabled}
                onClick={() => onPick(option)}
                className="h-auto min-h-14 w-full flex-wrap items-start justify-between gap-x-6 gap-y-1 rounded-2xl px-4 py-4 text-left aria-pressed:border-ink"
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-base font-semibold text-ink">{option.label}</span>
                  <span className="max-w-prose whitespace-normal text-sm font-normal text-ink-3">
                    {option.hint}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <span className="text-num tabular-nums font-semibold text-ink">
                    {formatFeeRate(option.feeBps)}
                  </span>
                  <span className="text-caption font-normal text-ink-3">of every trade</span>
                </span>
              </Button>
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
