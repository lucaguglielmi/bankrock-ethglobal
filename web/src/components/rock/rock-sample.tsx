"use client";

/**
 * Sample views for demo mode only (spec 15 D-013, Part 3).
 *
 * These render when `NEXT_PUBLIC_DEMO_MODE=true` and the real rock read is not available, so a
 * visitor can still see the shape of each state. Every figure carries a `SIMULATED` badge, no
 * transaction hash exists anywhere in here (D-014), no control does anything, and nothing in
 * this file can influence the attestation line — which is rendered from the server's answer
 * above it (F-7).
 */

import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { SimulatedBadge } from "@/components/ui/simulated-badge";
import { RockStateBadge } from "@/components/rock/rock-identity";
import type { DemoScenario } from "@/components/demo-switcher";

const SAMPLE_USDC = 1250;
const SAMPLE_WETH = 0.5;

const HEADLINES: Record<DemoScenario, { title: string; body: string; action: string }> = {
  dormant: {
    title: "Dormant rock",
    body: "Before anyone takes it, a rock has no account, no balance and no history.",
    action: "Awaken this rock",
  },
  awake: {
    title: "Awake rock",
    body: "An awake rock holds two tokens. Anyone can add funds to it or trade with it.",
    action: "Add funds",
  },
  handover: {
    title: "Handover pending",
    body: "The owner has given it away. It changes hands when the new owner taps it.",
    action: "Claim this rock",
  },
  archived: {
    title: "Retired rock",
    body: "Its history stays readable; the tag can awaken a new rock.",
    action: "Nothing to do",
  },
};

const STATE_FOR_SCENARIO = {
  dormant: "dormant",
  awake: "awake",
  handover: "handover_pending",
  archived: "archived",
} as const;

export function RockSample({ scenario }: { scenario: DemoScenario }) {
  const copy = HEADLINES[scenario];

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-h3 font-semibold text-ink">{copy.title}</h2>
        <RockStateBadge state={STATE_FOR_SCENARIO[scenario]} />
        <SimulatedBadge />
      </div>

      <p className="max-w-prose text-base text-ink-2">{copy.body}</p>

      {scenario === "awake" || scenario === "handover" ? (
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <Amount size="lg" value={SAMPLE_USDC} symbol="USDC" />
          <Amount size="lg" value={SAMPLE_WETH} symbol="WETH" />
        </div>
      ) : null}

      <Button size="lg" className="w-full" disabled>
        {copy.action}
      </Button>

      <p className="max-w-prose text-sm text-ink-3">
        Sample figures for the walkthrough. Nothing here was read from a chain, no transaction
        exists behind it, and the buttons do nothing.
      </p>
    </section>
  );
}
