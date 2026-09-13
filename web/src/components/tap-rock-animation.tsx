"use client";

import * as React from "react";
import { cn } from "@/lib/ui/cn";

/**
 * The account sheet's invitation to tap (Flow A, the physical half of Bank Rock): a rock, a
 * phone that glides in and rests against it, and NFC rings leaving the contact point.
 *
 * All motion is CSS - the `--animate-tap-*` tokens in `globals.css` - applied under
 * `motion-safe:` only. The SVG's rest state *is* the touching frame (phone against the rock,
 * rings visible), so under `prefers-reduced-motion: reduce` nothing moves and nothing is
 * missing. No JavaScript runs after render.
 *
 * Colour: the rock is the brand blue from `public/brand/logo.svg`; everything else is
 * `currentColor` through the ink and link tokens, so it follows the sheet's text colours.
 */
const ROCK_BLUE = "#2855E8";

export interface TapRockAnimationProps {
  className?: string;
}

export function TapRockAnimation({ className }: TapRockAnimationProps) {
  return (
    <div className={cn("flex flex-col items-center gap-3 text-center", className)}>
      <svg
        viewBox="0 0 240 176"
        role="img"
        aria-label="A phone gliding onto a rock, with NFC rings where they touch"
        className="mx-auto block h-auto w-full max-w-64"
      >
        {/* Ground shadow */}
        <ellipse cx="92" cy="163" rx="62" ry="5" fill="currentColor" className="text-ink-4 opacity-20" />

        {/* The rock: a soft stone, brand blue, with the logo's mineral seam */}
        <path
          d="M22 118C22 88 44 60 84 56C118 52 150 70 158 100C166 128 148 152 110 158C72 164 32 152 22 118Z"
          fill={ROCK_BLUE}
        />
        <path
          d="M104 74C110 90 98 104 108 122"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          className="text-ink opacity-20"
        />

        {/* The phone: positioned at rest against the rock's right shoulder; the inner group
            is what glides, in the phone's own tilted frame so it approaches face-on. */}
        <g transform="translate(163 55) rotate(-20)">
          <g className="motion-safe:animate-tap-phone">
            <rect x="-21" y="-40" width="42" height="80" rx="8" fill="currentColor" className="text-ink" />
            <rect x="-17" y="-32" width="34" height="62" rx="4" fill="currentColor" className="text-ink-4" />
            <rect x="-6" y="-36.5" width="12" height="2" rx="1" fill="currentColor" className="text-ink-4" />
            {/* A small rock on the screen: "it opens here". */}
            <ellipse cx="0" cy="-1" rx="9" ry="7" fill="currentColor" className="text-link" />
          </g>
        </g>

        {/* NFC rings from the contact point. Rest opacity is the static frame; the
            keyframes take over when motion is allowed. */}
        <g transform="translate(156 95)" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-link">
          <circle
            r="12"
            className="origin-center [transform-box:fill-box] opacity-70 motion-safe:animate-tap-ripple"
          />
          <circle
            r="20"
            className="origin-center [transform-box:fill-box] opacity-40 motion-safe:animate-tap-ripple-late"
          />
        </g>
      </svg>

      <div className="flex flex-col gap-1">
        <h3 className="text-h3 font-semibold text-ink">Tap your rock</h3>
        <p className="text-sm text-ink-2">Hold your phone against the rock. It opens here.</p>
      </div>
    </div>
  );
}
