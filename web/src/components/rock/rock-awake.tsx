"use client";

/**
 * An awake rock, in the order spec 17 Part 5 requires on a phone:
 *
 *   identity → attestation → headline reserve → Trade / Give → cross-chain → position →
 *   alerts → social → provenance
 *
 * Identity and attestation are rendered by the page above this component, so the primary action
 * stays inside the first 640 px at 360 px wide (L-13).
 *
 * "Trade with this rock" is disabled while no strategy is live: with nothing shipped there is
 * nothing to trade against, and a button that opens a sheet only to explain that would be worse
 * than one that says so where it stands.
 */

import { Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SimulatedBadge } from "@/components/ui/simulated-badge";
import { AquaPositionCard } from "@/components/aqua-position-card";
import { RockAlerts } from "@/components/rock-alerts";
import { RockActivity } from "@/components/rock-activity";
import { SocialBridge } from "@/components/social-bridge";
import { ReserveHeadline, type Reserves } from "@/components/rock/reserve-headline";
import type { StrategyView } from "@/hooks/useAquaStrategy";
import type { Capability } from "@/lib/demo";

export interface AwakeRockProps {
  rockId: string;
  smartAccount?: string;
  reserves: Capability<Reserves>;
  /** The Aqua position, read once by the page and shared by every card below. */
  strategy: Capability<StrategyView>;
  isStrategyLoading?: boolean;
  isOwner: boolean;
  onTrade: () => void;
  onGive: () => void;
  onCrossChain: () => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export function AwakeRock({
  rockId,
  smartAccount,
  reserves,
  strategy,
  isStrategyLoading = false,
  isOwner,
  onTrade,
  onGive,
  onCrossChain,
  onRefresh,
  isRefreshing = false,
}: AwakeRockProps) {
  const isTrading = strategy.state !== "UNAVAILABLE" && strategy.value.streams.length > 0;
  const canTrade = isTrading || isStrategyLoading;

  return (
    <>
      <ReserveHeadline
        reserves={reserves}
        strategy={strategy}
        isLoading={isRefreshing}
      />

      <div className="flex flex-col gap-2">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button size="lg" className="w-full sm:flex-1" onClick={onTrade} disabled={!canTrade}>
            Trade with this rock
          </Button>
          {isOwner ? (
            <Button size="lg" variant="outline" className="w-full sm:flex-1" onClick={onGive}>
              Give this rock
            </Button>
          ) : null}
        </div>
        {!canTrade ? <p className="text-sm text-ink-3">Not trading yet</p> : null}
      </div>

      <Button
        variant="outline"
        className="h-auto w-full flex-wrap justify-between gap-3 py-3 text-left"
        onClick={onCrossChain}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Globe aria-hidden />
          Add funds from another chain
        </span>
        <SimulatedBadge />
      </Button>

      <AquaPositionCard
        rockId={rockId}
        smartAccount={smartAccount}
        reserves={reserves}
        strategy={strategy}
        isStrategyLoading={isStrategyLoading}
        isOwner={isOwner}
        onSync={onRefresh}
        isSyncing={isRefreshing}
      />

      <RockAlerts rockId={rockId} />

      <SocialBridge rockId={rockId} />

      <RockActivity rockId={rockId} />
    </>
  );
}
