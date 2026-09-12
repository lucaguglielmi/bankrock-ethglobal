"use client";

/**
 * The outcome of one write, rendered honestly (spec 15 Part 3, D-014).
 *
 *   REAL         the hash from the receipt, with an explorer link
 *   DEMO         the literal text `no transaction — simulated`, badged — never a hex string
 *   UNAVAILABLE  the reason, and nothing else
 */

import { SimulatedBadge } from "@/components/ui/simulated-badge";
import { TxHash } from "@/components/ui/tx-hash";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { explorer } from "@/lib/chain";
import type { Capability } from "@/lib/demo";

export interface CapabilityResultProps {
  result: Capability<{ txHash: `0x${string}` }>;
  /** Heading shown when the write went through. */
  title: string;
  /** One sentence saying what changed. */
  description: string;
  /**
   * Extra `<dt>`/`<dd>` pairs for this particular write — the amount received from a swap, say —
   * rendered above the transaction row. Only ever values read back from the result.
   */
  rows?: React.ReactNode;
}

function CapabilityResult({ result, title, description, rows }: CapabilityResultProps) {
  if (result.state === "UNAVAILABLE") {
    return <UnavailableState reason={result.reason} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-h3 font-semibold text-ink">{title}</h3>
        {result.state === "DEMO" ? <SimulatedBadge /> : null}
      </div>
      <p className="max-w-prose text-base text-ink-2">{description}</p>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 text-sm">
        {rows}
        <dt className="text-ink-3">Transaction</dt>
        <dd className="justify-self-end">
          {result.state === "REAL" ? (
            <TxHash
              value={result.value.txHash}
              explorerHref={explorer.tx(result.value.txHash)}
            />
          ) : (
            <span className="text-ink-3">no transaction — simulated</span>
          )}
        </dd>
      </dl>
    </div>
  );
}

export { CapabilityResult };
