"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useAccount } from "wagmi";

export function LoginButton() {
  const { ready, authenticated, login, logout, user } = usePrivy();
  const { address } = useAccount();

  // Disable button if Privy SDK isn't ready
  const disableLogin = !ready || (authenticated && !user);

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
      <div className="flex items-center gap-4">
        <div className="text-sm">
          {user?.wallet?.address ? (
            <span className="font-mono text-xs opacity-70">
              {user.wallet.address.slice(0, 6)}...{user.wallet.address.slice(-4)}
            </span>
          ) : (
            <span className="opacity-70">Authenticated</span>
          )}
        </div>
        <button
          onClick={logout}
          className="px-4 py-2 rounded-full border border-black hover:bg-black hover:text-white text-sm font-medium transition-colors"
        >
          Log out
        </button>
      </div>
    );
  }

  return (
    <button
      disabled={disableLogin}
      onClick={login}
      className="px-4 py-2 rounded-full bg-black text-white hover:bg-black/80 text-sm font-medium transition-colors disabled:opacity-50"
    >
      Connect Wallet
    </button>
  );
}
