"use client";

import { Sparkles, Activity, ShieldCheck, Database, Zap } from "lucide-react";

interface AIStrategySimulatorProps {
  rockId: string;
}

export function AIStrategySimulator({ rockId }: AIStrategySimulatorProps) {
  if (rockId !== "420") return null;

  return (
    <div className="w-full bg-black text-white rounded-3xl p-6 md:p-8 mb-10 shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 p-32 opacity-10 pointer-events-none">
        <Sparkles className="w-48 h-48" />
      </div>
      
      <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight mb-2 flex items-center gap-2">
            <Zap className="w-6 h-6 text-yellow-400" />
            AI Strategy Oracle Live
          </h2>
          <p className="text-neutral-400 text-sm max-w-lg">
            This Rock is actively managed by an autonomous agent via MCP. Off-chain data is continually analyzed to adjust on-chain parameters.
          </p>
        </div>
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2 flex items-center gap-3">
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <span className="text-xs font-mono font-medium text-green-400">Oracle Connected</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
          <div className="text-neutral-400 text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4" /> Current Market Volatility
          </div>
          <div className="text-2xl font-black font-mono">14.2%</div>
          <div className="text-xs text-neutral-500 mt-2">Analyzed from Binance/Coinbase feeds</div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
          <div className="text-neutral-400 text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
            <Database className="w-4 h-4" /> Gelato Threshold
          </div>
          <div className="text-2xl font-black font-mono">5.00%</div>
          <div className="text-xs text-neutral-500 mt-2">Active rebalancing trigger</div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
          <div className="text-neutral-400 text-xs font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" /> AI Risk Posture
          </div>
          <div className="text-2xl font-black font-mono text-blue-400">Conservative</div>
          <div className="text-xs text-neutral-500 mt-2">Prioritizing impermanent loss protection</div>
        </div>
      </div>
    </div>
  );
}
