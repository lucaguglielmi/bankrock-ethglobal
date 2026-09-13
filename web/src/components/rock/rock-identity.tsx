"use client";

/**
 * The identity row: who this rock is and what state it is in.
 *
 * Deliberately nothing else. The owner's address and the rock's account used to sit under the
 * title, which put two Ethereum addresses on screen the moment the page opened; they now live in
 * the Ownership and Contracts tabs, where a visitor goes to look for them.
 */

import type { ReactNode } from "react";
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
  lost?: boolean;
  /** Owner-only overflow menu, rendered at the end of the title row. */
  trailing?: ReactNode;
}

export function RockIdentity({ rockId, state, lost = false, trailing }: RockIdentityProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
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
    </header>
  );
}
