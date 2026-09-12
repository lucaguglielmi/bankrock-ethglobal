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
                <svg
                  viewBox="0 0 200 200"
                  className="absolute top-1/2 left-1/2 h-[120%] w-[120%] -translate-x-1/2 -translate-y-1/2 text-neutral-50"
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="M97.664,113.931L97.688,113.858L97.666,113.79L98.011,113.736L98.008,113.53L98.137,113.399L98.125,113.324L98.261,113.226L98.266,113.349L98.373,113.458L98.297,113.638L98.409,113.895L98.336,113.958L98.273,113.923L98.277,114.039L98.313,114.118L98.425,114.117L98.534,114.264L98.548,114.396L98.426,114.351L98.364,114.455L98.293,114.398L98.263,114.446L98.122,114.43L98.007,114.684L97.887,114.663L97.89,114.694L97.843,114.63L97.683,114.643L97.519,114.495L97.547,114.456L97.52,114.38L97.608,114.302L97.59,114.205L97.481,114.153L97.484,114.09L97.435,114.026L97.547,114.014ZM98.339,114.13L98.34,114.133L98.34,114.126Z" />
                  <path d="M97.946,113.546L97.993,113.55L98.024,113.663L98.005,113.744L97.94,113.772L97.826,113.752L97.638,113.81L97.607,113.697L97.539,113.624L97.654,113.535L97.709,113.573L97.88,113.503Z" />
                  <path d="M97.796,114.804L97.88,114.666L98.033,114.661L98.039,114.571L98.127,114.425L98.269,114.444L98.327,114.402L98.354,114.455L98.413,114.422L98.425,114.355L98.671,114.428L98.648,114.509L98.737,114.523L98.906,114.712L98.883,114.756L98.801,114.742L98.556,114.557L98.547,114.587L98.353,114.501L98.218,114.573L98.015,114.821L97.784,114.873ZM98.1,114.738L98.101,114.739L98.099,114.738ZM98.203,114.613L98.203,114.612L98.204,114.613ZM98.422,114.524L98.399,114.516L98.416,114.521ZM98.396,114.516L98.4,114.518L98.374,114.509ZM98.365,114.506L98.352,114.506L98.37,114.503ZM98.641,114.62L98.641,114.62L98.641,114.62ZM98.792,114.737L98.792,114.738L98.792,114.738ZM98.789,114.733L98.789,114.733L98.789,114.733ZM98.822,114.768L98.822,114.768L98.822,114.768ZM98.821,114.765L98.823,114.766L98.821,114.767ZM98.824,114.752L98.821,114.762L98.816,114.756ZM98.826,114.751L98.826,114.751L98.826,114.751Z" />
                  <path d="M98.305,113.671L98.307,113.59L98.373,113.458L98.423,113.469L98.402,113.52L98.496,113.637L98.527,113.591L98.503,113.518L98.628,113.328L98.638,113.216L98.693,113.221L98.731,113.341L98.9,113.309L98.98,113.401L99.001,113.286L98.952,113.227L99.024,113.156L99.195,113.28L99.124,113.533L99.159,113.679L99.275,113.649L99.19,113.789L99.221,113.969L99.525,114.194L99.142,114.222L98.909,114.088L98.828,114.126L98.685,114.09L98.587,114.216L98.621,114.262L98.6,114.346L98.554,114.347L98.422,114.113L98.319,114.129L98.268,114.017L98.273,113.931L98.35,113.954L98.4,113.899ZM98.588,114.337L98.593,114.336L98.589,114.335ZM98.592,114.343L98.594,114.342L98.594,114.341ZM98.481,113.534L98.482,113.543L98.474,113.545ZM98.34,114.126L98.34,114.133L98.339,114.13Z" />
                  <path d="M99.793,113.211L99.707,113.246L99.731,113.259L99.693,113.326L99.753,113.399L99.751,113.459L99.664,113.488L99.649,113.572L99.57,113.545L99.47,113.601L99.41,113.734L99.317,113.747L99.284,113.652L99.137,113.65L99.12,113.559L99.175,113.375L99.15,113.331L99.196,113.274L99.126,113.217L99.139,113.158L99.1,113.12L99.141,113.01L99.359,113.072L99.438,112.951L99.689,112.946L99.877,112.879L99.846,112.949L99.989,113.127L99.88,113.174L99.82,113.136Z" />
                  <path d="M99.191,113.835L99.282,113.655L99.283,113.721L99.394,113.739L99.514,113.568L99.647,113.572L99.663,113.489L99.751,113.461L99.689,113.33L99.728,113.23L99.816,113.157L99.987,113.133L100.097,113.158L100.065,113.252L99.925,113.395L99.999,113.473L99.967,113.582L100.073,113.684L100.213,113.668L100.245,113.757L99.939,113.93L99.913,114.028L99.932,114.121L100.017,114.191L99.963,114.298L99.908,114.227L99.776,114.187L99.618,114.242L99.533,114.218L99.235,113.987Z" />
                  <path d="M100.435,113.313L100.375,113.367L100.396,113.424L100.483,113.434L100.427,113.543L100.486,113.559L100.477,113.673L100.614,113.776L100.573,113.81L100.452,113.678L100.404,113.75L100.312,113.731L100.253,113.771L100.208,113.661L100.039,113.669L99.967,113.582L99.961,113.517L99.997,113.479L99.976,113.425L99.932,113.405L100.118,113.152L100.514,113.226ZM100.545,113.76L100.547,113.764L100.544,113.759Z" />
                  <path d="M98.608,114.317L98.593,114.198L98.711,114.073L98.832,114.124L98.893,114.082L99.134,114.222L99.217,114.178L99.612,114.245L99.695,114.19L99.898,114.213L99.936,114.292L99.894,114.292L99.886,114.362L99.937,114.632L100.113,114.825L100.08,114.905L99.997,114.876L100.007,114.81L99.892,114.95L99.774,114.947L99.648,114.875L99.626,114.815L99.667,114.73L99.529,114.655L99.437,114.7L99.45,114.726L99.34,114.709L99.304,114.746L99.22,114.695L99.158,114.72L98.867,114.49L98.765,114.545L98.649,114.517L98.673,114.433L98.547,114.372ZM99.856,114.918L99.859,114.936L99.882,114.933ZM98.592,114.343L98.594,114.341L98.594,114.342ZM98.588,114.337L98.589,114.335L98.592,114.335ZM99.104,114.672L99.105,114.671L99.105,114.672Z" />
                  <path d="M100,115.1L99.933,115.099L99.94,115.064L99.86,115.027L99.941,114.984L99.917,114.922L99.977,114.88L100.062,114.91L100.113,114.822L100.188,114.854L100.504,115.078L100.637,115.475L100.405,115.618L100.313,115.59L100.336,115.511L100.179,115.447L100.115,115.138L100.049,115.153ZM99.959,115.049L99.971,115.052L99.966,115.044Z" />
                  <path d="M83.614,67.219L81.547,76.346L84.22,85.314L90.947,91.82L100,94.192L109.053,91.82L115.78,85.314L118.453,76.346L116.386,67.219L122.39,64.101L134.122,58.008L146.439,51.612L157.68,45.774L167.063,40.901L174.092,37.251L178.439,34.993L179.909,34.23L184.556,44.779L187.817,55.836L189.639,67.218L189.992,78.741L188.869,90.213L186.29,101.449L182.297,112.262L176.955,122.477L170.352,131.926L162.595,140.454L153.813,147.921L144.149,154.204L133.761,159.202L122.819,162.831L111.504,165.032L100,165.77L88.496,165.032L77.181,162.831L66.239,159.202L55.851,154.204L46.187,147.921L37.405,140.454L29.648,131.926L23.045,122.477L17.703,112.262L13.71,101.449L11.131,90.213L10.008,78.741L10.361,67.218L12.183,55.836L15.444,44.779L20.091,34.23L21.561,34.993L25.908,37.251L32.937,40.901L42.32,45.774L53.561,51.612L65.878,58.008L77.61,64.101L83.614,67.219Z" />
                  <g transform="translate(99.44, 114.94)">
                    <circle cx="0" cy="0" r="4" className="fill-blue-500 motion-safe:animate-ping opacity-75" />
                    <circle cx="0" cy="0" r="1.5" className="fill-blue-600" />
                    <text x="4" y="1.5" fontSize="3.5" className="fill-blue-600 font-bold tracking-wider uppercase font-mono">
                      Florence
                    </text>
                  </g>
                  <g transform="translate(100.00, 116.11)">
                    <circle cx="0" cy="0" r="1" className="fill-neutral-300" />
                    <text x="3" y="1.2" fontSize="3" className="fill-neutral-300 font-bold tracking-widest uppercase font-mono">
                      Rome
                    </text>
                  </g>
                  <g transform="translate(98.56, 113.86)">
                    <circle cx="0" cy="0" r="1" className="fill-neutral-300" />
                    <text x="3" y="1.2" fontSize="3" className="fill-neutral-300 font-bold tracking-widest uppercase font-mono">
                      Milan
                    </text>
                  </g>
                  <g transform="translate(99.92, 113.90)">
                    <circle cx="0" cy="0" r="1" className="fill-neutral-300" />
                    <text x="3" y="1.2" fontSize="3" className="fill-neutral-300 font-bold tracking-widest uppercase font-mono">
                      Venice
                    </text>
                  </g>
                  <g transform="translate(100.83, 116.76)">
                    <circle cx="0" cy="0" r="1" className="fill-neutral-300" />
                    <text x="3" y="1.2" fontSize="3" className="fill-neutral-300 font-bold tracking-widest uppercase font-mono">
                      Naples
                    </text>
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
