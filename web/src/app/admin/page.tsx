"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, Activity, DollarSign, Database, Server, RefreshCw } from "lucide-react";

export default function SentinelDashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.info(
      "%c[Security Note]%c We are fingerprinting (with our middle finger 🖕) against session hijacking by binding your session to your User-Agent. After the hackathon, we will have a revoke session functionality directly in this dashboard.",
      "color: #ef4444; font-weight: bold;",
      "color: inherit;"
    );

    // In a real app we would fetch from /api/admin/stats which reads from D1 rock_events
    setTimeout(() => {
      setData({
        globalTvl: 1254300.45,
        activeRocks: 42,
        gelatoTasks: 8,
        totalGasSaved: 4.25,
        recentEvents: [
          { id: 1, rockId: "12", type: "REBALANCE", status: "SUCCESS", time: "2 mins ago" },
          { id: 2, rockId: "8", type: "REBALANCE", status: "FAILED", time: "1 hour ago" },
          { id: 3, rockId: "42", type: "AWAKEN", status: "SUCCESS", time: "3 hours ago" },
        ]
      });
      setLoading(false);
    }, 1000);
  }, []);

  return (
    <div className="min-h-screen bg-[#050505] text-white p-6 md:p-12 font-sans selection:bg-blue-500/30">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-800 pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white mb-1">Sentinel Command</h1>
            <p className="text-neutral-500 font-mono text-sm">Global Bank Rock Fleet Monitoring</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/20 text-xs font-mono font-medium">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
              All Systems Operational
            </div>
          </div>
        </header>

        {loading ? (
          <div className="h-64 flex items-center justify-center">
            <RefreshCw className="w-6 h-6 animate-spin text-neutral-600" />
          </div>
        ) : (
          <>
            {/* KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-2xl">
                <div className="flex items-center gap-3 text-neutral-400 mb-4">
                  <DollarSign className="w-5 h-5" />
                  <span className="text-xs font-bold uppercase tracking-wider">Global TVL</span>
                </div>
                <div className="text-3xl font-mono font-bold tracking-tighter">${data.globalTvl.toLocaleString()}</div>
                <div className="text-xs text-green-500 font-medium mt-2">+2.4% 24h</div>
              </div>

              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-2xl">
                <div className="flex items-center gap-3 text-neutral-400 mb-4">
                  <Database className="w-5 h-5" />
                  <span className="text-xs font-bold uppercase tracking-wider">Active Rocks</span>
                </div>
                <div className="text-3xl font-mono font-bold tracking-tighter">{data.activeRocks}</div>
                <div className="text-xs text-neutral-500 mt-2 font-mono">Secured by NXP</div>
              </div>

              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-2xl">
                <div className="flex items-center gap-3 text-neutral-400 mb-4">
                  <Activity className="w-5 h-5" />
                  <span className="text-xs font-bold uppercase tracking-wider">Gelato Tasks</span>
                </div>
                <div className="text-3xl font-mono font-bold tracking-tighter">{data.gelatoTasks}</div>
                <div className="text-xs text-neutral-500 mt-2 font-mono">Monitoring deviation</div>
              </div>

              <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-2xl">
                <div className="flex items-center gap-3 text-neutral-400 mb-4">
                  <Server className="w-5 h-5" />
                  <span className="text-xs font-bold uppercase tracking-wider">Gas Sponsored</span>
                </div>
                <div className="text-3xl font-mono font-bold tracking-tighter">{data.totalGasSaved} ETH</div>
                <div className="text-xs text-neutral-500 mt-2 font-mono">via Pimlico 4337</div>
              </div>
            </div>

            {/* Live Feed */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-2xl">
              <div className="px-6 py-5 border-b border-neutral-800 flex justify-between items-center">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Live Global Feed</h3>
                <span className="text-xs text-neutral-500 font-mono">D1 Database Sync</span>
              </div>
              <div className="divide-y divide-neutral-800/50">
                {data.recentEvents.map((event: any) => (
                  <div key={event.id} className="p-4 px-6 flex items-center justify-between hover:bg-neutral-800/30 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${event.status === 'SUCCESS' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                        {event.status === 'SUCCESS' ? <ShieldAlert className="w-4 h-4 opacity-0" /> : <ShieldAlert className="w-4 h-4" />}
                        {event.status === 'SUCCESS' && <div className="w-2 h-2 rounded-full bg-green-400" />}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-neutral-200">Rock #{event.rockId} <span className="text-neutral-500 mx-2">•</span> {event.type}</div>
                        <div className="text-xs text-neutral-500 font-mono mt-1">{event.time}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-xs font-mono font-bold px-2 py-1 rounded-md ${event.status === 'SUCCESS' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                        {event.status}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
