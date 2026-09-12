"use client";

/**
 * Claim sheet — the second half of Flow E (spec 02), spec 15 SC-5 / D-018.
 *
 * The giver created a pending handover; the recipient tapped the rock. This sheet explains the
 * gift, shows who it is from, and claims it. The claim carries the server-signed attestation
 * produced by that tap — without one there is nothing to claim with, and the button says so
 * rather than pretending.
 */

import * as React from "react";
import { Gift } from "lucide-react";
import { Sheet, SheetBody } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Address } from "@/components/ui/address";
import { CapabilityResult } from "@/components/sheets/capability-result";
import type { Capability } from "@/lib/demo";
import { useRockActions } from "@/hooks/useBankRock";

type RockActions = ReturnType<typeof useRockActions>;

/** Exactly what `claimHandover` accepts — derived so the two can never drift apart. */
export type HandoverAttestation = Parameters<RockActions["claimHandover"]>[1];

export type ClaimResult = Capability<{ txHash: `0x${string}` }>;

export interface ClaimHandoverSheetProps {
  isOpen: boolean;
  onClose: () => void;
  rockId: string;
  /**
   * The attestation from this tap. `null` when the tap has not been verified, in which case
   * there is nothing to claim with and the action stays disabled.
   */
  attestation: HandoverAttestation | null;
  onClaimed?: (result: ClaimResult) => void;
  /** The owner giving the rock away, when the page has read it. */
  giver?: string;
  /** The gift message, when one was left. */
  message?: string;
  /** Unix seconds after which the gift lapses, when known. */
  expiresAt?: number;
}

const NO_ATTESTATION_REASON =
  "Tap the rock with your phone to claim it — a claim needs a verified tap.";

function formatExpiry(expiresAt: number): string {
  return new Date(expiresAt * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function ClaimHandoverSheet({
  isOpen,
  onClose,
  rockId,
  attestation,
  onClaimed,
  giver,
  message,
  expiresAt,
}: ClaimHandoverSheetProps) {
  const { claimHandover, isPending } = useRockActions();

  const [result, setResult] = React.useState<ClaimResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const handleClaim = React.useCallback(async () => {
    if (!attestation) return;
    setError(null);
    try {
      const capability = await claimHandover(rockId, attestation);
      setResult(capability);
      onClaimed?.(capability);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The rock was not claimed. Nothing has changed.",
      );
    }
  }, [attestation, claimHandover, rockId, onClaimed]);

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
      {attestation ? null : (
        <p className="text-sm text-ink-2">{NO_ATTESTATION_REASON}</p>
      )}
      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={!attestation || isPending}
        onClick={handleClaim}
      >
        <span className="motion-safe:transition-opacity">
          {isPending ? "Claiming…" : "Claim this rock"}
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
      title="This rock is a gift"
      description={`Rock #${rockId} is waiting for you to claim it.`}
      footer={footer}
    >
      <SheetBody className="flex flex-col gap-6">
        {result ? (
          <CapabilityResult
            result={result}
            title="The rock is yours"
            description="Its account address and its whole history stay exactly as they were. Only the owner changed."
          />
        ) : (
          <>
            <div className="flex items-start gap-3 rounded-2xl border border-border p-4">
              <Gift aria-hidden className="mt-0.5 size-6 shrink-0 text-ink-3" />
              <p className="max-w-prose text-base text-ink-2">
                Someone gave you this rock. Claiming it makes you its owner — the account, the
                balance it holds and everything it has done so far come with it.
              </p>
            </div>

            <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 text-sm">
              <dt className="text-ink-3">From</dt>
              <dd className="justify-self-end">
                {giver ? (
                  <Address value={giver} />
                ) : (
                  <span className="text-ink-3">The current owner</span>
                )}
              </dd>
              {expiresAt !== undefined ? (
                <>
                  <dt className="text-ink-3">Claim before</dt>
                  <dd className="justify-self-end font-medium text-ink">
                    {formatExpiry(expiresAt)}
                  </dd>
                </>
              ) : null}
            </dl>

            {message ? (
              <div className="rounded-2xl border border-border p-4">
                <span className="text-label text-ink-3">THEIR MESSAGE</span>
                <p className="mt-2 max-w-prose text-base text-ink-2">{message}</p>
              </div>
            ) : null}
          </>
        )}
      </SheetBody>
    </Sheet>
  );
}
