"use client";

/**
 * The headline reserve — the first figure on an awake rock (spec 17 Part 5), as one calm card.
 *
 * Both balances come from the chain read. When that read is unavailable there is no number at
 * all, only the reason: a zero would read as "we measured zero", which is a different claim.
 *
 * Under it, when a strategy is live, one caption says how much of that reserve a visitor can
 * actually trade against right now — `executable`, which is `min(virtual, held, allowance)`
 * (`contracts/aqua/NOTES.md` §7). With more than one stream there is no single figure to give,
 * because two streams' allowances may sum to more than the rock holds and that sum is not
 * capital; the caption points at the per-stream breakdown instead.
 *
 * The rock-and-ripples drawing behind the figures is decoration: absolutely placed, hidden from
 * assistive tech, and never in the text column's way on a phone.
 */

import { Amount } from "@/components/ui/amount";
import { SimulatedBadge } from "@/components/ui/simulated-badge";
import { TokenIcon } from "@/components/ui/token-icon";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { ReserveArt } from "@/components/rock/strategy-art";
import { formatAmount } from "@/lib/ui/format";
import { tokens } from "@/lib/chain";
import type { Capability } from "@/lib/demo";
import type { StrategyView } from "@/hooks/useAquaStrategy";

export interface Reserves {
  usdc: bigint;
  weth: bigint;
}

const CARD_CLASSES =
  "relative flex flex-col gap-3 overflow-hidden rounded-3xl bg-linear-to-br from-muted to-background p-5 sm:p-6";

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
      <section className={CARD_CLASSES}>
        <Backdrop />
        <h2 className="relative text-label text-ink-3">Reserve</h2>
        {isLoading ? (
          <p className="relative text-base text-ink-3">Reading the reserve…</p>
        ) : (
          <UnavailableState reason={reserves.reason} className="relative" />
        )}
      </section>
    );
  }

  const streams = strategy && strategy.state !== "UNAVAILABLE" ? strategy.value.streams : [];
  const onlyStream = streams.length === 1 ? streams[0] : null;

  return (
    <section className={CARD_CLASSES}>
      <Backdrop />
      <div className="relative flex flex-wrap items-center gap-2">
        <h2 className="text-label text-ink-3">Reserve</h2>
        {reserves.state === "DEMO" ? <SimulatedBadge /> : null}
      </div>
      <div className="relative flex flex-col gap-3">
        <span className="flex items-center gap-3">
          <TokenIcon symbol="USDC" className="size-6 text-ink" />
          <Amount
            size="lg"
            value={reserves.value.usdc}
            decimals={tokens.USDC.decimals}
            symbol="USDC"
          />
        </span>
        <span className="flex items-center gap-3">
          <TokenIcon symbol="WETH" className="size-6 text-ink" />
          <Amount
            size="lg"
            value={reserves.value.weth}
            decimals={tokens.WETH.decimals}
            symbol="WETH"
          />
        </span>
      </div>

      {onlyStream ? (
        <p className="relative max-w-prose text-caption text-ink-3">
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
        <p className="relative max-w-prose text-caption text-ink-3">
          of which available to trade: shown per stream below — the streams share this one reserve
          and their allowances are not added together.
        </p>
      ) : (
        <p className="relative max-w-prose text-caption text-ink-3">
          What this rock holds right now. Trading with it moves these two balances.
        </p>
      )}
    </section>
  );
}

/** The drawing in the card's top-right corner. Out of the flow, so it never narrows the text. */
function Backdrop() {
  return (
    <ReserveArt className="pointer-events-none absolute -top-6 -right-8 size-44 opacity-25 sm:-top-8 sm:-right-6 sm:size-56" />
  );
}
