import * as React from "react";
import { ShieldCheck, Fingerprint, Zap, ArrowDown } from "lucide-react";
import { cn } from "@/lib/ui/cn";

const ROCK_BLUE = "#2855E8";

export function ActivationFlowDiagram({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-4 rounded-3xl border border-border bg-white p-6 shadow-xl", className)}>
      {/* 1. Tap Animation */}
      <div className="flex w-full flex-col items-center justify-center rounded-2xl bg-muted/30 py-6">
        <svg
          viewBox="0 0 240 176"
          role="img"
          aria-label="A phone gliding onto a rock, with NFC rings where they touch"
          className="block h-auto w-48"
        >
          {/* Ground shadow */}
          <ellipse cx="92" cy="163" rx="62" ry="5" fill="currentColor" className="text-ink-4 opacity-20" />

          {/* The rock */}
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

          {/* The phone */}
          <g transform="translate(163 55) rotate(-20)">
            <g className="motion-safe:animate-tap-phone">
              <rect x="-21" y="-40" width="42" height="80" rx="8" fill="currentColor" className="text-ink" />
              <rect x="-17" y="-32" width="34" height="62" rx="4" fill="currentColor" className="text-ink-4" />
              <rect x="-6" y="-36.5" width="12" height="2" rx="1" fill="currentColor" className="text-ink-4" />
              <ellipse cx="0" cy="-1" rx="9" ry="7" fill="currentColor" className="text-link" />
            </g>
          </g>

          {/* NFC rings */}
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
      </div>

      <ArrowDown className="size-5 text-ink-4" />

      {/* 2. Encrypted Link */}
      <div className="flex w-full items-center gap-4 rounded-2xl border border-border bg-muted/20 p-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
          <ShieldCheck className="size-5" />
        </div>
        <div className="flex flex-col">
          <span className="font-semibold text-ink">Encrypted Link</span>
          <span className="text-sm text-ink-3">Verifies CMAC signature & read counter</span>
        </div>
      </div>

      <ArrowDown className="size-5 text-ink-4" />

      {/* 3. Auth Node */}
      <div className="flex w-full items-center gap-4 rounded-2xl border border-border bg-muted/20 p-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-600">
          <Fingerprint className="size-5" />
        </div>
        <div className="flex flex-col">
          <span className="font-semibold text-ink">Wallet Auth</span>
          <span className="text-sm text-ink-3">Privy embedded wallet generation</span>
        </div>
      </div>

      <ArrowDown className="size-5 text-ink-4" />

      {/* 4. Paymaster */}
      <div className="flex w-full items-center gap-4 rounded-2xl border border-border bg-muted/20 p-4">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600">
          <Zap className="size-5" />
        </div>
        <div className="flex flex-col">
          <span className="font-semibold text-ink">Gasless Setup</span>
          <span className="text-sm text-ink-3">Sponsored transaction creates the account</span>
        </div>
      </div>
    </div>
  );
}
