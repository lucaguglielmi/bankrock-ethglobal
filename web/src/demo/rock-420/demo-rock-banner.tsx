"use client";

/**
 * The line at the top of rock #420's page that says what it is, with the one control the demo
 * needs: "Reset demo". Never fixed, never dismissible; it sits in the page's own flow above the
 * identity row, so a screenshot of the demo carries it.
 *
 * Reset is confirmed in a `Sheet` - the only overlay primitive - because a mis-tap on stage would
 * throw away the state the presenter has just built up.
 */

import { useState } from "react";
import { FlaskConical, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody } from "@/components/ui/sheet";
import { SimulatedBadge } from "@/components/ui/simulated-badge";

export function DemoRockBanner({ onReset }: { onReset: () => void }) {
  const [isConfirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <div
        role="status"
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-warning-bg px-4 py-3"
      >
        <p className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-ink">
          <SimulatedBadge />
          <span>
            Demo rock. Everything here is pretend and lives in this browser - nothing is on chain.
          </span>
        </p>
        <Button
          type="button"
          variant="outline"
          size="default"
          className="h-11 shrink-0"
          onClick={() => setConfirmOpen(true)}
        >
          <RotateCcw aria-hidden />
          Reset demo
        </Button>
      </div>

      <Sheet
        open={isConfirmOpen}
        onOpenChange={setConfirmOpen}
        title="Reset the demo?"
        description="Rock #420 goes back to where it started."
        headerAccessory={<SimulatedBadge />}
        footer={
          <div className="flex flex-col gap-3 sm:flex-row-reverse">
            <Button
              type="button"
              size="lg"
              className="w-full sm:flex-1"
              onClick={() => {
                onReset();
                setConfirmOpen(false);
              }}
            >
              Reset demo
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="w-full sm:flex-1"
              onClick={() => setConfirmOpen(false)}
            >
              Keep going
            </Button>
          </div>
        }
      >
        <SheetBody className="flex flex-col gap-3">
          <p className="max-w-prose text-base text-ink-2">
            25,000 USDC and 12.5 WETH held, the Wide and Tight streams live, the seeded history -
            and everything you have done since is forgotten.
          </p>
          <p className="max-w-prose text-sm text-ink-3">
            Only this browser is affected. There was never anything on chain to undo.
          </p>
        </SheetBody>
      </Sheet>
    </>
  );
}

/** Where the attestation line would be: the demo has no tap to verify, and says so quietly. */
export function DemoRockLine() {
  return (
    <p className="flex items-center gap-2 text-sm text-ink-3">
      <FlaskConical aria-hidden className="size-4 shrink-0" />
      Demo rock - no tap to verify, nothing on chain
    </p>
  );
}
