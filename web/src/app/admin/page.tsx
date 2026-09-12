"use client";

/**
 * Operator dashboard (spec 15 N-7; spec 17 Part 5 "Admin").
 *
 * It was a `setTimeout` returning $1,254,300 TVL, 42 rocks, 8 Gelato tasks and three invented
 * feed rows. It now reads `GET /api/admin/stats`, which counts what the database holds, and
 * renders the reason when there is nothing to count — a zero TVL would be a measurement claim,
 * so the route returns null for it and this page says so instead.
 */

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { formatDateTime } from "@/components/rock/util";

interface AdminStats {
  state?: string;
  reason?: string;
  rocks?: number;
  events?: number;
  yieldSnapshots?: number;
  subscribers?: number;
  contactRequests?: number;
  tvlUsdc?: number | null;
  tvlMeasuredAt?: string | null;
  generatedAt?: string;
}

interface StatsResult {
  stats?: AdminStats;
  reason?: string;
  needsSignIn?: boolean;
}

async function fetchStats(): Promise<StatsResult> {
  const res = await fetch("/api/admin/stats");
  if (res.status === 401 || res.status === 403) {
    return { reason: "This dashboard needs an operator session.", needsSignIn: true };
  }
  const data = (await res.json()) as AdminStats;
  if (!res.ok || data.state !== "REAL") {
    return { reason: data.reason ?? "The statistics could not be read right now." };
  }
  return { stats: data };
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const query = useQuery({ queryKey: ["admin-stats"], queryFn: fetchStats, retry: false });

  const isLoading = query.isPending || query.isFetching;
  const result = query.data;
  const reason = query.isError
    ? "The statistics could not be reached right now."
    : (result?.reason ?? null);
  const stats = result?.stats;

  return (
    <main className="flex w-full flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 py-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-col gap-1">
            <h1 className="text-h1 font-extrabold text-ink">Operations</h1>
            <p className="max-w-prose text-sm text-ink-2">
              What the application database currently holds.
            </p>
          </div>
          <Button variant="outline" onClick={() => query.refetch()} disabled={isLoading}>
            <RefreshCw className={isLoading ? "motion-safe:animate-spin" : ""} />
            Refresh
          </Button>
        </header>

        {isLoading && !result ? (
          <p className="text-base text-ink-3">Reading the database…</p>
        ) : reason ? (
          <UnavailableState
            reason={reason}
            action={
              result?.needsSignIn
                ? { label: "Sign in", onClick: () => router.push("/admin/login") }
                : undefined
            }
          />
        ) : stats ? (
          <>
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Rocks" value={stats.rocks ?? 0} />
              <StatCard label="Recorded events" value={stats.events ?? 0} />
              <StatCard label="Snapshots" value={stats.yieldSnapshots ?? 0} />
              <StatCard label="Subscribers" value={stats.subscribers ?? 0} />
            </section>

            <section className="flex flex-col gap-2 rounded-2xl border border-border p-4 sm:p-6">
              <h2 className="text-label text-ink-3">Reserve across all rocks</h2>
              {typeof stats.tvlUsdc === "number" ? (
                <>
                  <Amount size="lg" value={stats.tvlUsdc} symbol="USDC" />
                  <p className="text-sm text-ink-3">
                    Measured {formatDateTime(stats.tvlMeasuredAt) ?? "at an unknown time"}.
                  </p>
                </>
              ) : (
                <UnavailableState reason="Nothing has been snapshotted yet, so there is no figure to show." />
              )}
            </section>

            <section className="flex flex-col gap-2 rounded-2xl border border-border p-4 sm:p-6">
              <h2 className="text-label text-ink-3">Contact requests</h2>
              <Amount size="md" value={stats.contactRequests ?? 0} />
              <p className="text-sm text-ink-3">
                Read {formatDateTime(stats.generatedAt) ?? "just now"}.
              </p>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border p-4">
      <span className="text-label text-ink-3">{label}</span>
      <Amount size="lg" value={value} maxFractionDigits={0} />
    </div>
  );
}
