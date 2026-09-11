"use client";

import { ExternalLink, ArrowRightLeft, Gift, Sparkles, Cpu, MapPin, CheckCircle2 } from "lucide-react";

const TX_HASH_REGEX = /^0x[0-9a-fA-F]{64}$/;

export interface ActivityEvent {
  id: string;
  type: "trade" | "transfer" | "awaken" | "hardware";
  title: string;
  description: string;
  detail?: string;
  txHash?: string;
  timestamp: string;
  blockNumber?: string;
  isOnchain?: boolean;
}

interface RockActivityProps {
  rockId: string;
  events: ActivityEvent[];
  isSyncing?: boolean;
}

export function RockActivity({ rockId, events, isSyncing = false }: RockActivityProps) {
  return (
    <div className="w-full mt-12 pt-10 border-t border-neutral-100">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
        <div>
          <h2 className="text-xl font-black tracking-tight">Provenance & On-Chain Activity</h2>
          <p className="text-xs text-neutral-500 font-medium">
            Cryptographic lineage from Tuscan riverbed to Base Sepolia smart account #{rockId}.
          </p>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono text-neutral-500 bg-neutral-50 px-3 py-1.5 rounded-full border border-neutral-200 self-start sm:self-auto">
          <span className={`w-1.5 h-1.5 rounded-full ${isSyncing ? "bg-amber-500 animate-spin" : "bg-green-500 animate-pulse"}`} />
          <span>{isSyncing ? "Syncing On-Chain..." : "Base Sepolia Indexer"}</span>
        </div>
      </div>

      {/* Hardware & Origin Badge */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        <div className="bg-neutral-50 rounded-2xl p-3.5 border border-neutral-100 flex items-start gap-3">
          <MapPin className="w-4 h-4 text-neutral-500 mt-0.5 shrink-0" />
          <div>
            <div className="text-xs font-bold text-neutral-800">Physical Origin</div>
            <div className="text-xs text-neutral-500 font-mono mt-0.5">Arno River, Florence, IT (43.77° N, 11.25° E)</div>
          </div>
        </div>

        <div className="bg-neutral-50 rounded-2xl p-3.5 border border-neutral-100 flex items-start gap-3">
          <Cpu className="w-4 h-4 text-neutral-500 mt-0.5 shrink-0" />
          <div>
            <div className="text-xs font-bold text-neutral-800">Hardware Attestation</div>
            <div className="text-xs text-neutral-500 font-mono mt-0.5">NXP NTAG 424 DNA • AES-128 SDM</div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="relative border-l-2 border-neutral-100 ml-4 space-y-6">
        {events.map((event) => (
          <div key={event.id} className="relative pl-6 group">
            {/* Timeline bullet icon */}
            <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-white border-2 border-black flex items-center justify-center">
              {event.type === "trade" && <ArrowRightLeft className="w-2 h-2 text-black" />}
              {event.type === "transfer" && <Gift className="w-2 h-2 text-black" />}
              {event.type === "awaken" && <Sparkles className="w-2 h-2 text-black" />}
              {event.type === "hardware" && <CheckCircle2 className="w-2 h-2 text-black" />}
            </div>

            <div className="bg-neutral-50/70 hover:bg-neutral-50 p-4 rounded-2xl border border-neutral-100 transition-colors">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-sm font-bold tracking-tight text-black">{event.title}</span>
                <span className="text-[11px] font-mono text-neutral-400">{event.timestamp}</span>
              </div>

              <p className="text-xs text-neutral-600 font-medium leading-relaxed">
                {event.description}
              </p>

              {event.detail && (
                <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-green-700 bg-green-50 px-2.5 py-1 rounded-lg border border-green-100">
                  <Sparkles className="w-3 h-3 text-green-600" />
                  {event.detail}
                </div>
              )}

              {event.txHash && TX_HASH_REGEX.test(event.txHash) && (
                <div className="mt-3 pt-2.5 border-t border-neutral-200/60 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-neutral-400 font-mono">
                      {event.isOnchain ? "On-Chain Tx" : "UserOperation"}
                    </span>
                    {event.isOnchain && (
                      <span className="bg-blue-50 text-blue-700 text-[10px] font-bold px-1.5 py-0.5 rounded font-mono">
                        BaseScan Verified
                      </span>
                    )}
                  </div>
                  <a
                    href={`https://sepolia.basescan.org/tx/${encodeURIComponent(event.txHash)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-mono text-[11px] text-neutral-700 hover:text-black font-medium hover:underline"
                  >
                    <span>{event.txHash.slice(0, 10)}...{event.txHash.slice(-8)}</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
