"use client";

import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";
import { verifyNtagSignature } from "@/actions/verify-ntag";

interface RockInterfaceProps {
  rockId: string;
  urlParams: {
    e?: string;
    c?: string;
    ctr?: string;
    uid?: string;
  };
}

export function RockInterface({ rockId, urlParams }: RockInterfaceProps) {
  const { ready, authenticated, login, user } = usePrivy();
  const [step, setStep] = useState<"scanning" | "unactivated" | "authenticating" | "awakening" | "active">("scanning");
  const [verificationResult, setVerificationResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function verify() {
      try {
        const res = await verifyNtagSignature({
          e: urlParams.e,
          c: urlParams.c,
          ctr: urlParams.ctr,
          uid: urlParams.uid,
        });
        setVerificationResult(res);

        // For MVP, if it doesn't have a signature or signature fails, we still show the rock but maybe unverified
        // But let's assume we know if it's unactivated vs active from a database.
        // Mocking database check: let's say rockId "1" is unactivated, others are active.
        if (rockId === "1" || rockId === "new") {
          setStep("unactivated");
        } else {
          setStep("active");
        }
      } catch (err: any) {
        setError(err.message);
      }
    }
    verify();
  }, [rockId, urlParams]);

  const handleAwaken = async () => {
    if (!authenticated) {
      setStep("authenticating");
      login();
      return;
    }
    startAwakening();
  };

  useEffect(() => {
    if (step === "authenticating" && authenticated) {
      startAwakening();
    }
  }, [authenticated, step]);

  const startAwakening = () => {
    setStep("awakening");
    // Simulate funding and 1-click launch
    setTimeout(() => {
      setStep("active");
    }, 3000);
  };

  if (step === "scanning") {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <div className="animate-pulse w-16 h-16 bg-neutral-200 rounded-full mb-6"></div>
        <h2 className="text-2xl font-bold tracking-tight">Verifying physical rock...</h2>
      </div>
    );
  }

  if (step === "unactivated") {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center max-w-md mx-auto">
        <h1 className="text-4xl font-black tracking-tighter mb-4">Dormant Rock</h1>
        <p className="text-neutral-500 mb-8 font-medium">This Bank Rock has not been awakened yet. Claim it to setup your self-custodial liquidity strategy.</p>
        
        {verificationResult?.isAuthentic ? (
          <div className="bg-green-50 text-green-700 px-4 py-2 rounded-lg text-sm font-medium mb-8">
            ✓ Physical authenticity verified (SDM)
          </div>
        ) : urlParams.c ? (
          <div className="bg-red-50 text-red-700 px-4 py-2 rounded-lg text-sm font-medium mb-8">
            ⚠ Signature verification failed
          </div>
        ) : null}

        <button 
          onClick={handleAwaken}
          className="w-full bg-black text-white px-8 py-4 rounded-full font-bold text-lg hover:bg-neutral-800 transition-colors shadow-lg"
        >
          Awaken this rock
        </button>
      </div>
    );
  }

  if (step === "awakening") {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center max-w-md mx-auto">
        <div className="w-16 h-16 border-4 border-black border-t-transparent rounded-full animate-spin mb-6"></div>
        <h2 className="text-2xl font-bold tracking-tight mb-2">Awakening Rock...</h2>
        <p className="text-neutral-500 font-medium">Deploying Smart Account & Funding via Testnet Faucet...</p>
      </div>
    );
  }

  if (step === "active") {
    return (
      <div className="flex flex-col items-start justify-start p-6 md:p-12 max-w-3xl mx-auto w-full">
        <header className="mb-10 w-full flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-black tracking-tighter mb-2">Rock #{rockId}</h1>
            <p className="text-neutral-500 font-mono text-sm">Owner: {user?.wallet?.address ? `${user.wallet.address.slice(0, 6)}...${user.wallet.address.slice(-4)}` : '0x1234...5678'}</p>
          </div>
          {verificationResult?.isAuthentic && (
            <div className="bg-black text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest">
              Verified Physical
            </div>
          )}
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full mb-10">
          <div className="bg-neutral-50 p-6 rounded-3xl border border-neutral-100">
            <div className="text-sm font-bold text-neutral-400 uppercase tracking-widest mb-2">Available Liquidity</div>
            <div className="text-3xl font-bold">1,250.00 USDC</div>
          </div>
          <div className="bg-neutral-50 p-6 rounded-3xl border border-neutral-100">
            <div className="text-sm font-bold text-neutral-400 uppercase tracking-widest mb-2">Active Strategy</div>
            <div className="text-xl font-bold">Aqua Constant Product</div>
            <div className="text-sm text-green-600 font-medium mt-1">+12.4 USDC earned</div>
          </div>
        </div>

        <div className="flex flex-col gap-4 w-full md:w-auto">
          <button className="bg-black text-white px-8 py-4 rounded-full font-bold text-lg hover:bg-neutral-800 transition-colors shadow-lg text-center">
            Trade with this rock
          </button>
          {authenticated && (
            <button className="bg-neutral-100 text-black px-8 py-4 rounded-full font-bold text-lg hover:bg-neutral-200 transition-colors text-center border border-neutral-200">
              Give this rock
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
