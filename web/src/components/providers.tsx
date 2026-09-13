"use client";

/**
 * Application providers (A-2, D-022, D-023).
 *
 *  - `PrivyProvider` is not rendered at all when NEXT_PUBLIC_PRIVY_APP_ID is missing or a
 *    placeholder. It used to be booted with a hardcoded placeholder app id so the SDK
 *    would initialise, which is what made the fabricated session indistinguishable from a real
 *    one. Without a valid app id the tree gets `UnavailableAuthProvider` and the UI renders an
 *    UNAVAILABLE sign-in state;
 *  - the chain list leads with Sepolia and `defaultChain` is Sepolia - Privy connects embedded
 *    wallets to the first listed chain (D-023, spec 16 §1.4);
 *  - the modal logo comes from NEXT_PUBLIC_APP_URL; the preview-domain literal is gone (D-022).
 */

import { PrivyProvider } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig } from "@privy-io/wagmi";
import { sepolia } from "viem/chains";
import {
  http,
  WagmiProvider as WagmiReadOnlyProvider,
  createConfig as createReadOnlyConfig,
} from "wagmi";
import { TooltipProvider } from "@/components/ui/tooltip";

import {
  BankRockAuthProvider,
  UnavailableAuthProvider,
  isValidPrivyAppId,
} from "@/context/auth-context";
import { AudioProvider } from "@/context/audio-context";
import { appPath } from "@/lib/chain";

const queryClient = new QueryClient();

/** Ethereum Sepolia only (D-033): the one chain this application reads from and transacts on. */
export const wagmiConfig = createConfig({
  chains: [sepolia],
  transports: {
    [sepolia.id]: http(),
  },
});

/**
 * Read-only wagmi config for the no-sign-in case. Contract *reads* do not need a wallet, and the
 * hooks that perform them must not throw just because sign-in is unavailable. Nothing can be
 * signed through it: there is no connector and no account.
 */
const readOnlyWagmiConfig = createReadOnlyConfig({
  chains: [sepolia],
  connectors: [],
  transports: {
    [sepolia.id]: http(),
  },
});

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AudioProvider>
      <TooltipProvider>{children}</TooltipProvider>
    </AudioProvider>
  );
}

export default function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

  if (!isValidPrivyAppId(appId)) {
    // No SDK, no session, no address. The sign-in capability is UNAVAILABLE (D-013).
    return (
      <QueryClientProvider client={queryClient}>
        <WagmiReadOnlyProvider config={readOnlyWagmiConfig}>
          <UnavailableAuthProvider>
            <Shell>{children}</Shell>
          </UnavailableAuthProvider>
        </WagmiReadOnlyProvider>
      </QueryClientProvider>
    );
  }

  return (
    <PrivyProvider
      appId={appId as string}
      config={{
        // D-033: Ethereum Sepolia is the only chain. Listing mainnet or an L2 here would let an
        // embedded wallet switch to a network where funds are real, for an app whose every
        // contract lives on Sepolia.
        //
        // No `loginMethods` here on purpose: Privy then offers exactly the methods enabled in the
        // dashboard (User management → Authentication). A list in code that names a method the
        // dashboard has not enabled produces "Login with Google not allowed" on the phone
        // (observed 2026-09-13), and the dashboard is the only place the methods are actually
        // configured, so it is the only place they are declared.
        defaultChain: sepolia,
        supportedChains: [sepolia],
        appearance: {
          theme: "light",
          accentColor: "#000000",
          logo: appPath("/icon-192.png"),
        },
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <BankRockAuthProvider>
            <Shell>{children}</Shell>
          </BankRockAuthProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
