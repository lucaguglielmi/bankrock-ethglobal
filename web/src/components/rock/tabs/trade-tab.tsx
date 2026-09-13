"use client";

/**
 * The Trade tab of the rock dashboard.
 *
 * One of five honest states, checked in this order:
 *
 *   1. the strategy is still being read for the first time  → "Reading this rock…"
 *   2. the rock has no account                              → nothing to trade against
 *   3. the strategy could not be read                       → that reason, verbatim
 *   4. nothing is shipped                                   → "not trading yet" (+ owner's way in)
 *   5. one or more live streams                             → `TradePanel`
 *
 * Nothing here invents a number: the panel gets its quotes from `/api/rocks/[id]/quote` and its
 * receipt from the real swap. Case 3 is kept apart from case 4 on purpose - a rate-limited RPC or
 * a missing address must never read as "this rock is idle" (D-013).
 */

import { ArrowRightLeft, Loader2 } from "lucide-react";
import type { Address } from "viem";
import type { Capability } from "@/lib/demo";
import type { StrategyView } from "@/hooks/useAquaStrategy";
import { Button } from "@/components/ui/button";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { NO_MAKER_REASON, TradePanel } from "@/components/rock/trade-panel";

export interface TradeTabProps {
  rockId: string;
  /** The rock's account - the maker the quote and the swap are aimed at. */
  maker?: Address;
  /** The Aqua position, read once by the page. Live streams are `strategy.value.streams`. */
  strategy: Capability<StrategyView>;
  isStrategyLoading: boolean;
  isOwner: boolean;
  authenticated: boolean;
  /** Opens the onboarding sheet. */
  onRequestSignIn: () => void;
  /** Called once a swap has really executed. */
  onTradeSuccess: () => void;
  /** Switches the dashboard to the Liquidity tab (e.g. "not trading yet - start it there"). */
  onGoToLiquidity: () => void;
  /**
   * Pins the stream to trade against and hides the "Trade against" picker. Optional - by default
   * the visitor may choose among the live streams, starting from the lowest fee.
   */
  streamIndex?: number;
}

/**
 * `readRockStreams` answers UNAVAILABLE with this wording when a rock has nothing shipped. It is
 * the one UNAVAILABLE reason that means "idle" rather than "broken"; every other reason is shown
 * as it arrived.
 */
const NOTHING_SHIPPED = /no live Aqua strategy/i;

export function TradeTab({
  rockId,
  maker,
  strategy,
  isStrategyLoading,
  isOwner,
  authenticated,
  onRequestSignIn,
  onTradeSuccess,
  onGoToLiquidity,
  streamIndex,
}: TradeTabProps) {
  const streams = strategy.state === "UNAVAILABLE" ? [] : strategy.value.streams;

  if (streams.length === 0 && isStrategyLoading) {
    return (
      <p
        role="status"
        className="flex items-center justify-center gap-2 px-4 py-10 text-base text-ink-3"
      >
        <Loader2 aria-hidden className="size-5 motion-safe:animate-spin" />
        Reading this rock…
      </p>
    );
  }

  if (!maker) {
    return <UnavailableState reason={NO_MAKER_REASON} />;
  }

  if (strategy.state === "UNAVAILABLE" && !NOTHING_SHIPPED.test(strategy.reason)) {
    return <UnavailableState reason={strategy.reason} />;
  }

  if (streams.length === 0) {
    return (
      <section className="flex flex-col items-center gap-4 rounded-3xl border border-border px-4 py-12 text-center">
        <ArrowRightLeft aria-hidden className="size-8 text-ink-4" />
        <div className="flex flex-col gap-1">
          <p className="max-w-prose text-base text-ink-2">This rock is not trading yet.</p>
          {isOwner ? null : (
            <p className="max-w-prose text-sm text-ink-3">Only its owner can start it.</p>
          )}
        </div>
        {isOwner ? (
          <Button type="button" size="default" onClick={onGoToLiquidity}>
            Start earning
          </Button>
        ) : null}
      </section>
    );
  }

  return (
    <TradePanel
      rockId={rockId}
      maker={maker}
      streams={streams}
      streamIndex={streamIndex}
      authenticated={authenticated}
      onRequestSignIn={onRequestSignIn}
      onTradeSuccess={onTradeSuccess}
    />
  );
}
