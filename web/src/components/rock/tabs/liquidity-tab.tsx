"use client";

/**
 * The Liquidity tab — the tab open on page load (spec 17 Part 5; spec 04; NOTES.md §4, §6, §7).
 *
 * A small state machine over two reads, `reserves` and `strategy`:
 *
 *   reading      neither has arrived: one quiet line, never a reason;
 *   unavailable  the reserve read failed: its reason, and a way to try again;
 *   waiting      the rock holds no USDC yet: "Waiting for funds" and one button — Add funds. The
 *                reserve poll refetches every 15 seconds, so this flips by itself;
 *   funded       the headline reserve, then either the strategy picker (owner) or one sentence
 *                (visitor), because nothing is trading yet;
 *   live         the headline reserve, one card per live stream, a way to the Trade tab, and for
 *                the owner a quiet Stop per stream and, while presets remain, an "Add another
 *                strategy" row of compact cards, each opening the ship sheet on that preset.
 *
 * Nothing on the tab is an address. Addresses appear only inside the sheets a person opens.
 *
 * The copy stays literal to what Aqua does: shipping moves no tokens, docking is the withdrawal,
 * fees sit in the rock's own balance, and two streams' allowances are never added together.
 */

import { useState, type ReactNode } from "react";
import { Globe, RefreshCw, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { SimulatedBadge } from "@/components/ui/simulated-badge";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { FundingWait } from "@/components/rock/funding-wait";
import { FundRockSheet } from "@/components/rock/fund-rock-sheet";
import { ReserveHeadline, type Reserves } from "@/components/rock/reserve-headline";
import { SHIP_OPTIONS, unshippedOptions, type ShipOption } from "@/components/rock/ship-options";
import { ShipStrategySheet } from "@/components/rock/ship-strategy-sheet";
import { StopStrategySheet } from "@/components/rock/stop-strategy-sheet";
import { StrategyPicker } from "@/components/rock/strategy-picker";
import { StreamCard, streamName } from "@/components/rock/stream-card";
import type { ParsedStream, StrategyView } from "@/hooks/useAquaStrategy";
import { isDemoMode, type Capability } from "@/lib/demo";
import { cn } from "@/lib/ui/cn";

const ZERO = BigInt(0);

export interface LiquidityTabProps {
  rockId: string;
  /** The Rock Account from the registry. Absent while the rock has none. */
  smartAccount?: string;
  reserves: Capability<Reserves>;
  strategy: Capability<StrategyView>;
  isStrategyLoading: boolean;
  /** The page's own reads are refetching. */
  isRefreshing: boolean;
  isOwner: boolean;
  /** Whether this wallet may act from the rock's account (D-037). UNAVAILABLE carries the reason. */
  ownerActions?: Capability<string>;
  onRefresh: () => void;
  /** Switches the dashboard to the Trade tab. Unused since the Trade tab is one tap away. */
  onGoToTrade?: () => void;
  /** Opens the simulated bridge sheet. Only reachable under `NEXT_PUBLIC_DEMO_MODE=true`. */
  onCrossChain?: () => void;
  /**
   * Opens the page's own "Add funds" sheet (the header CTA and the owner menu share it). When
   * absent the tab mounts its own copy of the sheet.
   */
  onAddFunds?: () => void;
}

/** What the ship sheet opens on: a picked option, or nothing (the sheet then offers the rest). */
interface ShipRequest {
  option?: ShipOption;
}

export function LiquidityTab({
  rockId,
  smartAccount,
  reserves,
  strategy,
  isStrategyLoading,
  isRefreshing,
  isOwner,
  ownerActions,
  onRefresh,
  onCrossChain,
  onAddFunds,
}: LiquidityTabProps) {
  const [isFundOpen, setFundOpen] = useState(false);
  const [shipRequest, setShipRequest] = useState<ShipRequest | null>(null);
  const [stopping, setStopping] = useState<ParsedStream | null>(null);

  const ownerBlockedReason =
    ownerActions && ownerActions.state === "UNAVAILABLE" ? ownerActions.reason : null;
  const streams = strategy.state === "UNAVAILABLE" ? [] : strategy.value.streams;
  // A docked stream can never be revived (NOTES §4), so stopped indexes are used up too.
  const stopped = strategy.state === "UNAVAILABLE" ? [] : strategy.value.stopped;
  const usedIndexes = [...streams.map((stream) => stream.streamIndex), ...stopped];
  const remaining = unshippedOptions(usedIndexes);
  const stoppedNames = stopped.map(
    (index) =>
      SHIP_OPTIONS.find((option) => option.streamIndex === Number(index))?.label ??
      `Stream ${Number(index) + 1}`,
  );
  const crossChain = isDemoMode() ? onCrossChain : undefined;
  const openFund = onAddFunds ?? (() => setFundOpen(true));

  const fundSheet = onAddFunds ? null : (
    <FundRockSheet
      open={isFundOpen}
      onOpenChange={setFundOpen}
      rockId={rockId}
      smartAccount={smartAccount}
      reserves={reserves}
    />
  );

  // 1. Reading ------------------------------------------------------------------
  if (reserves.state === "UNAVAILABLE" && isRefreshing) {
    return <p className="text-base text-ink-3">Reading this rock…</p>;
  }

  // 2. The reserve could not be read ----------------------------------------------
  if (reserves.state === "UNAVAILABLE") {
    return (
      <UnavailableState
        reason={reserves.reason}
        action={{ label: "Try again", onClick: onRefresh }}
      />
    );
  }

  // 3. No funds yet ---------------------------------------------------------------
  if (reserves.value.usdc === ZERO) {
    return (
      <>
        <FundingWait onAddFunds={openFund} onCrossChain={crossChain} />
        {fundSheet}
      </>
    );
  }

  // 4 & 5. Funded, with or without a live strategy --------------------------------
  const hasWeth = reserves.value.weth > ZERO;
  const isLive = streams.length > 0;
  const stillReading = isStrategyLoading && !isLive;

  let earning: ReactNode;
  if (stillReading) {
    earning = <p className="text-base text-ink-3">Reading this rock…</p>;
  } else if (strategy.state === "UNAVAILABLE") {
    earning = <UnavailableState reason={strategy.reason} />;
  } else if (!isLive) {
    earning = isOwner ? (
      hasWeth ? (
        remaining.length > 0 ? (
          <div className="flex flex-col gap-4">
            <p className="max-w-prose text-base text-ink-2">
              Pick a fee. The rock keeps its tokens; Aqua only tracks how much of them may be
              traded.
            </p>
            <StrategyPicker
              options={remaining}
              disabledReason={ownerBlockedReason}
              onPick={(option) => setShipRequest({ option })}
            />
            <StoppedLine names={stoppedNames} />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="max-w-prose text-base text-ink-2">
              This rock has used every strategy it can run, and a stopped stream cannot be
              restarted.
            </p>
            <StoppedLine names={stoppedNames} />
          </div>
        )
      ) : (
        <div className="flex flex-col gap-4">
          <p className="max-w-prose text-base text-ink-2">
            A strategy needs both USDC and WETH, and this rock holds no WETH yet.
          </p>
          <Button size="lg" className="w-full" onClick={openFund}>
            Add funds
          </Button>
        </div>
      )
    ) : (
      <div className="flex flex-col gap-4">
        <p className="max-w-prose text-base text-ink-2">
          This rock holds funds but is not trading yet. Only its owner can start it.
        </p>
        <Button variant="outline" className="w-full" onClick={openFund}>
          Add funds
        </Button>
      </div>
    );
  } else {
    earning = (
      <div className="flex flex-col gap-4">
        {streams.map((stream) => (
          <StreamCard
            key={stream.strategyHash}
            stream={stream}
            action={
              isOwner ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={ownerBlockedReason !== null}
                  onClick={() => setStopping(stream)}
                >
                  Stop
                </Button>
              ) : undefined
            }
          />
        ))}
        {isOwner && ownerBlockedReason ? (
          <p role="status" className="max-w-prose text-sm text-ink-3">
            {ownerBlockedReason}
          </p>
        ) : null}
        <StoppedLine names={stoppedNames} />

        {isOwner && remaining.length > 0 ? (
          <section className="flex flex-col gap-3 pt-2">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-h3 font-semibold text-ink">Add another strategy</h3>
              <p className="text-sm text-ink-2">Same reserve, another price.</p>
            </div>
            <StrategyPicker
              compact
              layout="grid"
              options={remaining}
              disabled={ownerBlockedReason !== null}
              onPick={(option) => setShipRequest({ option })}
              trailing={<AddFundsCard onClick={openFund} />}
            />
          </section>
        ) : (
          <AddFundsCard onClick={openFund} />
        )}
      </div>
    );
  }

  const pickerShown =
    !stillReading &&
    strategy.state !== "UNAVAILABLE" &&
    !isLive &&
    isOwner &&
    hasWeth &&
    remaining.length > 0;
  // The body already carries its own "Add funds" when the owner lacks WETH or a visitor finds
  // nothing trading; every other state gets it once, quietly, at the bottom.
  const bodyHasAddFunds =
    !stillReading && strategy.state !== "UNAVAILABLE" && (isLive || !isOwner || !hasWeth);
  const showSecondary = !bodyHasAddFunds || crossChain !== undefined;

  return (
    <div className="flex flex-col gap-10">
      <ReserveHeadline reserves={reserves} strategy={strategy} />

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-h3 font-semibold text-ink">
            {pickerShown ? "Choose how this rock earns" : "Earning"}
          </h2>
          <IconButton
            aria-label="Sync"
            variant="ghost"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={isRefreshing ? "motion-safe:animate-spin" : undefined} />
          </IconButton>
        </div>
        {earning}
      </section>

      {showSecondary ? (
        <div className="flex flex-col gap-3 border-t border-border pt-6">
          {bodyHasAddFunds ? null : (
            <Button variant="outline" className="w-full" onClick={openFund}>
              Add funds
            </Button>
          )}
          {crossChain ? (
            <Button
              variant="outline"
              className="h-auto min-h-12 w-full flex-wrap justify-between gap-3 py-3 text-left"
              onClick={crossChain}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Globe aria-hidden />
                Add funds from another chain
              </span>
              <SimulatedBadge />
            </Button>
          ) : null}
        </div>
      ) : null}

      {fundSheet}

      <ShipStrategySheet
        open={shipRequest !== null}
        onOpenChange={(next) => {
          if (!next) setShipRequest(null);
        }}
        rockId={rockId}
        reserves={reserves}
        option={shipRequest?.option}
        excludeStreamIndexes={usedIndexes}
        onShipped={onRefresh}
      />

      <StopStrategySheet
        open={stopping !== null}
        onOpenChange={(next) => {
          if (!next) setStopping(null);
        }}
        rockId={rockId}
        streamIndex={stopping ? Number(stopping.streamIndex) : undefined}
        streamLabel={stopping ? streamName(stopping) : undefined}
        onStopped={onRefresh}
      />
    </div>
  );
}

/**
 * Stopped streams, if any, as one quiet line — never a card with numbers, because a docked stream
 * has no allowance left and can never be revived (`docs/dashboard-strategies.md`).
 */
function StoppedLine({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  return (
    <p className="max-w-prose text-caption text-ink-3">
      Stopped: {names.join(", ")}. A stopped stream cannot be restarted.
    </p>
  );
}

/**
 * "Add funds" as a card, so it can sit in the same row as the strategies on desktop and stack
 * under them on a phone. Funding needs no owner authority, so it is never disabled.
 */
function AddFundsCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-full min-h-16 w-full items-center gap-3 rounded-2xl border border-dashed border-ink-4 bg-background px-4 py-3 text-left text-ink",
        "motion-safe:transition-colors hover:bg-muted",
        "sm:flex-col sm:items-start sm:gap-4 sm:p-5",
      )}
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-ink sm:size-14">
        <Wallet aria-hidden className="size-5 sm:size-6" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:w-full">
        <span className="text-base font-semibold text-ink">Add funds</span>
        <span className="text-sm text-ink-2">Top up the reserve every strategy draws on.</span>
      </span>
    </button>
  );
}
