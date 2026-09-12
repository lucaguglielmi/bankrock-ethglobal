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
 *
 * **Funding** is "Fund this rock", which opens a REAL surface: the Rock Account, its balances, the
 * two token contracts and the explorer link. It used to be "Add funds from another chain", which
 * opened the bridge sheet — and with demo mode off that sheet says only that no bridge exists, so
 * the one fund-shaped control on an awake rock was a dead end. The bridge sheet is now offered
 * only under `NEXT_PUBLIC_DEMO_MODE=true`, where it is a badged DEMO beat (DEMO-STATE S-1).
 */

import { useState } from "react";
import { Globe, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SimulatedBadge } from "@/components/ui/simulated-badge";
import { FundRockSheet } from "@/components/rock/fund-rock-sheet";
import { isDemoMode } from "@/lib/demo";
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
  /**
   * Whether this wallet may act from the rock's account (D-037, `useRockAccount`). "Give this
   * rock" and "Start earning" are both UserOperations from it, so an UNAVAILABLE answer disables
   * them and is shown as the reason — never as a missing button with no explanation.
   */
  ownerActions?: Capability<string>;
  onTrade: () => void;
  onGive: () => void;
  /** Opens the simulated bridge sheet. Only reachable under `NEXT_PUBLIC_DEMO_MODE=true`. */
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
  ownerActions,
  onTrade,
  onGive,
  onCrossChain,
  onRefresh,
  isRefreshing = false,
}: AwakeRockProps) {
  const [isFundOpen, setFundOpen] = useState(false);
  const isTrading = strategy.state !== "UNAVAILABLE" && strategy.value.streams.length > 0;
  const canTrade = isTrading || isStrategyLoading;
  const ownerBlockedReason =
    ownerActions && ownerActions.state === "UNAVAILABLE" ? ownerActions.reason : null;

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
            <Button
              size="lg"
              variant="outline"
              className="w-full sm:flex-1"
              onClick={onGive}
              disabled={ownerBlockedReason !== null}
            >
              Give this rock
            </Button>
          ) : null}
        </div>
        {!canTrade ? <p className="text-sm text-ink-3">Not trading yet</p> : null}
        {isOwner && ownerBlockedReason ? (
          <p className="max-w-prose text-sm text-ink-3">{ownerBlockedReason}</p>
        ) : null}
      </div>

      <Button
        variant="outline"
        className="h-auto w-full flex-wrap justify-between gap-3 py-3 text-left"
        onClick={() => setFundOpen(true)}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Wallet aria-hidden />
          Fund this rock
        </span>
        <span className="text-sm text-ink-3">Send USDC or WETH</span>
      </Button>

      {isDemoMode() ? (
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
      ) : null}

      <FundRockSheet
        open={isFundOpen}
        onOpenChange={setFundOpen}
        rockId={rockId}
        smartAccount={smartAccount}
        reserves={reserves}
      />

      <AquaPositionCard
        rockId={rockId}
        smartAccount={smartAccount}
        reserves={reserves}
        strategy={strategy}
        isStrategyLoading={isStrategyLoading}
        isOwner={isOwner}
        ownerActions={ownerActions}
        onSync={onRefresh}
        isSyncing={isRefreshing}
      />

      <RockAlerts rockId={rockId} />

      <SocialBridge rockId={rockId} />

      <RockActivity rockId={rockId} />
    </>
  );
}
