"use client";

import { useState } from "react";
import { ShieldCheck, ShieldAlert, Sparkles, RefreshCw, ChevronDown, ChevronUp, Sliders } from "lucide-react";

export type DemoScenario = "dormant" | "verified_nfc" | "cloned_nfc" | "active_maker";

interface DemoSwitcherProps {
  currentScenario: DemoScenario;
  onSelectScenario: (scenario: DemoScenario) => void;
  onReset: () => void;
}

export function DemoSwitcher({
  currentScenario,
  onSelectScenario,
  onReset,
}: DemoSwitcherProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-xl w-[calc(100%-2rem)] transition-all">
      <div className="bg-black/90 text-white backdrop-blur-md rounded-2xl shadow-2xl border border-white/10 p-2.5 sm:p-3">
        {/* Toggle Bar */}
        <div className="flex items-center justify-between px-2 cursor-pointer select-none" onClick={() => setIsExpanded(!isExpanded)}>
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-neutral-400" />
              Judge Demo Controls
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-neutral-400 hidden sm:inline">
              Scenario: <strong className="text-white capitalize">{currentScenario.replace("_", " ")}</strong>
            </span>
            <button
              type="button"
              className="text-neutral-400 hover:text-white p-1 transition-colors"
              aria-label={isExpanded ? "Collapse demo controls" : "Expand demo controls"}
            >
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Expanded Panel */}
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              onClick={() => {
                onSelectScenario("dormant");
              }}
              className={`flex flex-col items-start p-2.5 rounded-xl text-left transition-all cursor-pointer border ${
                currentScenario === "dormant"
                  ? "bg-white text-black border-white"
                  : "bg-white/5 hover:bg-white/10 text-neutral-300 border-white/5"
              }`}
            >
              <div className="text-xs font-bold font-sans">1. Dormant</div>
              <div className="text-[10px] opacity-70 leading-tight mt-0.5">
                Pre-awakening & faucet seed
              </div>
            </button>

            <button
              onClick={() => {
                onSelectScenario("verified_nfc");
              }}
              className={`flex flex-col items-start p-2.5 rounded-xl text-left transition-all cursor-pointer border ${
                currentScenario === "verified_nfc"
                  ? "bg-white text-black border-white"
                  : "bg-white/5 hover:bg-white/10 text-neutral-300 border-white/5"
              }`}
            >
              <div className="text-xs font-bold font-sans flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-green-500" />
                2. Real Tap
              </div>
              <div className="text-[10px] opacity-70 leading-tight mt-0.5">
                NTAG 424 SDM verified
              </div>
            </button>

            <button
              onClick={() => {
                onSelectScenario("cloned_nfc");
              }}
              className={`flex flex-col items-start p-2.5 rounded-xl text-left transition-all cursor-pointer border ${
                currentScenario === "cloned_nfc"
                  ? "bg-white text-black border-white"
                  : "bg-white/5 hover:bg-white/10 text-neutral-300 border-white/5"
              }`}
            >
              <div className="text-xs font-bold font-sans flex items-center gap-1">
                <ShieldAlert className="w-3 h-3 text-amber-500" />
                3. Clone Test
              </div>
              <div className="text-[10px] opacity-70 leading-tight mt-0.5">
                Spoof defense triggered
              </div>
            </button>

            <button
              onClick={() => {
                onSelectScenario("active_maker");
              }}
              className={`flex flex-col items-start p-2.5 rounded-xl text-left transition-all cursor-pointer border ${
                currentScenario === "active_maker"
                  ? "bg-white text-black border-white"
                  : "bg-white/5 hover:bg-white/10 text-neutral-300 border-white/5"
              }`}
            >
              <div className="text-xs font-bold font-sans flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-blue-400" />
                4. Live Maker
              </div>
              <div className="text-[10px] opacity-70 leading-tight mt-0.5">
                Aqua liquidity & yield
              </div>
            </button>

            <div className="col-span-2 sm:col-span-4 mt-1 flex justify-between items-center text-[10px] text-neutral-400 font-mono px-1">
              <span>Tests full physical-to-digital path</span>
              <button
                onClick={onReset}
                className="inline-flex items-center gap-1 text-neutral-300 hover:text-white transition-colors cursor-pointer py-1"
              >
                <RefreshCw className="w-3 h-3" />
                Reset Defaults
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
