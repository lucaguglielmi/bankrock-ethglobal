"use client";

/**
 * Owner-only extras, behind one 44 px overflow button (spec 17 §4.5).
 *
 * These are rare, consequential actions; they stay out of the main column so the two things a
 * visitor came to do — trade, or receive the rock — are the only large buttons on the page.
 * Retiring asks for a confirmation that states exactly what it costs.
 */

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Sheet, SheetBody } from "@/components/ui/sheet";
import { useRockActions } from "@/hooks/useBankRock";
import {
  ActionOutcomeNotice,
  outcomeFrom,
  type ActionOutcome,
} from "@/components/rock/action-result";

export interface OwnerMenuProps {
  rockId: string;
  handoverPending: boolean;
  lost: boolean;
  /** A live stream the owner can stop. Absent when the rock is not trading. */
  streamIndex?: number;
  onChanged: () => void;
}

export function OwnerMenu({
  rockId,
  handoverPending,
  lost,
  streamIndex,
  onChanged,
}: OwnerMenuProps) {
  const { cancelHandover, archiveRock, markLost, clearLost, dockStrategy, isPending } =
    useRockActions();
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [isRetireOpen, setRetireOpen] = useState(false);
  const [isCashInOpen, setCashInOpen] = useState(false);
  const [outcome, setOutcome] = useState<ActionOutcome | null>(null);

  const runCancel = async () => {
    const result = outcomeFrom(await cancelHandover(rockId));
    setOutcome(result);
    if (result.kind !== "error") onChanged();
  };

  const runCashIn = async () => {
    if (streamIndex === undefined) return;
    const result = outcomeFrom(await dockStrategy(rockId, streamIndex));
    setOutcome(result);
    if (result.kind !== "error") {
      setCashInOpen(false);
      onChanged();
    }
  };

  const runLostFlag = async () => {
    const result = outcomeFrom(await (lost ? clearLost(rockId) : markLost(rockId)));
    setOutcome(result);
    if (result.kind !== "error") onChanged();
  };

  const runRetire = async () => {
    const result = outcomeFrom(await archiveRock(rockId));
    setOutcome(result);
    if (result.kind !== "error") {
      setRetireOpen(false);
      onChanged();
    }
  };

  return (
    <>
      <IconButton
        aria-label="More actions for this rock"
        variant="outline"
        onClick={() => setMenuOpen(true)}
      >
        <MoreHorizontal />
      </IconButton>

      <Sheet
        open={isMenuOpen}
        onOpenChange={setMenuOpen}
        title="Owner actions"
        description="Only you can see these."
      >
        <SheetBody className="flex flex-col gap-4">
          {handoverPending ? (
            <Button variant="outline" className="w-full" onClick={runCancel} disabled={isPending}>
              Cancel handover
            </Button>
          ) : null}

          {streamIndex !== undefined ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setMenuOpen(false);
                setOutcome(null);
                setCashInOpen(true);
              }}
            >
              Cash in
            </Button>
          ) : null}

          <Button
            variant="outline"
            className="w-full"
            onClick={() => {
              setMenuOpen(false);
              setOutcome(null);
              setRetireOpen(true);
            }}
          >
            Retire this rock
          </Button>

          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              className="w-full"
              onClick={runLostFlag}
              disabled={isPending}
            >
              {lost ? "Clear the lost mark" : "Mark tag as lost"}
            </Button>
            <p className="max-w-prose text-sm text-ink-3">
              Warns people who tap it. It does not freeze funds.
            </p>
          </div>

          <ActionOutcomeNotice outcome={outcome} successLabel="Done" />
        </SheetBody>
      </Sheet>

      <Sheet
        open={isCashInOpen}
        onOpenChange={setCashInOpen}
        title="Cash in?"
        footer={
          <div className="flex flex-col gap-3 sm:flex-row-reverse">
            <Button
              size="lg"
              className="w-full sm:flex-1"
              onClick={runCashIn}
              disabled={isPending}
            >
              Cash in
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full sm:flex-1"
              onClick={() => setCashInOpen(false)}
            >
              Keep trading
            </Button>
          </div>
        }
      >
        <SheetBody className="flex flex-col gap-3">
          <p className="max-w-prose text-base text-ink-2">
            Stops trading on this stream. Your tokens never left your account.
          </p>
          <p className="max-w-prose text-sm text-ink-3">
            The fees earned so far are already part of the rock&rsquo;s balance. You can start
            earning again at any time, with any fee tier.
          </p>
          <ActionOutcomeNotice outcome={outcome} successLabel="This stream has stopped" />
        </SheetBody>
      </Sheet>

      <Sheet
        open={isRetireOpen}
        onOpenChange={setRetireOpen}
        title="Retire this rock?"
        footer={
          <div className="flex flex-col gap-3 sm:flex-row-reverse">
            <Button
              size="lg"
              className="w-full sm:flex-1"
              onClick={runRetire}
              disabled={isPending}
            >
              Retire this rock
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full sm:flex-1"
              onClick={() => setRetireOpen(false)}
            >
              Keep it
            </Button>
          </div>
        }
      >
        <SheetBody className="flex flex-col gap-3">
          <p className="max-w-prose text-base text-ink-2">
            Retiring ends this rock&rsquo;s life in the app. Its history stays here and stays
            readable by anyone.
          </p>
          <p className="max-w-prose text-base text-ink-2">
            The tag can then awaken a new rock, which starts with its own empty history.
          </p>
          <ActionOutcomeNotice outcome={outcome} successLabel="This rock is retired" />
        </SheetBody>
      </Sheet>
    </>
  );
}
