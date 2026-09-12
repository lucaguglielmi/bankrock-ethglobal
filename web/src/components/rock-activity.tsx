"use client";

/**
 * Provenance (spec 17 Part 5, spec 15 D-014, X-5).
 *
 * Every row comes from `GET /api/events` — the indexed registry logs — and falls back to
 * `GET /api/rocks/[id]/activity`, the application database. Both routes answer with a capability
 * state, so "nothing happened yet" and "we could not read it" stay different answers and the
 * second one names what is missing.
 *
 * Gone with the rewrite: the three hardcoded transaction hashes that shipped as history (S-4),
 * the invented river coordinates and tap counter, the "BaseScan Verified" badge, and the
 * hand-built explorer links. A hash now reaches the page only through `<TxHash>`, and only when
 * it is a real 32-byte receipt hash.
 */

import { useCallback, useEffect, useState } from "react";
import { ArrowRightLeft, CheckCircle2, Gift, Sparkles } from "lucide-react";
import { TxHash } from "@/components/ui/tx-hash";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { explorer } from "@/lib/chain";
import { asTxHash, formatDateTime } from "@/components/rock/util";

type ActivityType = "trade" | "transfer" | "awaken" | "hardware";

export interface ActivityRow {
  id: string;
  type: ActivityType;
  title: string;
  description?: string;
  timestamp?: string;
  txHash?: `0x${string}`;
}

interface ActivityResponse {
  state?: string;
  reason?: string;
  events?: Array<{
    id?: string;
    type?: string;
    title?: string;
    description?: string;
    timestamp?: string;
    txHash?: string;
  }>;
}

const ICONS: Record<ActivityType, typeof ArrowRightLeft> = {
  trade: ArrowRightLeft,
  transfer: Gift,
  awaken: Sparkles,
  hardware: CheckCircle2,
};

function asActivityType(value: string | undefined): ActivityType {
  switch (value) {
    case "trade":
    case "transfer":
    case "awaken":
    case "hardware":
      return value;
    default:
      return "trade";
  }
}

function normalise(response: ActivityResponse): ActivityRow[] {
  return (response.events ?? []).map((event, index) => ({
    id: event.id ?? `event-${index}`,
    type: asActivityType(event.type),
    title: event.title ?? "On-chain event",
    description: event.description,
    timestamp: event.timestamp,
    txHash: asTxHash(event.txHash),
  }));
}

type LoadState =
  | { status: "loading" }
  | { status: "ready"; rows: ActivityRow[] }
  | { status: "unavailable"; reason: string };

export function RockActivity({ rockId }: { rockId: string }) {
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const load = useCallback(async (): Promise<LoadState> => {
    const id = encodeURIComponent(rockId);

    try {
      const res = await fetch(`/api/events?rockId=${id}`);
      const data = (await res.json()) as ActivityResponse;
      if (res.ok && data.state === "REAL") {
        return { status: "ready", rows: normalise(data) };
      }

      const fallbackRes = await fetch(`/api/rocks/${id}/activity`);
      const fallback = (await fallbackRes.json()) as ActivityResponse;
      if (fallbackRes.ok && fallback.state === "REAL") {
        return { status: "ready", rows: normalise(fallback) };
      }

      return {
        status: "unavailable",
        reason:
          data.reason ?? fallback.reason ?? "This rock's history could not be read right now.",
      };
    } catch {
      return {
        status: "unavailable",
        reason: "This rock's history could not be reached right now.",
      };
    }
  }, [rockId]);

  useEffect(() => {
    let cancelled = false;
    load().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  return (
    <section className="flex flex-col gap-4 border-t border-border pt-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-h2 font-bold text-ink">Provenance</h2>
        <p className="max-w-prose text-sm text-ink-2">
          Everything this rock has done, read back from {explorer.name}.
        </p>
      </div>

      {state.status === "loading" ? (
        <p className="text-sm text-ink-3">Reading this rock&rsquo;s history…</p>
      ) : state.status === "unavailable" ? (
        <UnavailableState reason={state.reason} />
      ) : state.rows.length === 0 ? (
        <p className="max-w-prose text-base text-ink-2">
          Nothing has happened to this rock yet.
        </p>
      ) : (
        <ol className="flex flex-col gap-4 border-l border-border pl-6">
          {state.rows.map((row) => {
            const Icon = ICONS[row.type];
            const when = formatDateTime(row.timestamp);
            return (
              <li key={row.id} className="relative flex flex-col gap-1">
                <span
                  aria-hidden
                  className="absolute top-1 -left-[1.9rem] flex size-4 items-center justify-center rounded-full border border-ink bg-background"
                >
                  <Icon className="size-2.5 text-ink" />
                </span>
                <span className="text-sm font-semibold text-ink">{row.title}</span>
                {row.description ? (
                  <span className="max-w-prose text-sm text-ink-2">{row.description}</span>
                ) : null}
                {when ? <span className="text-caption text-ink-3">{when}</span> : null}
                {row.txHash ? (
                  <TxHash value={row.txHash} explorerHref={explorer.tx(row.txHash)} />
                ) : null}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
