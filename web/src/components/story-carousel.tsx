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
<svg viewBox="0 0 160 160" className="w-full h-full z-10 opacity-90 transition-transform duration-1000 group-hover:scale-105" style={{ filter: 'drop-shadow(0 20px 30px rgba(0,0,0,0.05))' }}>
  <g transform="translate(30.934607798513127, -2.5) scale(0.013275678956152328, -0.013275678956152328) translate(306, -10195)">
    <path d="M4826 10195 c-49 -25 -101 -45 -116 -45 -15 0 -59 12 -96 27 -56 21 -87 27 -159 27 -126 1 -152 -6 -221 -65 -75 -65 -108 -79 -188 -79 -54 0 -75 6 -133 35 -93 49 -109 44 -116 -36 -3 -40 -13 -72 -26 -90 -28 -38 -26 -54 9 -79 43 -30 40 -56 -7 -64 -66 -10 -89 -7 -117 19 -38 35 -66 32 -108 -12 -49 -53 -51 -65 -18 -110 30 -38 37 -67 21 -77 -19 -12 -18 -47 1 -71 23 -30 17 -62 -17 -77 -21 -10 -30 -5 -77 37 -29 26 -59 60 -67 76 -20 43 -48 45 -134 9 -42 -17 -88 -30 -103 -28 -41 5 -63 43 -71 121 -7 76 -30 117 -66 117 -20 0 -24 -8 -35 -76 -16 -104 -48 -169 -112 -229 -117 -109 -107 -92 -115 -191 -4 -49 -12 -95 -17 -101 -30 -37 -86 3 -144 103 -25 42 -26 49 -15 80 7 19 10 38 6 43 -3 5 -29 17 -58 25 -65 19 -97 41 -97 67 0 27 -23 70 -50 92 -23 19 -24 49 -3 141 l6 29 -44 -7 c-32 -5 -55 -18 -84 -45 -22 -21 -61 -51 -88 -66 l-47 -27 21 -34 c30 -49 20 -73 -58 -140 -38 -32 -87 -76 -111 -98 l-42 -40 -73 36 -73 37 -50 -15 c-27 -8 -102 -20 -166 -26 -106 -11 -121 -10 -154 6 -37 17 -37 17 -115 -15 -75 -30 -79 -33 -79 -63 0 -24 9 -41 36 -67 49 -47 64 -79 64 -141 0 -50 2 -54 37 -78 59 -40 103 -81 103 -97 0 -8 -11 -29 -25 -47 -17 -23 -25 -46 -25 -74 0 -40 -1 -41 -27 -36 -18 3 -57 -5 -103 -22 -41 -15 -108 -30 -149 -34 -44 -5 -77 -13 -82 -21 -12 -18 -6 -60 20 -134 23 -64 36 -78 119 -126 57 -34 82 -70 82 -121 0 -27 -9 -43 -45 -78 -25 -25 -57 -61 -70 -81 -22 -31 -24 -39 -14 -68 9 -27 8 -40 -11 -83 -21 -50 -21 -52 -4 -97 23 -60 105 -140 185 -180 58 -29 69 -31 170 -31 168 0 199 -22 154 -109 -14 -28 -25 -62 -25 -76 0 -19 -9 -31 -31 -43 -60 -33 -79 -53 -79 -82 0 -71 30 -76 192 -30 175 49 183 53 239 136 72 107 103 139 153 158 39 15 47 23 69 76 21 47 34 63 64 78 152 78 330 68 422 -24 26 -26 41 -49 38 -58 -3 -8 1 -20 9 -26 11 -10 18 -8 33 11 l20 24 43 -40 c23 -22 45 -43 48 -46 3 -3 20 -14 39 -24 19 -9 77 -51 130 -93 53 -41 102 -80 109 -85 9 -7 17 -4 27 9 13 19 14 18 37 -3 14 -13 33 -23 44 -23 23 0 94 -69 94 -91 0 -8 11 -30 24 -48 29 -39 34 -65 50 -256 12 -146 14 -154 59 -255 26 -58 56 -122 67 -142 25 -46 25 -72 0 -200 -25 -128 -25 -124 5 -104 33 22 51 20 102 -9 32 -19 43 -32 43 -50 0 -13 -4 -27 -10 -30 -5 -3 -10 -24 -10 -45 0 -21 -5 -42 -11 -45 -16 -11 20 -45 48 -45 64 0 172 -84 195 -152 6 -18 22 -46 35 -62 16 -19 22 -35 17 -50 -9 -31 -34 -56 -56 -56 -23 0 -23 -12 2 -41 l20 -24 19 24 c15 20 25 23 52 18 152 -25 278 -138 383 -344 21 -43 31 -53 52 -53 17 0 35 -11 52 -32 15 -18 57 -62 93 -98 83 -83 89 -90 109 -153 14 -45 23 -56 63 -77 57 -32 152 -138 193 -216 27 -53 34 -59 65 -62 19 -2 43 -12 54 -22 11 -10 44 -28 72 -40 39 -17 60 -34 83 -68 16 -25 30 -54 30 -64 0 -27 37 -23 78 9 19 14 55 30 80 34 43 9 47 7 104 -36 33 -25 64 -45 69 -45 4 0 25 9 46 20 31 15 46 17 77 10 22 -5 43 -7 47 -4 32 19 199 -376 199 -469 0 -45 16 -49 25 -7 8 35 12 36 37 13 18 -16 21 -16 49 -1 37 22 50 17 94 -38 20 -24 47 -47 60 -50 46 -12 39 -47 -25 -112 -23 -24 -40 -45 -38 -47 2 -1 48 12 103 30 55 18 134 36 175 40 l76 7 36 -59 c102 -166 113 -213 69 -295 l-31 -57 36 -7 c22 -4 43 -17 56 -35 16 -22 25 -26 35 -18 17 15 101 -55 128 -105 11 -21 25 -34 32 -31 7 2 13 0 13 -5 0 -5 11 -17 25 -26 25 -16 27 -16 73 23 66 55 67 55 107 39 50 -21 85 -51 118 -98 23 -35 27 -51 27 -108 0 -75 19 -139 74 -248 24 -47 46 -77 62 -84 51 -23 84 -138 84 -291 l0 -97 61 -122 c59 -118 61 -123 49 -162 -6 -21 -24 -52 -39 -67 -28 -28 -28 -28 -72 -12 -57 21 -84 13 -136 -38 -39 -37 -57 -73 -34 -67 11 4 61 -68 61 -88 0 -22 -85 -187 -115 -223 -15 -17 -47 -43 -71 -57 -38 -22 -42 -28 -33 -45 7 -15 6 -40 -7 -95 l-16 -75 28 -31 c47 -50 83 -68 112 -57 14 5 51 7 84 3 49 -6 62 -4 79 12 37 33 79 102 79 129 0 16 18 50 47 88 90 118 120 144 194 172 38 15 76 36 84 48 23 33 21 239 -2 278 -17 28 -17 31 2 65 36 67 116 129 210 163 101 37 100 36 166 12 l50 -20 20 47 20 46 -27 54 c-26 50 -27 57 -15 101 9 37 9 54 0 74 -9 20 -9 40 0 83 15 75 15 71 -19 89 -17 9 -36 27 -42 40 -7 15 -41 41 -84 65 -39 21 -81 52 -92 67 -18 25 -27 28 -96 31 -72 4 -78 6 -100 36 -65 86 -68 127 -16 200 38 53 60 123 60 191 0 37 5 57 17 66 9 8 27 39 40 69 14 30 35 69 47 85 13 17 28 46 34 65 28 84 96 147 184 171 66 17 134 -27 126 -83 -2 -17 12 -29 82 -66 47 -25 104 -55 127 -67 38 -21 52 -22 147 -18 l106 6 33 -36 c18 -20 48 -65 67 -101 33 -61 34 -66 22 -100 -12 -34 -12 -40 12 -80 36 -62 230 -204 262 -192 11 4 14 26 14 90 0 98 7 120 51 170 39 45 37 65 -28 196 -42 84 -60 108 -163 210 -63 63 -125 129 -137 145 -12 17 -23 24 -23 18 0 -25 -28 -13 -38 16 -8 21 -19 31 -44 36 -35 8 -90 33 -98 45 -3 5 -40 26 -83 48 -89 47 -218 142 -256 190 -14 18 -55 50 -91 72 -75 45 -259 120 -294 120 -14 0 -46 16 -72 37 -27 20 -77 45 -114 56 -75 22 -151 59 -169 81 -8 9 -22 16 -33 16 -11 0 -45 24 -76 53 -31 29 -81 68 -110 86 -58 37 -76 62 -67 92 4 11 49 51 100 90 137 103 151 133 91 204 l-33 39 -95 -22 c-90 -20 -97 -21 -151 -5 -52 14 -65 14 -158 0 -93 -15 -104 -15 -132 0 -17 8 -60 18 -95 21 -60 5 -66 8 -126 62 -46 42 -80 63 -127 79 -68 23 -109 54 -109 82 0 12 -15 25 -42 37 -29 12 -75 53 -138 122 -52 57 -118 118 -146 136 -70 45 -100 83 -149 189 -58 124 -92 236 -100 325 -9 104 -27 162 -97 314 -52 110 -62 142 -66 199 l-4 67 -127 84 c-98 65 -166 122 -306 256 -98 95 -217 204 -263 244 -46 39 -92 84 -102 101 -25 40 -81 257 -81 310 1 86 1 122 0 174 -2 71 23 106 75 105 24 -1 36 3 36 12 0 34 23 62 49 61 24 -2 26 2 35 56 8 53 6 61 -12 80 -18 18 -25 19 -47 9 -39 -18 -45 -15 -45 22 0 64 -14 162 -19 139 l-6 -23 -33 26 c-40 32 -65 78 -57 105 6 19 14 20 63 2 8 -4 12 6 12 31 0 69 52 157 116 197 28 17 37 19 50 8 11 -9 18 -9 26 -1 7 7 25 12 41 12 25 0 28 -3 25 -27 -2 -19 -11 -30 -28 -35 -18 -6 -15 -7 14 -3 21 2 68 19 105 36 40 20 86 34 116 36 109 7 115 8 130 31 15 21 15 22 -9 22 -31 0 -32 8 -5 54 13 23 25 33 35 29 8 -3 22 2 32 10 15 14 25 13 97 -8 83 -24 100 -40 73 -72 -12 -15 -11 -15 10 -4 13 7 31 26 40 42 22 38 41 37 92 -6 56 -47 80 -78 80 -105 0 -17 5 -21 28 -18 21 2 28 9 30 30 4 36 -8 52 -90 123 -38 33 -68 66 -68 74 0 9 9 30 20 46 29 43 26 73 -7 85 -45 16 -76 34 -80 47 -3 7 21 40 53 73 31 33 55 62 53 63 -2 2 -47 16 -99 32 -52 15 -101 32 -108 38 -9 7 -12 29 -10 66 l3 56 79 42 c88 47 208 124 203 129 -2 2 -84 17 -183 34 -100 17 -205 37 -235 46 -30 9 -112 31 -184 50 -144 38 -244 82 -275 121 -32 41 -44 101 -31 151 10 40 9 46 -12 72 -13 15 -27 47 -31 69 -8 54 -25 53 -140 -4z m112 -2987 c10 -10 17 -10 31 -1 16 10 20 9 25 -3 10 -26 7 -54 -10 -79 -15 -23 -16 -23 -60 -8 -49 16 -57 40 -28 81 17 25 25 27 42 10z" className="fill-neutral-200" />
    <path d="M3412 6220 c-8 -14 -23 -20 -46 -20 -18 0 -39 -7 -46 -15 -14 -17 -40 -20 -40 -5 0 6 -15 10 -34 10 -28 0 -34 -4 -38 -25 -5 -22 -1 -26 35 -36 31 -8 46 -8 64 2 20 11 26 11 34 -1 8 -13 10 -13 19 0 7 12 12 12 21 3 10 -10 17 -5 36 22 22 32 32 85 15 85 -4 0 -13 -9 -20 -20z" className="fill-neutral-200" />
  </g>

  <g transform="translate(45.76, 22.18)">
    <circle cx="0" cy="0" r="1" className="fill-neutral-300" />
    <text x="-2.5" y="1.2" textAnchor="end" fontSize="2.5" className="fill-neutral-400 font-medium tracking-wide">Good designers</text>
  </g>

  <g transform="translate(63.66, 22.53)">
    <circle cx="0" cy="0" r="1" className="fill-neutral-300" />
    <text x="2.5" y="1.2" textAnchor="start" fontSize="2.5" className="fill-neutral-400 font-medium tracking-wide">nice wine</text>
  </g>

  {/* Florence flashing dot */}
  <g transform="translate(57.59, 47.74)">
    <circle cx="0" cy="0" r="8" className="fill-blue-500/30 animate-ping" />
    <circle cx="0" cy="0" r="4" className="fill-blue-500/50 animate-pulse" />
    <circle cx="0" cy="0" r="2" className="fill-blue-600 drop-shadow-[0_0_2px_rgba(37,99,235,0.8)]" />
    {/* Animated dashed ring */}
    <circle cx="0" cy="0" r="10" className="stroke-blue-400/60 fill-transparent stroke-[0.5] animate-[spin_4s_linear_infinite]" strokeDasharray="2 4" />
    <text x="5" y="1.5" fontSize="4" className="fill-blue-600 font-black tracking-widest uppercase font-mono drop-shadow-md">Florence</text>
  </g>

  <g transform="translate(64.69, 75.91)">
    <circle cx="0" cy="0" r="1" className="fill-neutral-300" />
    <text x="2.5" y="1.2" textAnchor="start" fontSize="2.5" className="fill-neutral-400 font-medium tracking-wide">Old romans stuff</text>
  </g>

  <g transform="translate(74.84, 91.76)">
    <circle cx="0" cy="0" r="1" className="fill-neutral-300" />
    <text x="2.5" y="1.2" textAnchor="start" fontSize="2.5" className="fill-neutral-400 font-medium tracking-wide">Good pizza here</text>
  </g>

  <g transform="translate(44.68, 104.61)">
    <circle cx="0" cy="0" r="1" className="fill-neutral-300" />
    <text x="-2.5" y="1.2" textAnchor="end" fontSize="2.5" className="fill-neutral-400 font-medium tracking-wide">nice beaches</text>
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
                  NFC-enabled stone you activate to hold a liquidity position — a constant-product
                  reserve that earns a share of the fees it generates on every trade, needing no
                  rebalancing by design — and can lose value when things don&apos;t go well.
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
