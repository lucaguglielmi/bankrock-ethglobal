"use client";

/**
 * The judge scenario switcher (spec 15 D-013 / F-7; spec 17 Part 5).
 *
 * What it used to do: it rendered on every rock page in every environment and set
 * `verificationResult = { isAuthentic: true }`, which painted the green "Verified Physical"
 * badge with no verifier involved. One scenario also set the reserve to 1,250 USDC and fees to
 * 12.4.
 *
 * What it does now: nothing but choose which `SIMULATED`-badged sample view is displayed, and
 * only when `NEXT_PUBLIC_DEMO_MODE=true`. It cannot touch the attestation state and it cannot
 * touch a balance — it has no callback that could. It lives in the one `BottomDock` (§4.9), so
 * it can no longer sit on top of the page's primary action.
 */

import { useState } from "react";
import { ChevronDown, ChevronUp, Sliders } from "lucide-react";
import { BottomDockSlot } from "@/components/ui/bottom-dock";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/ui/cn";
import { isDemoMode } from "@/lib/demo";

/** Which sample view is displayed. Not a rock state, not a verification result. */
export type DemoScenario = "dormant" | "awake" | "handover" | "archived";

const SCENARIOS: Array<{ id: DemoScenario; label: string; hint: string }> = [
  { id: "dormant", label: "Dormant", hint: "Before anyone takes it" },
  { id: "awake", label: "Awake", hint: "Holding two tokens" },
  { id: "handover", label: "Handover", hint: "Given, not yet collected" },
  { id: "archived", label: "Retired", hint: "History only" },
];

export interface DemoSwitcherProps {
  currentScenario: DemoScenario;
  onSelectScenario: (scenario: DemoScenario) => void;
}

export function DemoSwitcher({ currentScenario, onSelectScenario }: DemoSwitcherProps) {
  const [isExpanded, setExpanded] = useState(false);

  if (!isDemoMode()) return null;

  const current = SCENARIOS.find((scenario) => scenario.id === currentScenario);

  return (
    <BottomDockSlot>
      <div className="mx-auto w-full max-w-3xl rounded-2xl border border-border bg-background shadow-lg">
        <div className="flex min-h-11 items-center justify-between gap-2 px-3 py-1">
          <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-ink-2">
            <Sliders aria-hidden className="size-4 shrink-0" />
            <span className="truncate">Sample view: {current?.label ?? "None"}</span>
          </span>
          <IconButton
            aria-label={isExpanded ? "Hide sample views" : "Choose a sample view"}
            aria-expanded={isExpanded}
            onClick={() => setExpanded((open) => !open)}
          >
            {isExpanded ? <ChevronDown /> : <ChevronUp />}
          </IconButton>
        </div>

        {isExpanded ? (
          <div className="flex flex-col gap-2 border-t border-border p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              {SCENARIOS.map((scenario) => {
                const isActive = scenario.id === currentScenario;
                return (
                  <button
                    key={scenario.id}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => onSelectScenario(scenario.id)}
                    className={cn(
                      "flex min-h-12 flex-col justify-center rounded-xl border px-3 py-2 text-left motion-safe:transition-colors",
                      isActive
                        ? "border-ink bg-ink text-background"
                        : "border-border bg-background text-ink-2 hover:bg-muted",
                    )}
                  >
                    <span className="text-sm font-semibold">{scenario.label}</span>
                    <span
                      className={cn(
                        "text-caption",
                        isActive ? "text-background/80" : "text-ink-3",
                      )}
                    >
                      {scenario.hint}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-caption text-ink-3">
              Chooses which sample view is shown. It cannot verify a tap or set a balance.
            </p>
          </div>
        ) : null}
      </div>
    </BottomDockSlot>
  );
}
