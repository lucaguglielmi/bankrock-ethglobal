"use client";

/**
 * The headline reserve — the first figure on an awake rock (spec 17 Part 5).
 *
 * Both balances come from the chain read. When that read is unavailable there is no number at
 * all, only the reason: a zero would read as "we measured zero", which is a different claim.
 */

import { Amount } from "@/components/ui/amount";
import { SimulatedBadge } from "@/components/ui/simulated-badge";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { tokens } from "@/lib/chain";
import type { Capability } from "@/lib/demo";

export interface Reserves {
  usdc: bigint;
  weth: bigint;
}

export function ReserveHeadline({
  reserves,
  isLoading = false,
}: {
  reserves: Capability<Reserves>;
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
      <p className="max-w-prose text-caption text-ink-3">
        What this rock holds right now. Trading with it moves these two balances.
      </p>
    </section>
  );
}
