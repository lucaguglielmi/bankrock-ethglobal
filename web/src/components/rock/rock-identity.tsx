"use client";

/**
 * The identity row: who this rock is, what state it is in, and who holds it.
 *
 * Every address is rendered through `<Address>` — middle-truncated, copyable, with an explorer
 * link built from `lib/chain` (never a hand-written host). Nothing here is substituted: an
 * address that the registry did not return is simply not shown.
 */

import type { ReactNode } from "react";
import { Address } from "@/components/ui/address";
import { explorer } from "@/lib/chain";
import { cn } from "@/lib/ui/cn";

export type RockLifecycle = "dormant" | "awake" | "handover_pending" | "archived";

const STATE_LABELS: Record<RockLifecycle, string> = {
  dormant: "Dormant",
  awake: "Awake",
  handover_pending: "Handover pending",
  archived: "Retired",
};

const STATE_CLASSES: Record<RockLifecycle, string> = {
  dormant: "bg-muted text-ink-2",
  awake: "bg-ink text-background",
  handover_pending: "bg-warning-bg text-ink",
  archived: "bg-muted text-ink-3",
};

export function RockStateBadge({ state }: { state: RockLifecycle }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-label",
        STATE_CLASSES[state],
      )}
    >
      {STATE_LABELS[state]}
    </span>
  );
}

export interface RockIdentityProps {
  rockId: string;
  state?: RockLifecycle;
  owner?: string;
  smartAccount?: string;
  lost?: boolean;
  /** Owner-only overflow menu, rendered at the end of the title row. */
  trailing?: ReactNode;
}

export function RockIdentity({
  rockId,
  state,
  owner,
  smartAccount,
  lost = false,
  trailing,
}: RockIdentityProps) {
  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-h1 font-extrabold text-ink">Rock #{rockId}</h1>
          {state ? <RockStateBadge state={state} /> : null}
          {lost ? (
            <span className="inline-flex shrink-0 items-center rounded-full bg-danger-bg px-2.5 py-1 text-label text-danger">
              Marked lost
            </span>
          ) : null}
        </div>
        {trailing}
      </div>

      {owner || smartAccount ? (
        <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
          {owner ? (
            <span className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-ink-3">
              Owner
              <Address value={owner} explorerHref={explorer.address(owner)} />
            </span>
          ) : null}
          {smartAccount ? (
            <span className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-ink-3">
              Rock account
              <Address value={smartAccount} explorerHref={explorer.address(smartAccount)} />
            </span>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
