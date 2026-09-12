"use client";

/**
 * An awake rock, in the order spec 17 Part 5 requires on a phone:
 *
 *   identity → attestation → headline reserve → Trade / Give → position →
 *   savings (owner only) → alerts → social → provenance
 *
 * The simulated "Add funds from another chain" entry that used to sit between the buttons and the
 * position is gone (DEMO-STATE S-1, retired by spec 20 D-035): money from another chain now
 * arrives for real, through a Privy universal deposit address on the owner's savings card.
 *
 * Identity and attestation are rendered by the page above this component, so the primary action
 * stays inside the first 640 px at 360 px wide (L-13).
 *
 * "Trade with this rock" is disabled while no strategy is live: with nothing shipped there is
 * nothing to trade against, and a button that opens a sheet only to explain that would be worse
 * than one that says so where it stands.
 */

import { Button } from "@/components/ui/button";
import { AquaPositionCard } from "@/components/aqua-position-card";
import { SavingsCard } from "@/components/earn/savings-card";
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

      {isOwner ? <SavingsCard context="rock" /> : null}

      <RockAlerts rockId={rockId} />

      <SocialBridge rockId={rockId} />

      <RockActivity rockId={rockId} />
    </>
  );
}
