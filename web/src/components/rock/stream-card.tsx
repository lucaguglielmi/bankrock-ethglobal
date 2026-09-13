"use client";

/**
 * One live stream, as a card (spec 04; `contracts/aqua/NOTES.md` §6–7; spec 15 D-004).
 *
 * The three quantities this card keeps apart, because spec 04 forbids conflating them:
 *
 *   held        `ERC20.balanceOf(rockAccount)` — one reserve, shared by every stream. It is the
 *               headline above the cards, not repeated here;
 *   available   per stream, `min(virtual, held, allowance)` — what a visitor can trade *now*;
 *   allowed     per stream, the virtual balance Aqua tracks — an allowance, not a deposit.
 *
 * Two streams' allowances may sum to more than the rock holds, so they are never added together
 * and no total is rendered across cards (NOTES §7).
 *
 * Fees are the rate (`feeBps`, authenticated by the strategy hash) plus the cumulative figure the
 * route summed from Aqua's own `Pushed` events. When the RPC could not serve that log range the
 * rate still shows and the cumulative figure is UNAVAILABLE — it is never inferred from balance
 * deltas, which are inventory P&L, not fees (NOTES §6). Nothing here is annualised.
 *
 * Fees sit in the rock's own balance: there is nothing to collect, and the copy says so.
 */

import type { ReactNode } from "react";
import { Amount } from "@/components/ui/amount";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { formatFeeRate } from "@/components/rock/util";
import { StrategyArt } from "@/components/rock/strategy-art";
import type { ParsedStream } from "@/hooks/useAquaStrategy";
import { tokens } from "@/lib/chain";

export interface StreamCardProps {
  stream: ParsedStream;
  /** An owner-only control for the header row — the quiet "Stop" button. */
  action?: ReactNode;
}

/** The stream's name — its preset label, or its index when the reader had none. */
export function streamName(stream: Pick<ParsedStream, "label" | "streamIndex">): string {
  return stream.label ?? `Stream ${Number(stream.streamIndex) + 1}`;
}

export function StreamCard({ stream, action }: StreamCardProps) {
  const fees = stream.fees;

  return (
    <article className="flex flex-col gap-5 rounded-3xl border border-border p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <StrategyArt label={stream.label} className="size-10 text-ink" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <h3 className="text-h3 font-semibold text-ink">{streamName(stream)}</h3>
            <p className="text-sm text-ink-2">Earns {formatFeeRate(stream.feeBps)} of every trade</p>
          </div>
        </div>
        {action}
      </header>

      <div className="flex flex-col gap-1">
        <span className="text-label text-ink-3">Available now</span>
        <span className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <Amount value={stream.executable.usdc} decimals={tokens.USDC.decimals} symbol="USDC" />
          <Amount value={stream.executable.weth} decimals={tokens.WETH.decimals} symbol="WETH" />
        </span>
        <span className="max-w-prose text-caption text-ink-3">
          What a visitor can trade against right now.
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-label text-ink-3">Allowed by this stream</span>
        <span className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <Amount value={stream.virtual.usdc} decimals={tokens.USDC.decimals} symbol="USDC" />
          <Amount value={stream.virtual.weth} decimals={tokens.WETH.decimals} symbol="WETH" />
        </span>
        <span className="max-w-prose text-caption text-ink-3">
          An allowance against the reserve above, not a separate pot.
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-label text-ink-3">Fees earned</span>
        {stream.feesUnavailable ? (
          <UnavailableState reason={stream.feesUnavailable} className="py-6" />
        ) : fees ? (
          <>
            <span className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <Amount value={fees.earned.usdc} decimals={tokens.USDC.decimals} symbol="USDC" />
              <Amount value={fees.earned.weth} decimals={tokens.WETH.decimals} symbol="WETH" />
            </span>
            <span className="max-w-prose text-caption text-ink-3">
              From {fees.swapCount} {fees.swapCount === 1 ? "trade" : "trades"}
              {fees.complete ? "" : ` since block ${fees.fromBlock.toString()}`}. They sit in the
              rock&rsquo;s own balance — there is nothing to collect.
            </span>
          </>
        ) : (
          <span className="max-w-prose text-sm text-ink-2">No trades yet, so no fees yet.</span>
        )}
      </div>
    </article>
  );
}

/** The name this card had inside the old position card. Kept so nothing has to be renamed twice. */
export { StreamCard as StreamRow };
