"use client";

/**
 * The headline reserve — the first figure on an awake rock (spec 17 Part 5).
 *
 * Both balances come from the chain read. When that read is unavailable there is no number at
 * all, only the reason: a zero would read as "we measured zero", which is a different claim.
 *
 * Under it, when a strategy is live, one caption says how much of that reserve a visitor can
 * actually trade against right now — `executable`, which is `min(virtual, held, allowance)`
 * (`contracts/aqua/NOTES.md` §7). With more than one stream there is no single figure to give,
 * because two streams' allowances may sum to more than the rock holds and that sum is not
 * capital; the caption points at the per-stream breakdown instead.
 */

import { Amount } from "@/components/ui/amount";
import { SimulatedBadge } from "@/components/ui/simulated-badge";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { formatAmount } from "@/lib/ui/format";
import { tokens } from "@/lib/chain";
import type { Capability } from "@/lib/demo";
import type { StrategyView } from "@/hooks/useAquaStrategy";

export interface Reserves {
  usdc: bigint;
  weth: bigint;
}

export function ReserveHeadline({
  reserves,
  strategy,
  isLoading = false,
}: {
  reserves: Capability<Reserves>;
  /** The Aqua position, when the page has read one. */
  strategy?: Capability<StrategyView>;
  /** The first read is still in flight, so "unavailable" would be premature. */
  isLoading?: boolean;
}) {
  if (reserves.state === "UNAVAILABLE") {
    return (
      <section className="flex flex-col gap-2">
        <h2 className="text-label text-ink-3">Reserve</h2>
        {isLoading ? (
          <p className="text-base text-ink-3">Reading the reserve…</p>
        ) : (
          <UnavailableState reason={reserves.reason} />
        )}
      </section>
    );
  }

  const streams = strategy && strategy.state !== "UNAVAILABLE" ? strategy.value.streams : [];
  const onlyStream = streams.length === 1 ? streams[0] : null;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-label text-ink-3">Reserve</h2>
        {reserves.state === "DEMO" ? <SimulatedBadge /> : null}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <Amount
          size="lg"
          value={reserves.value.usdc}
          decimals={tokens.USDC.decimals}
          symbol="USDC"
        />
        <Amount
          size="lg"
          value={reserves.value.weth}
          decimals={tokens.WETH.decimals}
          symbol="WETH"
        />
      </div>

      {onlyStream ? (
        <p className="max-w-prose text-caption text-ink-3">
          of which available to trade:{" "}
          {formatAmount(onlyStream.executable.usdc, {
            decimals: tokens.USDC.decimals,
            maxFractionDigits: 2,
          })}{" "}
          USDC and{" "}
          {formatAmount(onlyStream.executable.weth, {
            decimals: tokens.WETH.decimals,
            maxFractionDigits: 4,
          })}{" "}
          WETH
        </p>
      ) : streams.length > 1 ? (
        <p className="max-w-prose text-caption text-ink-3">
          of which available to trade: shown per stream below — the streams share this one reserve
          and their allowances are not added together.
        </p>
      ) : (
        <p className="max-w-prose text-caption text-ink-3">
          What this rock holds right now. Trading with it moves these two balances.
        </p>
      )}
    </section>
  );
}
