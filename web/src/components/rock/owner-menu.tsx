"use client";

/**
 * Owner-only extras, behind one 44 px overflow button (spec 17 §4.5).
 *
 * These are rare, consequential actions; they stay out of the main column so the things a
 * visitor came to do — trade, or receive the rock — are the only large buttons on the page.
 * Retiring asks for a confirmation that states exactly what it costs.
 *
 * Stopping a strategy is not here any more: it belongs next to the strategy it stops, on the
 * Liquidity tab. Changing ownership is the primary action of the Ownership tab.
 */

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Sheet, SheetBody } from "@/components/ui/sheet";
import { useRockActions } from "@/hooks/useBankRock";
import type { Capability } from "@/lib/demo";
import {
  ActionOutcomeNotice,
  outcomeFrom,
  type ActionOutcome,
} from "@/components/rock/action-result";

export interface OwnerMenuProps {
  rockId: string;
  /**
   * Whether this wallet may send owner actions from the rock's account, from `useRockAccount`
   * (D-037). Every button here is a UserOperation from that account, so when it is UNAVAILABLE
   * they are disabled and its reason is shown instead — the alternative is a sheet full of
   * buttons whose transactions revert.
   */
  ownerActions: Capability<string>;
  handoverPending: boolean;
  lost: boolean;
  onChanged: () => void;
}

export function OwnerMenu({
  rockId,
  ownerActions,
  handoverPending,
  lost,
  onChanged,
}: OwnerMenuProps) {
  const { cancelHandover, archiveRock, markLost, clearLost, isPending } = useRockActions();
  const [isMenuOpen, setMenuOpen] = useState(false);
  const [isRetireOpen, setRetireOpen] = useState(false);
  const [outcome, setOutcome] = useState<ActionOutcome | null>(null);

  const blockedReason = ownerActions.state === "UNAVAILABLE" ? ownerActions.reason : null;
  const blocked = blockedReason !== null;

  const runCancel = async () => {
    const result = outcomeFrom(await cancelHandover(rockId));
    setOutcome(result);
    if (result.kind !== "error") onChanged();
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
          {blockedReason ? (
            <p role="status" className="max-w-prose text-base text-ink-2">
              {blockedReason}
            </p>
          ) : null}

          {handoverPending ? (
            <Button
              variant="outline"
              className="w-full"
              onClick={runCancel}
              disabled={isPending || blocked}
            >
              Cancel handover
            </Button>
          ) : null}

          <Button
            variant="outline"
            className="w-full"
            disabled={blocked}
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
              disabled={isPending || blocked}
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
