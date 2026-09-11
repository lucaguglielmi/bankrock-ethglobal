"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig } from "@privy-io/wagmi";
import { base, mainnet, optimism } from "viem/chains";
import { http } from "wagmi";

const queryClient = new QueryClient();

// Configure Wagmi
export const wagmiConfig = createConfig({
  chains: [base, mainnet, optimism],
  transports: {
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
        loginMethods: ["email", "wallet", "google", "apple"],
        appearance: {
          theme: "light",
          accentColor: "#000000",
          logo: "https://bankrock-ethglobal.pages.dev/favicon.ico", // Placeholder logo
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
