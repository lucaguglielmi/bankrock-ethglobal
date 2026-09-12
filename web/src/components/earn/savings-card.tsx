"use client";

/**
 * Savings — the Privy Earn surface (spec 20 Part 5).
 *
 * What it shows, and where each figure comes from:
 *
 *   in the vault     `assets_in_vault` from Privy's position — the redeemable value of the shares;
 *   earned so far    `assets_in_vault + total_withdrawn − total_deposited`, the realised yield;
 *   ready to add     the asset's `balanceOf(wallet)` on the vault's chain, read from that chain.
 *
 * Three quantities, three sources, never summed. There is no rate on this card and no projection:
 * "earned so far" is what the vault has actually paid (D-004 as amended by D-033).
 *
 * Whose money this is: the signed-in person's, in their own embedded wallet. It is tied to the
 * sign-in, not to a rock — give the rock away and the savings stay with the giver — and the
 * copy says so where the card sits on a rock page.
 *
 * `useEarn` needs the Privy SDK, so the inner card mounts only when sign-in is configured and a
 * session exists; every other state renders the honest empty state instead (D-013).
 */

import * as React from "react";
import { PiggyBank, RefreshCw } from "lucide-react";
import { Address } from "@/components/ui/address";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { HelpTerm } from "@/components/ui/popover";
import { TxHash } from "@/components/ui/tx-hash";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { EarnActionSheet } from "@/components/earn/earn-action-sheet";
import { FundWalletButton } from "@/components/earn/fund-wallet-button";
import { formatDateTime } from "@/components/rock/util";
import { useAuth } from "@/context/auth-context";
import { useEarn } from "@/hooks/useEarn";
import { chainFromCaip2 } from "@/lib/chain";
import { EARN_ACTION_TYPES, type EarnAction, type EarnActionKind } from "@/lib/earn/shared";
import { formatAmount } from "@/lib/ui/format";

export interface SavingsCardProps {
  /** Where the card sits. On a rock page it says whose savings these are. */
  context?: "rock" | "page";
}

export function SavingsCard({ context = "page" }: SavingsCardProps) {
  const { ready, authenticated, unavailable, unavailableReason, login } = useAuth();

  let body: React.ReactNode;
  if (unavailable) {
    body = <UnavailableState reason={unavailableReason ?? "Sign-in is not configured."} />;
  } else if (!ready) {
    body = <p className="text-base text-ink-3">One moment…</p>;
  } else if (!authenticated) {
    body = (
      <UnavailableState
        icon={PiggyBank}
        reason="Sign in to see your savings. No wallet to install, no seed phrase to keep."
        action={{ label: "Sign in", onClick: () => login() }}
      />
    );
  } else {
    body = <SavingsCardBody context={context} />;
  }

  return (
    <section
      aria-labelledby="savings-heading"
      className="flex w-full flex-col gap-6 rounded-3xl border border-border p-4 sm:p-6"
    >
      <div className="flex flex-col gap-1">
        <h3 id="savings-heading" className="text-h3 font-semibold text-ink">
          Savings
        </h3>
        <p className="max-w-prose text-sm text-ink-2">
          Dollars that are not trading can{" "}
          <HelpTerm term="earn on their own">
            Idle USDC goes into a lending vault through Privy Earn. Borrowers pay interest to the
            vault, and the vault pays it on to depositors. Returns vary with demand and are not
            guaranteed; what this card calls &ldquo;earned so far&rdquo; is what the vault has
            actually paid, not a forecast. You can take your money out at any time, subject to how
            much the vault can pay out at that moment.
          </HelpTerm>
          .{" "}
          {context === "rock"
            ? "These are your own savings, tied to your sign-in rather than to this rock: they stay with you if you give the rock away."
            : "Your savings stay in your own wallet's name. Bank Rock never holds them."}
        </p>
      </div>
      {body}
    </section>
  );
}

function SavingsCardBody({ context }: { context: "rock" | "page" }) {
  const earn = useEarn();
  const [sheet, setSheet] = React.useState<EarnActionKind | null>(null);

  if (earn.vault.state === "UNAVAILABLE") {
    return earn.isLoading ? (
      <p className="text-base text-ink-3">Reading the vault…</p>
    ) : (
      <UnavailableState reason={earn.vault.reason} />
    );
  }
  if (earn.wallet.state === "UNAVAILABLE") {
    return earn.isLoading ? (
      <p className="text-base text-ink-3">Finding your wallet…</p>
    ) : (
      <UnavailableState reason={earn.wallet.reason} />
    );
  }

  const { vault } = earn.vault.value;
  const { address } = earn.wallet.value;
  const chain = chainFromCaip2(vault.caip2);
  const chainName = earn.chainName ?? vault.caip2;
  const decimals = vault.asset.decimals;
  const symbol = vault.asset.symbol.toUpperCase();

  const inVault =
    earn.position.state === "REAL" ? BigInt(earn.position.value.assetsInVault) : BigInt(0);
  const balance = earn.balance.state === "REAL" ? earn.balance.value : BigInt(0);

  return (
    <>
      {/* Position ------------------------------------------------------------ */}
      {earn.position.state === "UNAVAILABLE" ? (
        earn.isLoading ? (
          <p className="text-base text-ink-3">Reading your position…</p>
        ) : (
          <UnavailableState reason={earn.position.reason} />
        )
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:gap-10">
          <div className="flex flex-col gap-1">
            <span className="text-label text-ink-3">In the vault</span>
            <Amount size="lg" value={inVault} decimals={decimals} symbol={symbol} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-label text-ink-3">Earned so far</span>
            <span className="flex items-baseline gap-1.5">
              <span className="text-num font-semibold tabular-nums text-positive">
                {earn.position.value.earned >= BigInt(0) ? "+" : "−"}
                {formatAmount(
                  earn.position.value.earned < BigInt(0)
                    ? -earn.position.value.earned
                    : earn.position.value.earned,
                  { decimals, maxFractionDigits: Math.min(decimals, 6), minFractionDigits: 2 },
                )}
              </span>
              <span className="text-sm font-medium text-ink-2">{symbol}</span>
            </span>
            <span className="max-w-prose text-caption text-ink-3">
              What the vault has paid you so far. Not a rate, not a promise.
            </span>
          </div>
        </div>
      )}

      {/* Wallet balance ----------------------------------------------------- */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-label text-ink-3">Ready to add</span>
          {earn.balance.state === "UNAVAILABLE" ? (
            <span className="text-sm text-ink-3">{earn.balance.reason}</span>
          ) : (
            <Amount value={earn.balance.value} decimals={decimals} symbol={symbol} size="sm" />
          )}
        </div>
        <span className="max-w-prose text-caption text-ink-3">
          {symbol} in your wallet on {chainName}, outside the vault.
        </span>
      </div>

      {/* Actions ------------------------------------------------------------ */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            size="lg"
            className="w-full sm:flex-1"
            disabled={balance === BigInt(0) || earn.isPending}
            onClick={() => setSheet("deposit")}
          >
            Add to savings
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="w-full sm:flex-1"
            disabled={inVault === BigInt(0) || earn.isPending}
            onClick={() => setSheet("withdraw")}
          >
            Take out
          </Button>
        </div>
        <FundWalletButton
          address={address}
          chain={chain}
          symbol={symbol}
          explorerHref={earn.explorer?.address(address)}
        />
      </div>

      {/* History ------------------------------------------------------------ */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-label text-ink-3">History</h4>
          <Button variant="outline" size="sm" onClick={earn.refresh} disabled={earn.isPending}>
            <RefreshCw className={earn.isPending ? "motion-safe:animate-spin" : undefined} />
            Sync
          </Button>
        </div>
        {earn.history.state === "UNAVAILABLE" ? (
          <p className="text-sm text-ink-3">{earn.history.reason}</p>
        ) : earn.history.value.length === 0 ? (
          <p className="max-w-prose text-sm text-ink-2">
            Nothing yet. {context === "rock" ? "Add a little and watch it grow." : ""}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {earn.history.value.slice(0, 6).map((action) => (
              <HistoryRow
                key={action.id}
                action={action}
                decimals={decimals}
                symbol={symbol}
                explorerHref={
                  action.txHash && earn.explorer ? earn.explorer.tx(action.txHash) : undefined
                }
              />
            ))}
          </ul>
        )}
      </div>

      {/* Where it lives ----------------------------------------------------- */}
      <div className="flex flex-col gap-1 border-t border-border pt-4">
        <span className="text-label text-ink-3">Where it lives</span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-3">
          {vault.name} · {vault.provider} on {chainName}
          <Address
            value={vault.vaultAddress}
            explorerHref={earn.explorer?.address(vault.vaultAddress)}
          />
        </span>
        <span className="max-w-prose text-caption text-ink-3">
          Deposits and withdrawals go through Privy Earn, signed by your own wallet each time.
        </span>
      </div>

      <EarnActionSheet
        open={sheet === "deposit"}
        onOpenChange={(open) => setSheet(open ? "deposit" : null)}
        kind="deposit"
        vault={vault}
        available={balance}
        chainName={earn.chainName}
        isPending={earn.isPending}
        onSubmit={earn.deposit}
        onDone={earn.refresh}
      />
      <EarnActionSheet
        open={sheet === "withdraw"}
        onOpenChange={(open) => setSheet(open ? "withdraw" : null)}
        kind="withdraw"
        vault={vault}
        available={inVault}
        chainName={earn.chainName}
        isPending={earn.isPending}
        onSubmit={earn.withdraw}
        onDone={earn.refresh}
      />
    </>
  );
}

function HistoryRow({
  action,
  decimals,
  symbol,
  explorerHref,
}: {
  action: EarnAction;
  decimals: number;
  symbol: string;
  explorerHref?: string;
}) {
  const label =
    action.type === EARN_ACTION_TYPES.deposit
      ? "Added"
      : action.type === EARN_ACTION_TYPES.withdraw
        ? "Took out"
        : action.type;
  const when = formatDateTime(
    typeof action.createdAt === "number" ? action.createdAt : (action.createdAt ?? null),
  );

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
      <div className="flex min-w-0 flex-col">
        <span className="text-sm font-medium text-ink">
          {label}
          {action.rawAmount ? (
            <>
              {" "}
              <Amount value={BigInt(action.rawAmount)} decimals={decimals} symbol={symbol} size="sm" />
            </>
          ) : null}
        </span>
        <span className="text-caption text-ink-3">
          {when ?? ""}
          {when ? " · " : ""}
          <span className="capitalize">{action.status}</span>
        </span>
      </div>
      {action.txHash ? <TxHash value={action.txHash} explorerHref={explorerHref} /> : null}
    </li>
  );
}
