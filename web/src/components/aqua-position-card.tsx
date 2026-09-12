"use client";

/**
 * The rock's liquidity position (spec 04; `contracts/aqua/NOTES.md` §6–7; spec 15 D-004).
 *
 * The three quantities this card must keep apart:
 *
 *   held        `ERC20.balanceOf(rockAccount)` — one reserve, shared by every stream;
 *   available   per stream, `min(virtual, held, allowance)` — what a visitor can trade *now*;
 *   allowed     per stream, the virtual balance Aqua tracks — an allowance, not a deposit.
 *
 * Two streams' virtual balances may sum to more than the rock holds, so they are never added
 * together and no total is rendered across streams (NOTES §7).
 *
 * Fees are the rate (`feeBps`, authenticated by the strategy hash) plus the cumulative figure the
 * route computed from Aqua's own `Pushed` events. When the RPC could not serve that log range the
 * rate still shows and the cumulative figure is UNAVAILABLE — it is never inferred from balance
 * deltas, which are inventory P&L, not fees (NOTES §6). Nothing here is annualised.
 *
 * Deleted with the rewrite: the `Math.random()` deposit hash and its BaseScan link (S-2), the
 * estimated-return figure (N-3), the fabricated second strategy, and the SIMULATED spread selector —
 * the real fee tier is chosen once, in the ship sheet, because it is the strategy's identity.
 *
 * Deleted after it: the **History** charts. They rendered `history ?? []`, no caller ever passed
 * `history`, and the route that could have filled it — `GET /api/rocks/[id]/yield` — was called by
 * nobody and is gone with them. The fee figures above are the real history this card has: they are
 * summed from Aqua's own `Pushed` events, per stream, with the block range they were read over. An
 * empty chart under the heading "History" reads as "nothing happened", which is a claim, not an
 * absence.
 */

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Address } from "@/components/ui/address";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { SimulatedBadge } from "@/components/ui/simulated-badge";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { ShipStrategySheet } from "@/components/rock/ship-strategy-sheet";
import { formatFeeRate } from "@/components/rock/util";
import type { ParsedStream, StrategyView } from "@/hooks/useAquaStrategy";
import { addresses, explorer, tokens } from "@/lib/chain";
import type { Capability } from "@/lib/demo";

export interface AquaPositionCardProps {
  rockId: string;
  /** The Rock Account holding the reserve, when the registry returned one. */
  smartAccount?: string;
  reserves: Capability<{ usdc: bigint; weth: bigint }>;
  /** The Aqua position, from `useAquaStrategy`. */
  strategy: Capability<StrategyView>;
  /** The first strategy read is in flight, so "unavailable" would be premature. */
  isStrategyLoading?: boolean;
  /** Only the owner may start or stop a stream. */
  isOwner?: boolean;
  /**
   * Whether the owner's wallet may still act from the rock's account (D-037). Shipping a strategy
   * is a batch from that account, so an UNAVAILABLE answer replaces the button with its reason.
   */
  ownerActions?: Capability<string>;
  /** Re-reads the chain. Wired to the page's `refresh()`. */
  onSync: () => void;
  isSyncing?: boolean;
}

export function AquaPositionCard({
  rockId,
  smartAccount,
  reserves,
  strategy,
  isStrategyLoading = false,
  isOwner = false,
  ownerActions,
  onSync,
  isSyncing = false,
}: AquaPositionCardProps) {
  const [isShipOpen, setShipOpen] = useState(false);
  const ownerBlockedReason =
    ownerActions && ownerActions.state === "UNAVAILABLE" ? ownerActions.reason : null;

  const streams = strategy.state === "UNAVAILABLE" ? [] : strategy.value.streams;
  const hasStreams = streams.length > 0;

  return (
    <section className="flex w-full flex-col gap-6 rounded-3xl border border-border p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-h3 font-semibold text-ink">Liquidity position</h3>
        <Button variant="outline" size="sm" onClick={onSync} disabled={isSyncing}>
          <RefreshCw className={isSyncing ? "motion-safe:animate-spin" : undefined} />
          Sync state
        </Button>
      </div>

      {/* The one shared reserve ---------------------------------------------- */}
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
          <p className="max-w-prose text-caption text-ink-3">
            One reserve, shared by every stream below.
          </p>
        </div>
      )}

      {/* Streams ------------------------------------------------------------- */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <h4 className="text-label text-ink-3">Trading</h4>
          {strategy.state === "DEMO" ? <SimulatedBadge /> : null}
        </div>

        {isStrategyLoading && !hasStreams ? (
          <p className="text-base text-ink-3">Reading this rock&rsquo;s strategy…</p>
        ) : strategy.state === "UNAVAILABLE" ? (
          <UnavailableState reason={strategy.reason} />
        ) : hasStreams ? (
          streams.map((stream) => <StreamRow key={stream.strategyHash} stream={stream} />)
        ) : isOwner ? (
          <div className="flex flex-col gap-3">
            <p className="max-w-prose text-base text-ink-2">
              This rock is not trading yet. Make part of its reserve available and it starts
              earning a fee on every trade.
            </p>
            <Button
              size="lg"
              className="w-full"
              onClick={() => setShipOpen(true)}
              disabled={ownerBlockedReason !== null}
            >
              Start earning
            </Button>
            {ownerBlockedReason ? (
              <p className="max-w-prose text-sm text-ink-3">{ownerBlockedReason}</p>
            ) : null}
          </div>
        ) : (
          <p className="max-w-prose text-base text-ink-2">
            This rock is not trading yet. Only its owner can start it.
          </p>
        )}
      </div>

      {/* Contracts ----------------------------------------------------------- */}
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
          {addresses.aquaApp ? (
            <span className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-ink-3">
              Strategy app
              <Address
                value={addresses.aquaApp}
                explorerHref={explorer.address(addresses.aquaApp)}
              />
            </span>
          ) : null}
          {addresses.aquaTaker ? (
            <span className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-ink-3">
              Router
              <Address
                value={addresses.aquaTaker}
                explorerHref={explorer.address(addresses.aquaTaker)}
              />
            </span>
          ) : null}
        </div>
      </div>

      <ShipStrategySheet
        open={isShipOpen}
        onOpenChange={setShipOpen}
        rockId={rockId}
        reserves={reserves}
        onShipped={onSync}
      />
    </section>
  );
}

function StreamRow({ stream }: { stream: ParsedStream }) {
  const fees = stream.fees;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink">
          {stream.label ?? `Stream ${Number(stream.streamIndex) + 1}`}
        </span>
        <span className="text-sm text-ink-2">
          Earns {formatFeeRate(stream.feeBps)} of every trade
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-label text-ink-3">Available to trade now</span>
        <span className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <Amount
            value={stream.executable.usdc}
            decimals={tokens.USDC.decimals}
            symbol="USDC"
          />
          <Amount
            value={stream.executable.weth}
            decimals={tokens.WETH.decimals}
            symbol="WETH"
          />
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
          <UnavailableState reason={stream.feesUnavailable} />
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
          <span className="max-w-prose text-sm text-ink-2">
            No trades yet, so no fees yet.
          </span>
        )}
      </div>
    </div>
  );
}
