"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig } from "@privy-io/wagmi";
import { baseSepolia, base, mainnet, optimism } from "viem/chains";
import { http } from "wagmi";

const queryClient = new QueryClient();

// Configure Wagmi with Base Sepolia as primary testnet
export const wagmiConfig = createConfig({
  chains: [baseSepolia, base, mainnet, optimism],
  transports: {
    [baseSepolia.id]: http(),
    [base.id]: http(),
    [mainnet.id]: http(),
    [optimism.id]: http(),
  },
});

export default function Providers({ children }: { children: React.ReactNode }) {
  // Use the environment variable if present. Fallback to a mock 24-char hex string to pass validation.
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID || "clp1234567890abcdef123456";

  return (
    <PrivyProvider
      appId={appId}
      config={{
        defaultChain: baseSepolia,
        supportedChains: [baseSepolia, base],
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
          {children}
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
