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
                Because capital remains in the rock, its reserve earns a share of the swap fees Aqua settles against it on every trade — there is no separate yield to chase, and no idle balance sitting outside the strategy. Routing idle stablecoins into lending protocols like <TooltipLink term="Aave v3" description="A decentralized non-custodial liquidity protocol." href="https://aave.com/" /> is a roadmap idea (spec 13), not something this build does: no such integration exists today.
              </p>
              <p>
                A future automation layer would manage that complexity without bothering the user, using <TooltipLink term="ERC-7579 Session Keys" description="A standard for modular smart accounts, allowing scoped permissions." href="https://erc7579.com/" /> to let a delegated agent rebalance strategies within tight, bounded limits. This is a post-hackathon roadmap item — Bank Rock runs no automated rebalancer today.
              </p>
            </div>
          </div>
          <div className="order-1 md:order-2 flex justify-center">
            <div className="w-full max-w-md aspect-square rounded-3xl relative overflow-hidden shadow-xl bg-white border border-black/5">
              <Image src="/infographics/automation_stack.jpg" alt="Automation Stack Architecture" fill className="object-cover" />
            </div>
          </div>
        </section>


        {/* Section 4: Deep Dive (Migrated from Aqua Modal) */}
        <section className="flex flex-col gap-12 mt-12 bg-neutral-50 p-8 md:p-12 rounded-3xl border border-black/5">
          <div className="flex flex-col gap-4 text-center max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold">Deep Dive: How Aqua Works</h2>
            <p className="text-ink-2 text-lg">
              Understanding the mechanics of virtual allocations and market-making without pools.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
            <div className="flex flex-col gap-4">
              <h3 className="text-xl font-bold">Your money never leaves your pocket</h3>
              <p className="text-ink-2 leading-relaxed">
                Normally, to earn fees by letting other people trade against your money, you have
                to hand that money over to a pool and hope the pool behaves.
              </p>
              <p className="text-ink-2 leading-relaxed">
                Aqua changes that. Your tokens stay in your own account. Instead of moving them,
                you make a <TooltipLink term="virtual allocation" description="A promise that a strategy may use your tokens, written down on-chain. The tokens themselves stay in your account until somebody actually trades against them." href="#" /> — a promise that says: this strategy may use my tokens, but they stay where they are until somebody actually trades.
              </p>
            </div>
            
            <div className="flex flex-col gap-4">
              <h3 className="text-xl font-bold">What that means for a rock</h3>
              <p className="text-ink-2 leading-relaxed">
                The rock holds tokens in its own account. Through Aqua it offers them to the
                market and earns a fee when someone trades, but the tokens sit inside the rock
                until that trade happens. Your <TooltipLink term="liquidity" description="The money that is ready to be traded or moved. In most of DeFi, providing liquidity means locking it away first." href="#" /> stays under your control the whole time.
              </p>
            </div>
            
            <div className="flex flex-col gap-4">
              <h3 className="text-xl font-bold">Mechanics & Risks</h3>
              <p className="text-ink-2 leading-relaxed">
                Aqua decouples the execution curve from the custody of the assets: the curve is
                on-chain and immutable, the assets never leave the maker's account. Because the tokens are not locked inside a pool, the same balance can back several
                strategies. When a swap arrives, the liquidity it needs is pulled just in time.
              </p>
              <div className="flex flex-col gap-3 mt-2">
                <div className="rounded-xl border border-black/10 p-4 bg-white shadow-sm">
                  <h4 className="text-sm font-bold text-ink">Divergence loss</h4>
                  <p className="mt-1 text-sm text-ink-2">
                    Like any market-making curve, holding both sides through a large price move
                    leaves you worse off than simply having held the winning side.
                  </p>
                </div>
                <div className="rounded-xl border border-black/10 p-4 bg-white shadow-sm">
                  <h4 className="text-sm font-bold text-ink">Smart contract risk</h4>
                  <p className="mt-1 text-sm text-ink-2">
                    The rock depends on the Aqua and SwapVM contracts. If they are compromised,
                    what the rock holds is at risk.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <h3 className="text-xl font-bold">How Aqua routes a trade</h3>
              <dl className="flex flex-col gap-4 text-base">
                <div>
                  <dt className="font-semibold text-ink">1. The Maker</dt>
                  <dd className="text-ink-2 mt-1">
                    The Rock Account itself. It holds the actual ERC-20 tokens.
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink">2. The Strategy</dt>
                  <dd className="text-ink-2 mt-1">
                    An immutable curve deployed on-chain. It decides the price at which the maker
                    is willing to buy or sell.
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink">3. The Swap</dt>
                  <dd className="text-ink-2 mt-1">
                    When someone routes a trade through the aggregator and this strategy is the
                    best price, the swap executes straight against the rock's account.
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </section>

      </article>
    </main>
  );
}
