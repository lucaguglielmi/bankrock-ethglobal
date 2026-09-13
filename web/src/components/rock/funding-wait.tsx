"use client";

/**
 * "Waiting for funds" — the Liquidity tab before the first USDC lands.
 *
 * A freshly awakened rock holds nothing, and Sepolia faucets take minutes. There is no figure to
 * show yet and no strategy to choose, so this state says exactly that and nothing more. It has no
 * timer of its own: the page's reserve read already refetches every 15 seconds, and the tab flips
 * on its own the moment `usdc > 0`.
 *
 * The one thing a person can do here is add funds, so that is the one large button.
 */

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface FundingWaitProps {
  onAddFunds: () => void;
}

export function FundingWait({ onAddFunds }: FundingWaitProps) {
  return (
    <section className="flex flex-col items-center gap-8 py-8 text-center">
      <div className="flex flex-col items-center gap-4" aria-live="polite">
        <Loader2 aria-hidden className="size-8 text-ink-4 motion-safe:animate-spin" />
        <h2 className="text-h2 font-bold text-ink">Waiting for funds</h2>
        <p className="max-w-prose text-base text-ink-2">
          Nothing shows here until the first USDC lands in this rock&rsquo;s account.
        </p>
        <p className="max-w-prose text-sm text-ink-3">
          Faucets can take a few minutes. This page checks every 15 seconds and updates by itself.
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-3">
        <Button size="lg" className="w-full" onClick={onAddFunds}>
          Add funds
        </Button>
      </div>
    </section>
  );
}
