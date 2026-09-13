"use client";

/**
 * Add funds - the honest funding surface on an awake rock (Flow B step 9, spec 16 Part 3).
 *
 * Funding a rock on Sepolia is an ordinary transfer to the Rock Account: no bridge, no route, no
 * quote. So the sheet is the four real things an operator needs - the account to send to (as a QR
 * a wallet can scan and as text with a copy button), what it holds right now, the two token
 * contracts that say *which* USDC and *which* WETH, and a link to watch the transfer land. There
 * is no amount field and no "confirm": this app does not move a visitor's tokens, a wallet does.
 * Nothing here is computed, quoted or estimated, so there is no number on screen that is not a
 * live read (D-013, D-014).
 *
 * The QR is always dark-on-white, in both themes: this is the one surface where legibility means
 * "a camera can read it", not "a person can" (`my-address-qr.tsx`). Its payload is the address
 * itself, which every wallet's scanner accepts.
 *
 * Every address here comes from `fund-data.ts`, capability-shaped: a rock with no account, or a
 * deployment with no token address configured, shows the reason - never a placeholder.
 */

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { Address } from "@/components/ui/address";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody } from "@/components/ui/sheet";
import { SimulatedBadge } from "@/components/ui/simulated-badge";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { fundingTargets, type FundingTarget } from "@/components/rock/fund-data";
import { explorer, tokens } from "@/lib/chain";
import type { Capability } from "@/lib/demo";
import { encodeQr, qrPathData, qrViewBoxSize } from "@/lib/qr";

/** Circle's Sepolia USDC faucet (spec 16 §1.4). A URL, not an address. */
const USDC_FAUCET_URL = "https://faucet.circle.com";

/** The quiet zone the standard requires. Four light modules on every side. */
const QUIET_ZONE = 4;

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
  const [showTokens, setShowTokens] = useState(false);

  const targets = fundingTargets({
    rockAccount: smartAccount,
    usdc: tokens.USDC.address,
    weth: tokens.WETH.address,
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add funds"
      description={`Rock #${rockId} has its own account. An ordinary transfer is all it takes.`}
    >
      <SheetBody className="flex flex-col gap-8">
        {/* Where to send ---------------------------------------------------- */}
        {targets.rockAccount.state === "UNAVAILABLE" ? (
          <UnavailableState reason={targets.rockAccount.reason} />
        ) : (
          <div className="flex flex-col items-center gap-4">
            <AddressQr address={targets.rockAccount.value.address} />
            <Address
              value={targets.rockAccount.value.address}
              explorerHref={targets.rockAccount.value.explorerHref}
            />
            <p className="max-w-prose text-center text-base text-ink-2">
              Send USDC or WETH on Ethereum Sepolia to this address.
            </p>
          </div>
        )}

        {/* What it holds now ------------------------------------------------ */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-label text-ink-3">Holds now</h3>
            {reserves.state === "DEMO" ? <SimulatedBadge /> : null}
          </div>
          {reserves.state === "UNAVAILABLE" ? (
            <UnavailableState reason={reserves.reason} className="py-6" />
          ) : (
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <Amount value={reserves.value.usdc} decimals={tokens.USDC.decimals} symbol="USDC" />
              <Amount value={reserves.value.weth} decimals={tokens.WETH.decimals} symbol="WETH" />
            </div>
          )}
          <p className="max-w-prose text-caption text-ink-3">
            Updates by itself once a transfer is mined.
          </p>
        </div>

        {/* Which tokens (collapsed) ----------------------------------------- */}
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <Button
            variant="ghost"
            className="w-full justify-between px-2"
            aria-expanded={showTokens}
            onClick={() => setShowTokens((current) => !current)}
          >
            <span className="text-sm font-semibold text-ink">Which tokens</span>
            {showTokens ? <ChevronUp aria-hidden /> : <ChevronDown aria-hidden />}
          </Button>

          {showTokens ? (
            <div className="flex flex-col gap-3">
              <p className="max-w-prose text-sm text-ink-3">
                Only these two contracts count. A token that shares the name is not the same
                token.
              </p>
              {targets.tokens.map((token, index) =>
                token.state === "UNAVAILABLE" ? (
                  <UnavailableState key={index} reason={token.reason} className="py-6" />
                ) : (
                  <TargetRow key={token.value.label} target={token.value} />
                ),
              )}
              <p className="max-w-prose text-sm text-ink-3">
                Sepolia USDC and WETH come from public faucets; this app has no faucet of its own.
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="w-full justify-between"
                  render={<a href={USDC_FAUCET_URL} target="_blank" rel="noreferrer" />}
                >
                  Get Sepolia USDC
                  <ExternalLink aria-hidden />
                </Button>
                {targets.rockAccount.state === "UNAVAILABLE" ? null : (
                  <Button
                    variant="outline"
                    className="w-full justify-between"
                    render={
                      <a
                        href={targets.rockAccount.value.explorerHref}
                        target="_blank"
                        rel="noreferrer"
                      />
                    }
                  >
                    Watch on {explorer.name}
                    <ExternalLink aria-hidden />
                  </Button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </SheetBody>
    </Sheet>
  );
}

/** The Rock Account as a QR symbol, dark on white in every theme. */
function AddressQr({ address }: { address: string }) {
  const symbol = useMemo(() => {
    try {
      const matrix = encodeQr(address);
      return {
        path: qrPathData(matrix, QUIET_ZONE),
        size: qrViewBoxSize(matrix, QUIET_ZONE),
      };
    } catch {
      // Only a payload past version 10 throws, which a 42-character address is not. If it ever
      // does, the address text below is still the whole answer.
      return null;
    }
  }, [address]);

  if (!symbol) return null;

  return (
    <div className="rounded-2xl border border-border bg-white p-3">
      <svg
        viewBox={`0 0 ${symbol.size} ${symbol.size}`}
        width="216"
        height="216"
        shapeRendering="crispEdges"
        role="img"
        aria-label="QR code of this rock's account address"
        className="block h-auto w-full max-w-56"
      >
        <rect width={symbol.size} height={symbol.size} fill="#ffffff" />
        <path d={symbol.path} fill="#000000" />
      </svg>
    </div>
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
