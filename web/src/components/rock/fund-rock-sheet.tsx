"use client";

/**
 * Fund this rock — the honest funding surface on an awake rock (Flow B step 9, spec 16 Part 3).
 *
 * What it replaces: "Add funds from another chain", which opened the bridge sheet. With demo mode
 * off that sheet's only content was a sentence saying no bridge exists, so the one fund-shaped
 * control on an awake rock led to a dead end. The bridge sheet is still there under
 * `NEXT_PUBLIC_DEMO_MODE=true`, badged, as DEMO-STATE S-1 describes it.
 *
 * What this is instead: the four real things an operator needs to put money in a rock on Sepolia —
 * the account to send to, what it holds right now, the two token contracts that say *which* USDC
 * and *which* WETH, and a link to watch it land. There is no amount field and no "confirm": this
 * app does not move a visitor's tokens, a wallet does. Nothing here is computed, quoted or
 * estimated, so there is no number on screen that is not a live read (D-013, D-014).
 */

import { Address } from "@/components/ui/address";
import { Amount } from "@/components/ui/amount";
import { Sheet, SheetBody } from "@/components/ui/sheet";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { fundingTargets, type FundingTarget } from "@/components/rock/fund-data";
import { explorer, tokens } from "@/lib/chain";
import type { Capability } from "@/lib/demo";

export interface FundRockSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rockId: string;
  /** The Rock Account from the registry. Absent while the rock has none. */
  smartAccount?: string;
  /** The rock's live balances, from the page's own read. */
  reserves: Capability<{ usdc: bigint; weth: bigint }>;
}

export function FundRockSheet({
  open,
  onOpenChange,
  rockId,
  smartAccount,
  reserves,
}: FundRockSheetProps) {
  const targets = fundingTargets({
    rockAccount: smartAccount,
    usdc: tokens.USDC.address,
    weth: tokens.WETH.address,
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Fund this rock"
      description={`Send tokens to rock #${rockId}'s own account. No bridge, no swap — an ordinary transfer.`}
    >
      <SheetBody className="flex flex-col gap-6">
        {/* Where to send ---------------------------------------------------- */}
        <div className="flex flex-col gap-2">
          {targets.rockAccount.state === "UNAVAILABLE" ? (
            <UnavailableState reason={targets.rockAccount.reason} />
          ) : (
            <TargetRow target={targets.rockAccount.value} />
          )}
        </div>

        {/* What it holds now ------------------------------------------------ */}
        <div className="flex flex-col gap-2">
          <h3 className="text-label text-ink-3">Held by this rock now</h3>
          {reserves.state === "UNAVAILABLE" ? (
            <UnavailableState reason={reserves.reason} />
          ) : (
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <Amount value={reserves.value.usdc} decimals={tokens.USDC.decimals} symbol="USDC" />
              <Amount value={reserves.value.weth} decimals={tokens.WETH.decimals} symbol="WETH" />
            </div>
          )}
          <p className="max-w-prose text-caption text-ink-3">
            This updates on its own once a transfer is mined.
          </p>
        </div>

        {/* Which tokens ----------------------------------------------------- */}
        <div className="flex flex-col gap-3">
          <h3 className="text-label text-ink-3">The two tokens this rock trades</h3>
          {targets.tokens.map((token, index) =>
            token.state === "UNAVAILABLE" ? (
              <UnavailableState key={index} reason={token.reason} />
            ) : (
              <TargetRow key={token.value.label} target={token.value} />
            ),
          )}
          <p className="max-w-prose text-sm text-ink-3">
            Sepolia USDC and WETH come from the public faucets; this app has no faucet for them.
          </p>
        </div>

        {targets.rockAccount.state === "UNAVAILABLE" ? null : (
          <a
            href={targets.rockAccount.value.explorerHref}
            target="_blank"
            rel="noreferrer"
            className="max-w-prose text-sm font-medium text-ink underline underline-offset-4"
          >
            Watch this account on {explorer.name}
          </a>
        )}
      </SheetBody>
    </Sheet>
  );
}

function TargetRow({ target }: { target: FundingTarget }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border p-4">
      <span className="text-label text-ink-3">{target.label}</span>
      <Address value={target.address} explorerHref={target.explorerHref} />
      <span className="max-w-prose text-caption text-ink-3">{target.hint}</span>
    </div>
  );
}
