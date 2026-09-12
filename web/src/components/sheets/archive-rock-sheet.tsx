"use client";

/**
 * Retire sheet — the terminal lifecycle state on the registry (`archiveRock`).
 *
 * Archiving cannot be undone, so the consequence is spelled out in plain language and the
 * confirmation is typed, not tapped: a destructive 56 px button that only wakes up once the
 * word has been written out.
 */

import * as React from "react";
import { Sheet, SheetBody } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CapabilityResult } from "@/components/sheets/capability-result";
import type { Capability } from "@/lib/demo";
import { useRockActions } from "@/hooks/useBankRock";

const CONFIRMATION_WORD = "RETIRE";

export type ArchiveResult = Capability<{ txHash: `0x${string}` }>;

export interface ArchiveRockSheetProps {
  isOpen: boolean;
  onClose: () => void;
  rockId: string;
  onArchived?: (result: ArchiveResult) => void;
}

export function ArchiveRockSheet({
  isOpen,
  onClose,
  rockId,
  onArchived,
}: ArchiveRockSheetProps) {
  const { archiveRock, isPending } = useRockActions();

  const [confirmation, setConfirmation] = React.useState("");
  const [result, setResult] = React.useState<ArchiveResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const confirmed = confirmation.trim().toUpperCase() === CONFIRMATION_WORD;

  const handleArchive = React.useCallback(async () => {
    if (!confirmed) return;
    setError(null);
    try {
      const capability = await archiveRock(rockId);
      setResult(capability);
      onArchived?.(capability);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The rock was not retired. Nothing has changed.",
      );
    }
  }, [confirmed, archiveRock, rockId, onArchived]);

  const footer = result ? (
    <Button type="button" size="lg" className="w-full" onClick={onClose}>
      Done
    </Button>
  ) : (
    <div className="flex flex-col gap-2">
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        variant="destructive"
        size="lg"
        className="w-full"
        disabled={!confirmed || isPending}
        onClick={handleArchive}
      >
        <span className="motion-safe:transition-opacity">
          {isPending ? "Retiring…" : "Retire this rock"}
        </span>
      </Button>
    </div>
  );

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Retire this rock"
      description={`Rock #${rockId} stops being an active rock.`}
      footer={footer}
    >
      <SheetBody className="flex flex-col gap-6">
        {result ? (
          <CapabilityResult
            result={result}
            title="The rock is retired"
            description="Its history stays readable. The tag can now awaken a new rock."
          />
        ) : (
          <>
            <div className="rounded-2xl border border-border p-4">
              <h3 className="text-h3 font-semibold text-ink">What this does</h3>
              <p className="mt-2 max-w-prose text-base text-ink-2">
                Its history stays. The tag can then awaken a new rock. This cannot be undone.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="archive-confirmation" className="text-label text-ink-3">
                TYPE {CONFIRMATION_WORD} TO CONFIRM
              </label>
              <input
                id="archive-confirmation"
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder={CONFIRMATION_WORD}
                className="h-12 w-full rounded-2xl border border-border bg-transparent px-3 text-base text-ink outline-none placeholder:text-ink-4 focus:border-ring focus:ring-3 focus:ring-ring/50"
              />
              <p className="text-sm text-ink-2">
                The button below stays off until the word matches.
              </p>
            </div>
          </>
        )}
      </SheetBody>
    </Sheet>
  );
}
