"use client";

import { useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { InfoModal } from "@/components/info-modal";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Lazily loaded only when it is actually going to render: `how-it-works.tsx`
 * itself never imports `@react-three/fiber` (spec 17 §4.8, L-10), so this
 * `import()` — and Three.js — is only ever requested from `md` up, never on
 * a phone.
 */
const HowItWorksBackgroundDynamic = dynamic(
  () => import("@/components/chrome/how-it-works-background").then((mod) => mod.HowItWorksBackground),
  { ssr: false }
);

/** SSR-safe `matchMedia` subscription. Reports `false` on the server. */
function useMatchMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false
  );
}

export function HowItWorks() {
  const [hoveredTopic, setHoveredTopic] = useState<string | null>(null);
  const isDesktop = useMatchMedia("(min-width: 768px)");

  return (
    <section id="how-it-works" className="relative z-10 w-full bg-neutral-50 px-[var(--gutter)] pb-16 sm:pb-24">
      <div className="relative mx-auto w-full max-w-5xl overflow-hidden rounded-[3rem] bg-black p-6 text-white shadow-2xl sm:p-12 md:p-24">
        {/* Subtle base gradient when no topic is hovered */}
        <div
          className={`absolute inset-0 bg-gradient-to-br from-neutral-900 to-black motion-safe:transition-opacity motion-safe:duration-700 ${hoveredTopic ? "opacity-0" : "opacity-100"}`}
        />

        {/* Topic-specific 3D background — desktop only, never mounted on phones */}
        {isDesktop ? (
          <div className="hidden md:block">
            <HowItWorksBackgroundDynamic topic={hoveredTopic} />
          </div>
        ) : null}

        <div className="relative z-10 flex max-w-3xl flex-col gap-8">
          <span className="text-label uppercase text-white/60">The Mechanism</span>
          <h2 className="text-h2 font-bold">How does it work?</h2>

          <p className="text-lead font-medium text-white/80">
            Your bank is up to no good. A Bank Rock is a physical pebble that you can gift someone.
            They can forget it in a drawer, or activate it by tapping their phone.
            It holds a self-custodial position that can trade against Aqua&apos;s liquidity.
          </p>

          <div className="flex flex-wrap gap-4">
            <div
              onMouseEnter={() => setHoveredTopic("aqua")}
              onMouseLeave={() => setHoveredTopic(null)}
              className="max-w-full"
            >
              <Button variant="outline" size="default" className="rounded-full border-white/20 bg-white/5 text-base font-semibold hover:bg-white/10 hover:text-current" render={<Link href="/learn/defi" />}>What is Aqua? <ArrowRight aria-hidden /></Button>
            </div>
            <div
              onMouseEnter={() => setHoveredTopic("control")}
              onMouseLeave={() => setHoveredTopic(null)}
              className="max-w-full"
            >
              <InfoModal
                triggerText="How do I control the rock?"
                title="How do I control the rock?"
                content="Control is entirely physical and cryptographic. Tap your NFC-enabled smartphone against the resin-sealed portion of the Bank Rock to securely open the interface. Alternatively, you can copy the setup prompt to your favorite AI agent and control the rock via the Model Context Protocol (MCP). Your agent can perform on-chain operations, manage your liquidity, and rebalance your portfolio entirely on your behalf."
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
