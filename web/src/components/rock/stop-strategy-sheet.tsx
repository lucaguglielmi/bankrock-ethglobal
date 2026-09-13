"use client";

/**
 * "Cash in?" - stopping one stream (Flow H; `contracts/aqua/NOTES.md` §4).
 *
 * Docking *is* the withdrawal. Nothing was ever taken from the rock's account, so nothing comes
 * back: `dock` zeroes the stream's allowance and marks it closed, and the tokens - fees included -
 * are exactly where they were. The copy says that literally and promises no incoming transfer.
 *
 * A docked stream can never be revived; starting again means a new stream, at any fee tier. This
 * sheet used to live behind the owner's overflow menu; it now sits beside the stream it stops.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody } from "@/components/ui/sheet";
import { useRockActions } from "@/hooks/useBankRock";
import {
  ActionOutcomeNotice,
  outcomeFrom,
  type ActionOutcome,
} from "@/components/rock/action-result";

export interface StopStrategySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rockId: string;
  /** The stream to stop. The sheet is inert without one. */
  streamIndex?: number;
  /** The stream's name, for the description line. */
  streamLabel?: string;
  /** Called once the dock transaction has really gone through. */
  onStopped: () => void;
}

export function StopStrategySheet({
  open,
  onOpenChange,
  rockId,
  streamIndex,
  streamLabel,
  onStopped,
}: StopStrategySheetProps) {
  const { dockStrategy, isPending } = useRockActions();
  const [outcome, setOutcome] = useState<ActionOutcome | null>(null);

  // Reset the last outcome whenever the sheet is opened again (state from a previous render,
  // adjusted during render - no effect needed).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setOutcome(null);
  }

  const done = outcome !== null && outcome.kind !== "error";

  const run = async () => {
    if (streamIndex === undefined) return;
    const result = outcomeFrom(await dockStrategy(rockId, streamIndex));
    setOutcome(result);
    if (result.kind !== "error") onStopped();
  };

  const footer = done ? (
    <Button size="lg" className="w-full" onClick={() => onOpenChange(false)}>
      Done
    </Button>
  ) : (
    <div className="flex flex-col gap-3 sm:flex-row-reverse">
      <Button
        size="lg"
        className="w-full sm:flex-1"
        onClick={run}
        disabled={isPending || streamIndex === undefined}
      >
        {isPending ? "Stopping…" : "Cash in"}
      </Button>
      <Button
        size="lg"
        variant="outline"
        className="w-full sm:flex-1"
        onClick={() => onOpenChange(false)}
        disabled={isPending}
      >
        Keep trading
      </Button>
    </div>
  );

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Cash in?"
      description={streamLabel ? `Stops the ${streamLabel} stream.` : undefined}
      footer={footer}
    >
      <SheetBody className="flex flex-col gap-3">
        <p className="max-w-prose text-base text-ink-2">
          Stops trading on this stream. Your tokens never left your account.
        </p>
        <p className="max-w-prose text-sm text-ink-3">
          The fees earned so far are already part of the rock&rsquo;s balance. You can start earning
          again at any time, with any fee tier.
        </p>
        <ActionOutcomeNotice outcome={outcome} successLabel="This stream has stopped" />
      </SheetBody>
    </Sheet>
  );
}
