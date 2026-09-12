"use client";

import React, { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Mail, Link, ChevronRight, Check } from "lucide-react";

export function SocialBridge({ rockId }: { rockId: string }) {
  const { user, linkEmail, linkTwitter } = usePrivy();
  const [vanityName, setVanityName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const hasTwitter = !!user?.twitter;
  const hasEmail = !!user?.email;

  const handleSaveVanity = async () => {
    setIsSaving(true);
    // In a real app we'd POST to /api/rocks/[id]/vanity
    // which would update the Drizzle database `rocks.vanityName`
    setTimeout(() => {
      setIsSaving(false);
      setSaved(true);
    }, 800);
  };

  return (
    <div className="bg-white rounded-3xl p-6 shadow-sm border border-neutral-100 mt-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
        <Link className="w-32 h-32" />
      </div>
      
      <h3 className="text-lg font-bold tracking-tight mb-1 relative z-10">Web2.5 Social Bridge</h3>
      <p className="text-sm text-neutral-500 mb-6 max-w-md relative z-10">
        Attach your digital identity to this physical artifact. Claim your vanity URL and receive weekly Gelato yield reports.
      </p>

      <div className="grid sm:grid-cols-2 gap-6 relative z-10">
        <div className="space-y-4">
          <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Identity Providers</h4>
          
          <button
            onClick={() => { if (!hasTwitter) linkTwitter(); }}
            disabled={hasTwitter}
            className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${
              hasTwitter 
                ? "bg-neutral-50 border-neutral-100 text-neutral-500" 
                : "bg-white border-neutral-200 hover:border-[#1DA1F2] hover:shadow-md cursor-pointer group"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${hasTwitter ? "bg-neutral-200" : "bg-[#1DA1F2]/10 text-[#1DA1F2] group-hover:bg-[#1DA1F2] group-hover:text-white transition-colors"}`}>
                <Link className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="text-sm font-bold text-neutral-900">{hasTwitter ? (user?.twitter?.username || "Linked") : "Link Link / X"}</div>
                <div className="text-xs text-neutral-500">{hasTwitter ? "Verified Identity" : "Connect your social profile"}</div>
              </div>
            </div>
            {hasTwitter ? <Check className="w-5 h-5 text-green-500" /> : <ChevronRight className="w-5 h-5 text-neutral-300 group-hover:text-[#1DA1F2]" />}
          </button>

          <button
            onClick={() => { if (!hasEmail) linkEmail(); }}
            disabled={hasEmail}
            className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${
              hasEmail 
                ? "bg-neutral-50 border-neutral-100 text-neutral-500" 
                : "bg-white border-neutral-200 hover:border-black hover:shadow-md cursor-pointer group"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${hasEmail ? "bg-neutral-200" : "bg-neutral-100 text-neutral-700 group-hover:bg-black group-hover:text-white transition-colors"}`}>
                <Mail className="w-5 h-5" />
              </div>
              <div className="text-left">
                <div className="text-sm font-bold text-neutral-900">{hasEmail ? (user?.email?.address || "Linked") : "Link Email"}</div>
                <div className="text-xs text-neutral-500">{hasEmail ? "Receiving Yield Reports" : "For Gelato alerts & reports"}</div>
              </div>
            </div>
            {hasEmail ? <Check className="w-5 h-5 text-green-500" /> : <ChevronRight className="w-5 h-5 text-neutral-300 group-hover:text-black" />}
          </button>
        </div>

        <div className="space-y-4">
          <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider">Claim Vanity URL</h4>
          <div className="bg-neutral-50 rounded-2xl p-4 border border-neutral-100">
            <div className="flex items-center text-sm font-mono text-neutral-500 mb-2">
              bankrock.xyz/
              <input
                type="text"
                placeholder="your-name"
                value={vanityName}
                onChange={(e) => setVanityName(e.target.value)}
                className="bg-transparent border-b border-dashed border-neutral-300 focus:border-black outline-none text-black px-1 pb-0.5 w-32 ml-1"
                disabled={saved}
              />
            </div>
            <p className="text-xs text-neutral-400 mb-4">
              Bind a human-readable name to Rock #{rockId}.
            </p>
            <button
              onClick={handleSaveVanity}
              disabled={isSaving || saved || vanityName.length < 3}
              className="w-full bg-black text-white text-sm font-bold py-2.5 rounded-xl hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? "Minting..." : saved ? "Claimed!" : "Claim URL"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
