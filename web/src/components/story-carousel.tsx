"use client";

/**
 * The landing page's two-slide story section (spec 17 Part 5, "Landing sections"): the origin
 * story (Florence map) and a short mechanics explainer main added ("What is this, exactly?").
 * Restyled from the version merged in from `main`: tokens only (no arbitrary pixel text sizes, no
 * low-contrast neutral-400 on real copy — the SVG map's own decorative pins keep their `fill-*`
 * colours, which are illustration, not text), 44 px prev/next controls at every width (not `hidden
 * md:block`), a touch swipe in addition to the buttons, and `prefers-reduced-motion` respected via
 * Framer Motion's own `useReducedMotion` (the Tailwind `motion-safe:` variant only gates CSS
 * transitions/animations, which this slide-in effect is not).
 */

import * as React from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AboutRocks } from "@/components/about-rocks";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/ui/cn";

const SLIDE_COUNT = 2;
const SWIPE_THRESHOLD_PX = 50;

export function StoryCarousel() {
  const [slide, setSlide] = React.useState(0);
  const prefersReducedMotion = useReducedMotion();
  const touchStartX = React.useRef<number | null>(null);

  const goNext = React.useCallback(() => setSlide((s) => Math.min(s + 1, SLIDE_COUNT - 1)), []);
  const goPrev = React.useCallback(() => setSlide((s) => Math.max(s - 1, 0)), []);

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const startX = touchStartX.current;
    touchStartX.current = null;
    if (startX === null) return;
    const endX = event.changedTouches[0]?.clientX ?? startX;
    const delta = endX - startX;
    if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return;
    if (delta < 0) goNext();
    else goPrev();
  };

  const offset = prefersReducedMotion ? 0 : 32;
  const transition = { duration: prefersReducedMotion ? 0 : 0.35 };

  return (
    <section
      className="relative z-10 -mx-[var(--gutter)] w-auto overflow-hidden bg-neutral-50 px-[var(--gutter)] py-16 sm:py-24"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="relative mx-auto max-w-5xl">
        <AnimatePresence mode="wait" initial={false}>
          {slide === 0 ? (
            <motion.div
              key="origin"
              initial={{ opacity: 0, x: -offset }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -offset }}
              transition={transition}
              className="grid grid-cols-1 items-center gap-16 md:grid-cols-2 md:gap-24"
            >
              <div className="flex flex-col gap-6">
                <span className="text-label text-ink-3 uppercase">The Origin</span>
                <h2 className="text-h2 font-bold text-ink">Forged in Florence.</h2>
                <p className="max-w-prose text-lead text-ink-2">
                  During the 15th century, the Medici family revolutionized global finance in
                  Florence, inventing double-entry bookkeeping and the letter of credit. They laid
                  the foundation for modern banking.
                </p>
                <p className="max-w-prose text-lead text-ink-2">
                  Every Bank Rock is handpicked from the riverbeds near Florence, bridging the
                  birthplace of classical finance with the frontier of agentic, self-custodial
                  DeFi.
                </p>
                <AboutRocks />
              </div>

              <div className="relative aspect-square w-full overflow-hidden rounded-3xl border border-neutral-100 bg-white p-8 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)]">
                <svg viewBox="0 0 160 160" className="w-full h-full z-10 opacity-90 transition-transform duration-1000 group-hover:scale-105" style={{ filter: "drop-shadow(0 20px 30px rgba(0,0,0,0.05))" }}>
                    <path d="M49.25,12.75L49.33,12.83L49.49,12.98L49.52,13.33L49.46,13.58L49.24,13.88L49.03,14L48.64,13.92L48.33,13.78L48.24,13.62L48.24,13.43L48.4,13L48.51,12.94L49.25,12.75ZM53.64,18.06L53.97,18.15L54.49,18.49L54.83,18.79L54.89,18.99L54.84,19.26L54.34,19.82L54.14,20L53.86,19.95L53.48,19.64L53.39,19.49L53.37,19.08L53.53,18.41L53.64,18.06ZM45.74,18.91L46.22,18.94L46.88,19.12L47.01,19.46L46.99,19.82L46.86,20.06L46.68,20.2L46.28,20.31L46.03,20.29L45.54,20.07L45.41,19.92L45.43,19.66L45.57,19.06L45.74,18.91ZM40.9,19.74L41.34,19.94L41.74,20.21L42.22,20.65L42.27,20.91L42.13,21.36L41.71,21.84L41.13,22.14L40.73,22.21L40.35,22.16L40.09,22.01L39.9,21.78L39.88,21.49L40.23,20.33L40.54,19.89L40.9,19.74ZM71.21,114.77L71.4,115.17L71.48,115.54L71.4,115.86L70.99,116.53L70.73,116.78L70.47,116.89L70.07,116.92L69.64,116.8L69.41,116.63L69.34,116.42L69.45,116L69.75,115.34L70.42,114.78L71.21,114.77ZM73.74,115.15L74.05,115.25L74.83,115.71L75.14,115.96L75.29,116.27L75.26,116.71L75,117.27L74.83,117.47L74.58,117.62L74.2,117.72L73.7,117.67L73.28,117.43L73.08,117.15L73,116.82L73.07,116.41L73.32,115.78L73.57,115.32L73.74,115.15ZM82.04,119.52L82.16,119.64L82.26,119.86L82.26,120.08L82.13,120.36L81.82,120.67L81.57,120.81L81.33,120.84L81.04,120.76L80.89,120.62L80.86,120.39L81,119.98L81.25,119.61L81.58,119.48L82.04,119.52ZM123.63,145L124.06,145.24L124.96,145.89L125.13,146.19L125.12,146.61L124.95,147.1L124.71,147.34L124.16,147.53L123.51,147.55L123.11,147.41L122.95,147.16L122.96,146.85L123.16,146.21L123.41,145.41L123.63,145Z" className="fill-neutral-100/50" />
                    <path d="M100.91,65.65L101.44,65.73L102.13,66.27L102.73,66.82L103.01,67.24L103.02,67.62L102.83,67.92L102.24,68.45L101.99,68.56L101.59,68.58L101.07,68.42L100.58,68.12L100.32,67.75L100.3,67.33L100.67,66.28L100.91,65.65ZM112.5,140L112.6,140.24L112.53,140.72L112.18,141.22L111.75,141.53L111.39,141.65L111,141.59L110.63,141.36L110.51,141.07L110.59,140.72L110.94,140.35L111.66,139.9L112.18,139.81L112.5,140ZM118.06,141.74L118.4,141.97L119.5,142.92L119.64,143.18L119.62,143.51L119.34,144.11L119,144.47L118.59,144.75L118.12,144.89L117.65,144.86L117.2,144.6L117.02,144.29L117.04,143.95L117.38,143.16L117.84,142.1L118.06,141.74ZM109.95,142.06L110.15,142.23L110.54,142.7L110.74,143.14L110.73,143.51L110.52,144L110.22,144.38L109.73,144.66L109.31,144.73L108.97,144.62L108.8,144.37L108.81,144.02L109.05,143.4L109.52,142.4L109.95,142.06ZM116.14,142.53L116.5,142.74L116.94,143.34L117.02,143.71L116.89,144.09L116.63,144.41L116.29,144.62L115.86,144.72L115.42,144.66L115.11,144.42L115.01,144.08L115.11,143.68L115.48,143.08L116.14,142.53ZM69.58,145.45L69.69,145.54L69.96,145.89L70.04,146.12L70,146.47L69.85,146.73L69.54,146.99L69.17,147.16L68.83,147.18L68.49,147.05L68.32,146.85L68.29,146.54L68.42,146.1L68.8,145.6L69.25,145.41L69.58,145.45ZM40.91,6.86L44.25,6.01L46.21,6.03L53.79,7.63L55.51,8.54L56.13,9.15L56.76,10.63L56.65,11.39L55.6,12.56L54.7,13.79L55.54,14L55.97,14.65L55.53,16.54L54.7,17.43L53.73,17.75L53.25,17.75L52.54,17L51.98,16.7L50.78,16.88L49.34,17.91L48.27,18.41L47.09,18.42L45.4,17.9L44.59,17.8L44.08,17.98L43.83,18.36L42.92,19L42.27,19L41.31,18.25L41.01,18.17L40.76,18.39L40.35,19L39.77,19.3L38.48,19L37.95,18.66L37.89,18.28L38.29,17.58L38.6,16L39.26,14L39.2,13.62L37.87,13L37.33,12.44L37,11.66L37.11,10.87L38.56,9L40.48,7.31L40.91,6.86Z" className="fill-neutral-200" />
                    
                    {/* Florence flashing dot */}
                    <g transform="translate(72.86, 51.31)">
                      <circle cx="0" cy="0" r="8" className="fill-blue-500/30 animate-ping" />
                      <circle cx="0" cy="0" r="4" className="fill-blue-500/50 animate-pulse" />
                      <circle cx="0" cy="0" r="2" className="fill-blue-600 drop-shadow-[0_0_2px_rgba(37,99,235,0.8)]" />
                      
                      {/* Animated dashed ring */}
                      <circle cx="0" cy="0" r="10" className="stroke-blue-400/60 fill-transparent stroke-[0.5] animate-[spin_4s_linear_infinite]" strokeDasharray="2 4" />
                      
                      <text x="5" y="1.5" fontSize="4" className="fill-blue-600 font-black tracking-widest uppercase font-mono drop-shadow-md">Florence</text>
                    </g>
                  
                    <g transform="translate(86.65, 80.42)">
                      <circle cx="0" cy="0" r="1" className="fill-neutral-300" />
                      <text x="2.5" y="1.2" fontSize="2.5" className="fill-neutral-400 font-medium tracking-wide">Old romans stuff</text>
                    </g>
                  
                    <g transform="translate(50.90, 24.43)">
                      <circle cx="0" cy="0" r="1" className="fill-neutral-300" />
                      <text x="-2.5" y="1.2" textAnchor="end" fontSize="2.5" className="fill-neutral-400 font-medium tracking-wide">Good designers</text>
                    </g>
                  
                    <g transform="translate(84.70, 25.47)">
                      <circle cx="0" cy="0" r="1" className="fill-neutral-300" />
                      <text x="2.5" y="1.2" fontSize="2.5" className="fill-neutral-400 font-medium tracking-wide">nice wine</text>
                    </g>
                  
                    <g transform="translate(107.26, 96.56)">
                      <circle cx="0" cy="0" r="1" className="fill-neutral-300" />
                      <text x="2.5" y="1.2" fontSize="2.5" className="fill-neutral-400 font-medium tracking-wide">Good pizza here</text>
                    </g>

                    <g transform="translate(38.00, 105.00)">
                      <circle cx="0" cy="0" r="1" className="fill-neutral-300" />
                      <text x="2.5" y="1.2" fontSize="2.5" className="fill-neutral-400 font-medium tracking-wide">nice beaches</text>
                    </g>
                </svg>

                <div className="absolute bottom-6 left-6 z-30 flex flex-col gap-1 text-caption text-ink-3 uppercase">
                  <span>Tuscany, IT</span>
                  <span className="text-ink-4">43.7696° N, 11.2558° E</span>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="mechanics"
              initial={{ opacity: 0, x: offset }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: offset }}
              transition={transition}
              className="mx-auto flex max-w-2xl flex-col gap-6"
            >
              <span className="text-label text-ink-3 uppercase">How it&apos;s built</span>
              <h2 className="text-h2 font-bold text-ink">What is this, exactly?</h2>
              <div className="flex flex-col gap-4 text-base text-ink-2">
                <p>
                  <strong className="text-ink">Bank Rock is not a bank.</strong> It is an
                  NFC-enabled stone you activate to hold a liquidity position that self-balances
                  and earns a share of the fees it generates when things go well — and can lose
                  value when they don&apos;t.
                </p>
                <p>
                  It can hold DeFi positions powered by <strong className="text-ink">Aqua</strong>.
                  Instead of locking tokens in a traditional AMM pool, your capital stays in your
                  Bank Rock&apos;s Rock Account — an ERC-4337 smart wallet you control.
                </p>
                <p>
                  When a trade happens against it,{" "}
                  <strong className="text-ink">just-in-time liquidity</strong> fulfills it directly
                  from that reserve.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-10 flex items-center justify-center gap-4">
          <IconButton
            aria-label="Previous slide"
            variant="outline"
            onClick={goPrev}
            disabled={slide === 0}
          >
            <ArrowLeft />
          </IconButton>
          <div className="flex items-center gap-2" role="tablist" aria-label="Story slides">
            {Array.from({ length: SLIDE_COUNT }, (_, index) => (
              <span
                key={index}
                aria-hidden
                className={cn("size-2 rounded-full", index === slide ? "bg-ink" : "bg-border")}
              />
            ))}
          </div>
          <IconButton
            aria-label="Next slide"
            variant="outline"
            onClick={goNext}
            disabled={slide === SLIDE_COUNT - 1}
          >
            <ArrowRight />
          </IconButton>
        </div>
      </div>
    </section>
  );
}
