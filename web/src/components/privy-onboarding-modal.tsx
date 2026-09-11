"use client";

import { usePrivy } from "@privy-io/react-auth";
import { X, KeyRound, Shield, Coins, ArrowRight, CheckCircle2 } from "lucide-react";

interface PrivyOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  rockId: string;
}

export function PrivyOnboardingModal({ isOpen, onClose, rockId }: PrivyOnboardingModalProps) {
  const { login } = usePrivy();

  if (!isOpen) return null;

  const handleStart = () => {
    onClose();
    login();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white text-black w-full max-w-lg rounded-3xl p-6 sm:p-8 shadow-2xl border border-neutral-100 relative max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-5 top-5 p-2 rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-black transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 bg-neutral-100 text-neutral-700 px-3 py-1 rounded-full text-xs font-semibold mb-3">
            <Shield className="w-3.5 h-3.5 text-black" />
            Privy Non-Custodial Onboarding
          </div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-neutral-950">
            Awaken Rock #{rockId}
          </h2>
          <p className="text-sm text-neutral-500 mt-1.5 leading-relaxed">
            Every physical Bank Rock is backed by a self-custodial ERC-4337 Safe account on Base Sepolia.
            No browser extensions or seed phrases required.
          </p>
        </div>

        {/* Steps Visual List */}
        <div className="space-y-4 mb-8">
          <div className="flex items-start gap-4 p-4 rounded-2xl bg-neutral-50 border border-neutral-100">
            <div className="w-10 h-10 rounded-2xl bg-black text-white flex items-center justify-center shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-black flex items-center gap-1.5">
                Passkey or Email Login
                <span className="text-[10px] bg-neutral-200 text-neutral-700 px-1.5 py-0.5 rounded font-mono">
                  Zero Seed Phrase
                </span>
              </h4>
              <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                Authenticate seamlessly via FaceID, TouchID, or email. Privy creates an embedded cryptographic signer on Base Sepolia.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 p-4 rounded-2xl bg-neutral-50 border border-neutral-100">
            <div className="w-10 h-10 rounded-2xl bg-black text-white flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-black flex items-center gap-1.5">
                ERC-4337 Safe Account
                <span className="text-[10px] bg-neutral-200 text-neutral-700 px-1.5 py-0.5 rounded font-mono">
                  Dual Gas Sponsorship
                </span>
              </h4>
              <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                Pimlico Paymaster sponsors all user operations so you never have to acquire testnet ETH to claim or manage your rock.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4 p-4 rounded-2xl bg-neutral-50 border border-neutral-100">
            <div className="w-10 h-10 rounded-2xl bg-black text-white flex items-center justify-center shrink-0">
              <Coins className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-black flex items-center gap-1.5">
                1inch Aqua Maker Reserve
                <span className="text-[10px] bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-mono">
                  Live Yield
                </span>
              </h4>
              <p className="text-xs text-neutral-500 mt-1 leading-relaxed">
                Your stone automatically seeds a USDC/WETH liquidity reserve in 1inch Aqua, collecting 0.05% maker fees from peer swaps.
              </p>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={handleStart}
          className="w-full bg-black text-white py-4 px-6 rounded-2xl font-bold text-base hover:bg-neutral-800 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg active:scale-98"
        >
          <span>Continue with Passkey / Email</span>
          <ArrowRight className="w-4 h-4" />
        </button>

        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-neutral-400">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
          <span>Secured by Privy & Safe{`{Core}`} on Base Sepolia</span>
        </div>
      </div>
    </div>
  );
}
