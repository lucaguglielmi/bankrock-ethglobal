"use client";

/**
 * "Trading against" — which of a rock's live streams a swap is aimed at.
 *
 * A rock may run several strategies at once, one per catalogue preset, each with its own fee and
 * its own balances (`docs/dashboard-strategies.md`). The quote route and the swap both take a
 * `streamIndex`, so the choice has to be made before either is asked. The picker renders only when
 * there is a choice to make: with one live stream it is absent and that stream is used.
 *
 * It is one small row above the trade card: the label, then the chips. Chips are 44 px and wrap
 * rather than shrink (spec 17 §4.5). Each is labelled with the preset's name and its fee — the fee
 * is the authenticated half of "what the rock earns" (`formatFeeRate`) and is never annualised
 * (D-004).
 */

import * as React from "react";
import { Button } from "@/components/ui/button";
import { formatFeeRate } from "@/components/rock/util";
import { cn } from "@/lib/ui/cn";
import type { ParsedStream } from "@/hooks/useAquaStrategy";

export interface TradeStreamPickerProps {
  streams: readonly ParsedStream[];
  /** The selected stream's index. */
  value: number;
  onChange: (streamIndex: number) => void;
  className?: string;
}

/** The preset's name, or a plain fallback when the catalogue did not name it. */
export function streamLabel(stream: Pick<ParsedStream, "label" | "streamIndex">): string {
  return stream.label ?? `Stream ${stream.streamIndex.toString()}`;
}

/** The stream a visitor is offered first: the lowest fee, ties broken by catalogue order. */
export function defaultStream(streams: readonly ParsedStream[]): ParsedStream | undefined {
  let best: ParsedStream | undefined;
  for (const stream of streams) {
    if (!best || stream.feeBps < best.feeBps) best = stream;
  }
  return best;
}

export function TradeStreamPicker({ streams, value, onChange, className }: TradeStreamPickerProps) {
  const labelId = React.useId();

  if (streams.length < 2) return null;

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-1", className)}
    >
      <span id={labelId} className="text-label uppercase text-ink-3">
        Trading against
      </span>
      <div className="flex flex-wrap gap-2">
        {streams.map((stream) => {
          const index = Number(stream.streamIndex);
          const selected = index === value;
          return (
            <Button
              key={stream.strategyHash}
              type="button"
              variant={selected ? "default" : "outline"}
              aria-pressed={selected}
              onClick={() => onChange(index)}
              className="h-11 gap-1.5 rounded-full px-4 text-sm font-semibold"
            >
              <span>{streamLabel(stream)}</span>
              <span aria-hidden className={selected ? "text-primary-foreground/60" : "text-ink-4"}>
                ·
              </span>
              <span className="tabular-nums">{formatFeeRate(stream.feeBps)}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
