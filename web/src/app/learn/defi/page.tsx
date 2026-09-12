import { TooltipLink } from "@/components/ui/tooltip-link";
import { Header } from "@/components/header";
import Image from "next/image";

export default function DefiPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-white text-ink pt-[var(--header-h)] pb-24">
      <Header />
      
      <article className="mx-auto w-full max-w-6xl px-[var(--gutter)] pt-12 flex flex-col gap-24">
        
        {/* Header */}
        <header className="flex flex-col gap-6 text-center items-center">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">DeFi & Aqua</h1>
          <p className="text-xl text-ink-2 max-w-2xl">
            The architecture powering Bank Rock&apos;s autonomous liquidity.
          </p>
        </header>

        {/* Section 1: Aqua / Shared Liquidity (Infographic 1) */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-24 items-center">
          <div className="flex flex-col gap-6 order-2 md:order-1">
            <h2 className="text-3xl font-bold">Liquid Intelligence</h2>
            <div className="prose prose-lg text-ink-2">
              <p>
                Bank Rock runs entirely on the <TooltipLink term="1inch Aqua Protocol" description="A shared liquidity layer allowing a single token balance to supply multiple strategies simultaneously." href="https://1inch.com/aqua/" />. Instead of depositing funds into isolated pools, the Rock Account retains full custody of its tokens. 
              </p>
              <p>
                Aqua tracks virtual allowances, executing trades peer-to-peer. A single central asset is shared across multiple strategies without being fragmented, maximizing capital efficiency.
              </p>
            </div>
          </div>
          <div className="order-1 md:order-2 flex justify-center">
            <div className="w-full max-w-md aspect-square rounded-3xl relative overflow-hidden shadow-xl bg-white border border-black/5">
              <Image src="/infographics/why_aqua.jpg" alt="Shared Liquidity Schema" fill className="object-cover" />
            </div>
          </div>
        </section>

        {/* Section 2: Architecture Setup (Infographic 2 Placeholder) */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-24 items-center">
          <div className="order-1 flex justify-center">
            <div className="w-full max-w-md aspect-square rounded-3xl relative overflow-hidden shadow-xl bg-white border border-black/5">
              <Image src="/infographics/aqua_architecture.jpg" alt="Aqua Architecture" fill className="object-cover" />
            </div>
          </div>
          <div className="flex flex-col gap-6 order-2">
            <h2 className="text-3xl font-bold">Smart Account Architecture</h2>
            <div className="prose prose-lg text-ink-2">
              <p>
                When a rock is awakened, a <TooltipLink term="Privy Wallet" description="An embedded, self-custodial wallet tied to your social login or email." href="https://docs.privy.io/" /> is generated to act as the controlling signer. 
              </p>
              <p>
                The rock itself is an <TooltipLink term="ERC-4337 Smart Account" description="A smart contract acting as a wallet, enabling gas sponsorship and session keys." href="https://eips.ethereum.org/EIPS/eip-4337" />. We use a <TooltipLink term="Paymaster" description="A service that pays for transaction gas fees on behalf of users." href="https://docs.pimlico.io/paymaster" /> to make the entire awakening process completely gasless for the user.
              </p>
            </div>
          </div>
        </section>

        {/* Section 3: The Stack (Infographic 3 Placeholder) */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-24 items-center">
          <div className="flex flex-col gap-6 order-2 md:order-1">
            <h2 className="text-3xl font-bold">Autonomous Agents</h2>
            <div className="prose prose-lg text-ink-2">
              <p>
                Because capital remains in the rock, idle stablecoins are automatically deployed into yield protocols like <TooltipLink term="Aave v3" description="A decentralized non-custodial liquidity protocol." href="https://aave.com/" /> to earn passive yield.
              </p>
              <p>
                A future automation layer would manage this complexity without bothering the user, using <TooltipLink term="ERC-7579 Session Keys" description="A standard for modular smart accounts, allowing scoped permissions." href="https://erc7579.com/" /> to let a delegated agent rebalance strategies and harvest yield within tight, bounded limits. This is a post-hackathon roadmap item — Bank Rock runs no automated rebalancer today.
              </p>
            </div>
          </div>
          <div className="order-1 md:order-2 flex justify-center">
            <div className="w-full max-w-md aspect-square rounded-3xl relative overflow-hidden shadow-xl bg-white border border-black/5">
              <Image src="/infographics/automation_stack.jpg" alt="Automation Stack Architecture" fill className="object-cover" />
            </div>
          </div>
        </section>

      </article>
    </main>
  );
}
