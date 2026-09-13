"use client";

import { useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { InfoModal } from "@/components/info-modal";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Term } from "@/components/ui/term";

/**
 * The landing page's "How does it work?" block: three sentences a first-time visitor can follow,
 * two doors into the detail. Unfamiliar words are glossary `Term`s, so the block explains itself
 * without leaving the page.
 *
 * The "How do I control the rock?" sheet used to say an AI agent could "perform on-chain
 * operations, manage your liquidity, and rebalance your portfolio entirely on your behalf". It
 * cannot: the MCP server is read-only by decision (D-008, D-019) and holds no key. The sheet now
 * says what is true.
 *
 * Lazily loaded only when it is actually going to render: `how-it-works.tsx`
 * itself never imports `@react-three/fiber` (spec 17 §4.8, L-10), so this
 * `import()` - and Three.js - is only ever requested from `md` up, never on
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

        {/* Topic-specific 3D background - desktop only, never mounted on phones */}
        {isDesktop ? (
          <div className="hidden md:block">
            <HowItWorksBackgroundDynamic topic={hoveredTopic} />
          </div>
        ) : null}

        <div className="relative z-10 flex max-w-3xl flex-col gap-8">
          <span className="text-label uppercase text-white/60">The Mechanism</span>
          <h2 className="text-h2 font-bold">How does it work?</h2>

          <p className="text-lead font-medium text-white/80">
            A <Term k="bankRock" className="decoration-white/50" /> is a real stone you can give
            to someone. They can leave it in a drawer, or <Term k="tap" className="decoration-white/50" />{" "}
            it with their phone to wake it up. The rock then has its own{" "}
            <Term k="rockAccount" className="decoration-white/50" /> that holds two tokens and
            offers them for trading through <Term k="aqua" className="decoration-white/50" />.
            The tokens stay in the rock; every trade leaves a small{" "}
            <Term k="fee" className="decoration-white/50" /> behind.
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
                content={
                  <>
                    <p>
                      Tap the rock with your phone. Its page opens, and you sign in with an email,
                      a <Term k="passkey" /> or a social login through <Term k="privy" />. That
                      sign-in is your wallet; there is no seed phrase and nothing to install.
                    </p>
                    <p>
                      Once you own a rock, you decide everything from its page: start or stop a{" "}
                      <Term k="strategy" />, top it up, give it away or retire it. Each of those is
                      one <Term k="sponsoredTransaction" />, so you never need ETH.
                    </p>
                    <p>
                      You can also connect the AI assistant you already use to our{" "}
                      <Term k="mcp" /> endpoint. It can read the rock and explain it to you. It
                      cannot move, start or stop anything: it holds no key.
                    </p>
                  </>
                }
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
