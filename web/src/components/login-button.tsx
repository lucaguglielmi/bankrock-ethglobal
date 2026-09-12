"use client";

import { useState } from "react";
import { useAuth } from "@/context/auth-context";
import { Check, Copy } from "lucide-react";

export function LoginButton() {
  const { ready, authenticated, login, logout, user, address, isEmbedded, isDemoMode, lastLoginMethod } = useAuth();
  const [copied, setCopied] = useState(false);

  const activeAddress = address || user?.wallet?.address;

  const handleCopy = () => {
    if (activeAddress) {
      navigator.clipboard.writeText(activeAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!ready) {
    return (
      <button
        disabled
        className="px-4 py-2 rounded-full border border-black/10 bg-black/5 text-sm font-medium transition-colors"
      >
        Loading...
      </button>
    );
  }

  if (authenticated) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 bg-neutral-100/90 border border-neutral-200/80 rounded-full px-3 py-1.5 text-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" title="Base Sepolia Testnet" />
          {isEmbedded && (
            <span
              className="text-[10px] font-mono bg-black text-white px-1.5 py-0.5 rounded font-bold uppercase tracking-wider"
              title={isDemoMode ? "High-fidelity Demo Embedded Wallet on Base Sepolia" : "Privy Embedded Signer"}
            >
              Embedded
            </span>
          )}
          {activeAddress ? (
            <span className="font-mono text-neutral-800 font-medium">
              {activeAddress.slice(0, 5)}...{activeAddress.slice(-4)}
            </span>
          ) : (
            <span className="text-neutral-600 font-medium">Authenticated</span>
          )}
          {activeAddress && (
            <button
              onClick={handleCopy}
              className="text-neutral-400 hover:text-black transition-colors cursor-pointer p-0.5"
              title="Copy address"
            >
              {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
            </button>
          )}
        </div>
        <button
          onClick={() => logout()}
          className="px-3.5 py-1.5 rounded-full border border-neutral-300 hover:border-black text-xs font-medium transition-colors cursor-pointer"
        >
          Log out
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        onClick={() => login()}
        className="px-4 py-2 rounded-full bg-black text-white hover:bg-black/80 text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
      >
        Connect Wallet
      </button>
      {lastLoginMethod && (
        <span className="text-[10px] text-neutral-400 font-medium tracking-wide">
          Last used: <span className="capitalize font-bold text-neutral-600">{lastLoginMethod}</span>
        </span>
      )}
    </div>
  );
}
