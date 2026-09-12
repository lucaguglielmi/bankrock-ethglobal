"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig } from "@privy-io/wagmi";
import { baseSepolia, base, mainnet, optimism, arbitrum, polygon } from "viem/chains";
import { http } from "wagmi";
import { TooltipProvider } from "@/components/ui/tooltip";

import { BankRockAuthProvider, isValidPrivyAppId } from "@/context/auth-context";
import { AudioProvider } from "@/context/audio-context";

const queryClient = new QueryClient();

// Configure Wagmi with Base Sepolia as primary testnet + cross-chain source networks
export const wagmiConfig = createConfig({
  chains: [baseSepolia, base, arbitrum, optimism, polygon, mainnet],
  transports: {
    [baseSepolia.id]: http(),
    [base.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [polygon.id]: http(),
    [mainnet.id]: http(),
  },
});

export default function Providers({ children }: { children: React.ReactNode }) {
  const rawAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const isRealApp = isValidPrivyAppId(rawAppId);
  // Use real App ID if provided, otherwise pass mock string so SDK initializes without crashing
  const appId = isRealApp ? (rawAppId as string) : "clp1234567890abcdef123456";

  return (
    <PrivyProvider
      appId={appId}
      config={{
        defaultChain: baseSepolia,
        supportedChains: [baseSepolia, base, arbitrum, optimism, polygon, mainnet],
        loginMethods: ["email", "wallet", "google", "apple"],
        appearance: {
          theme: "light",
          accentColor: "#000000",
          logo: "https://bankrock-ethglobal.pages.dev/icon-192.png",
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
          <BankRockAuthProvider isRealPrivyConfigured={isRealApp}>
            <AudioProvider>
              <TooltipProvider>
                {children}
              </TooltipProvider>
            </AudioProvider>
          </BankRockAuthProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
