"use client";

/**
 * The rock's liquidity position (spec 17 Part 5 "Position card"; spec 15 C-4, C-5, D-004).
 *
 * What this card may state is narrow, because little of it is real yet:
 *
 *  - the two reserve figures, which come from the chain read the page already performed;
 *  - the contracts involved, and only when they are configured in `lib/chain`;
 *  - that no Aqua strategy is integrated yet — said plainly, not filled in with a plausible
 *    "Strategy A: Constant Product" and a 2750 USDC/ETH target that nothing ever set.
 *
 * Deleted with the rewrite: the `Math.random()` deposit hash and its BaseScan link (S-2), the
 * estimated-return figure (N-3, D-004), the fabricated second strategy, and the "Zero-gas sponsored by
 * Pimlico on Base Sepolia" claim. The spread selector stays because it is the shape of the real
 * control, and it carries a `SIMULATED` badge because pressing it does nothing.
 */

import { useState } from "react";
import { RefreshCw, SlidersHorizontal } from "lucide-react";
import { Address } from "@/components/ui/address";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { SimulatedBadge } from "@/components/ui/simulated-badge";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { AnalyticsDashboard, type YieldDataPoint } from "@/components/analytics-dashboard";
import { addresses, explorer, tokens } from "@/lib/chain";
import type { Capability } from "@/lib/demo";
import { cn } from "@/lib/ui/cn";

const SPREADS = [
  { id: "0.05", label: "0.05%", hint: "Tight" },
  { id: "0.30", label: "0.30%", hint: "Standard" },
  { id: "1.00", label: "1.00%", hint: "Wide" },
] as const;

type SpreadId = (typeof SPREADS)[number]["id"];

export const STRATEGY_UNAVAILABLE_REASON = "Aqua strategy not integrated yet";

export interface AquaPositionCardProps {
  rockId: string;
  /** The Rock Account holding the reserve, when the registry returned one. */
  smartAccount?: string;
  reserves: Capability<{ usdc: bigint; weth: bigint }>;
  /** Supplied by a later phase. Absent means the strategy capability is UNAVAILABLE. */
  strategy?: Capability<unknown>;
  /** Recorded history, when there is any. */
  history?: YieldDataPoint[];
  /** Re-reads the chain. Wired to the page's `refresh()`. */
  onSync: () => void;
  isSyncing?: boolean;
}

export function AquaPositionCard({
  smartAccount,
  reserves,
  strategy,
  history,
  onSync,
  isSyncing = false,
}: AquaPositionCardProps) {
  const [spread, setSpread] = useState<SpreadId>("0.30");

  return (
    <section className="flex w-full flex-col gap-6 rounded-3xl border border-border p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-h3 font-semibold text-ink">Liquidity position</h3>
        <Button variant="outline" size="sm" onClick={onSync} disabled={isSyncing}>
          <RefreshCw className={cn(isSyncing && "motion-safe:animate-spin")} />
          Sync state
        </Button>
      </div>

      {/* Reserve ------------------------------------------------------------ */}
      {reserves.state === "UNAVAILABLE" ? (
        isSyncing ? (
          <p className="text-base text-ink-3">Reading the reserve…</p>
        ) : (
          <UnavailableState reason={reserves.reason} />
        )
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-label text-ink-3">Held by this rock</h4>
            {reserves.state === "DEMO" ? <SimulatedBadge /> : null}
          </div>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <Amount value={reserves.value.usdc} decimals={tokens.USDC.decimals} symbol="USDC" />
            <Amount value={reserves.value.weth} decimals={tokens.WETH.decimals} symbol="WETH" />
          </div>
        </div>
      )}

      {/* Strategy ----------------------------------------------------------- */}
      <div className="flex flex-col gap-2">
        <h4 className="text-label text-ink-3">Strategy</h4>
        {!strategy || strategy.state === "UNAVAILABLE" ? (
          <UnavailableState
            reason={
              strategy && strategy.state === "UNAVAILABLE"
                ? strategy.reason
                : STRATEGY_UNAVAILABLE_REASON
            }
          />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-ink-2">A strategy is configured for this rock.</p>
            {strategy.state === "DEMO" ? <SimulatedBadge /> : null}
          </div>
        )}
      </div>

      {/* Spread selector ---------------------------------------------------- */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-label text-ink-3">Trading spread</h4>
          <SimulatedBadge />
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {SPREADS.map((option) => {
            const isActive = option.id === spread;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={isActive}
                onClick={() => setSpread(option.id)}
                className={cn(
                  "flex min-h-12 flex-col justify-center rounded-2xl border px-4 py-2 text-left motion-safe:transition-colors",
                  isActive
                    ? "border-ink bg-ink text-background"
                    : "border-border bg-background text-ink-2 hover:bg-muted",
                )}
              >
                <span className="text-sm font-semibold">{option.label}</span>
                <span className={cn("text-caption", isActive ? "text-background/80" : "text-ink-3")}>
                  {option.hint}
                </span>
              </button>
            );
          })}
        </div>
        <p className="flex items-start gap-2 max-w-prose text-sm text-ink-3">
          <SlidersHorizontal aria-hidden className="mt-0.5 size-4 shrink-0" />
          Choosing a spread does nothing yet — there is no strategy to apply it to.
        </p>
      </div>

      {/* History ------------------------------------------------------------ */}
      <div className="flex flex-col gap-2">
        <h4 className="text-label text-ink-3">History</h4>
        <AnalyticsDashboard data={history ?? []} />
      </div>

      {/* Contracts ---------------------------------------------------------- */}
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <h4 className="text-label text-ink-3">Contracts</h4>
        <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
          {smartAccount ? (
            <span className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-ink-3">
              Rock account
              <Address value={smartAccount} explorerHref={explorer.address(smartAccount)} />
            </span>
          ) : null}
          {addresses.aqua ? (
            <span className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-ink-3">
              Aqua
              <Address value={addresses.aqua} explorerHref={explorer.address(addresses.aqua)} />
            </span>
          ) : null}
          {addresses.swapVmRouter ? (
            <span className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-ink-3">
              Router
              <Address
                value={addresses.swapVmRouter}
                explorerHref={explorer.address(addresses.swapVmRouter)}
              />
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
