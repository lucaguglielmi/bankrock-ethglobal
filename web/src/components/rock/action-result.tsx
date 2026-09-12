"use client";

/**
 * What the page says after an action (spec 15 D-013, D-014).
 *
 *  - REAL         the receipt's own hash, through `<TxHash>`, with an explorer link;
 *  - DEMO         the literal words "no transaction — simulated". Never a hex string;
 *  - UNAVAILABLE  the reason the action could not run, in plain language.
 */

import { Check, CircleAlert } from "lucide-react";
import { TxHash } from "@/components/ui/tx-hash";
import { SimulatedBadge } from "@/components/ui/simulated-badge";
import { explorer } from "@/lib/chain";
import type { Capability } from "@/lib/demo";
import { asTxHash } from "@/components/rock/util";

export type ActionOutcome =
  | { kind: "real"; txHash?: `0x${string}` }
  | { kind: "demo" }
  | { kind: "error"; reason: string };

/** Converts an action's capability result into something the UI may state. */
export function outcomeFrom(result: Capability<{ txHash?: unknown }>): ActionOutcome {
  if (result.state === "UNAVAILABLE") return { kind: "error", reason: result.reason };
  if (result.state === "DEMO") return { kind: "demo" };
  return { kind: "real", txHash: asTxHash(result.value?.txHash) };
}

export function ActionOutcomeNotice({
  outcome,
  successLabel,
}: {
  outcome: ActionOutcome | null;
  successLabel: string;
}) {
  if (!outcome) return null;

  if (outcome.kind === "error") {
    return (
      <p className="flex items-start gap-2 text-sm text-danger">
        <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>{outcome.reason}</span>
      </p>
    );
  }

  if (outcome.kind === "demo") {
    return (
      <p className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
        <SimulatedBadge />
        no transaction — simulated
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
      <span className="inline-flex items-center gap-2 font-medium text-positive">
        <Check aria-hidden className="size-4 shrink-0" />
        {successLabel}
      </span>
      {outcome.txHash ? (
        <TxHash value={outcome.txHash} explorerHref={explorer.tx(outcome.txHash)} />
      ) : null}
    </div>
  );
}
