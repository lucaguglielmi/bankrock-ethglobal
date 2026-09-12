import { TooltipLink } from "@/components/ui/tooltip-link";
import { Header } from "@/components/header";

export default function DefiPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-white text-ink pt-[var(--header-h)] pb-24">
      <Header />
      
      <article className="mx-auto w-full max-w-4xl px-[var(--gutter)] pt-12 flex flex-col gap-16">
        
        {/* Header */}
        <header className="flex flex-col gap-6 text-center items-center">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">DeFi & Aqua</h1>
          <p className="text-xl text-ink-2 max-w-2xl">
            The architecture powering Bank Rock&apos;s autonomous liquidity.
          </p>
        </header>

        {/* Infographic Placeholder */}
        <section className="w-full aspect-[4/3] bg-ink-4/10 rounded-3xl flex items-center justify-center border border-black/5 overflow-hidden relative">
          <div className="text-ink-3 font-mono font-medium tracking-widest uppercase">
            [ Infographic 2 Placeholder ]
          </div>
        </section>

        {/* The Setup */}
        <section className="flex flex-col gap-8">
          <h2 className="text-2xl font-bold">Smart Account Architecture</h2>
          
          <div className="prose prose-lg text-ink-2 max-w-none">
            <p>
              When a rock is awakened, a <TooltipLink term="Privy Wallet" description="An embedded, self-custodial wallet tied to your social login or email." href="https://docs.privy.io/" /> is generated. This wallet acts as the controlling signer for the physical object. 
            </p>
            <p>
              The rock itself is represented by an <TooltipLink term="ERC-4337 Smart Account" description="A smart contract that acts as a user's wallet, enabling advanced features like gas sponsorship and session keys." href="https://eips.ethereum.org/EIPS/eip-4337" />. This ensures the rock&apos;s identity and asset address remain stable even if the human owner (the Privy signer) changes. We use a <TooltipLink term="Paymaster" description="A service that pays for transaction gas fees on behalf of users." href="https://docs.pimlico.io/paymaster" /> to make the entire awakening process gasless.
            </p>
          </div>

          <div className="w-full p-8 bg-ink-4/10 rounded-2xl border border-black/5 flex flex-col items-center justify-center min-h-[250px]">
             {/* D2 Placeholder */}
            <span className="text-ink-3 font-mono text-sm mb-4">[ D2 Diagram: Architecture Setup Placeholder ]</span>
          </div>
        </section>

        {/* Infographic 3 Placeholder */}
        <section className="w-full aspect-[4/3] bg-ink-4/10 rounded-3xl flex items-center justify-center border border-black/5 overflow-hidden relative mt-8">
          <div className="text-ink-3 font-mono font-medium tracking-widest uppercase">
            [ Infographic 3 Placeholder - The Stack ]
          </div>
        </section>

        {/* Aqua & Automation */}
        <section className="flex flex-col gap-8">
          <h2 className="text-2xl font-bold">Liquid Intelligence</h2>
          
          <div className="prose prose-lg text-ink-2 max-w-none">
            <p>
              Bank Rock runs entirely on the <TooltipLink term="1inch Aqua Protocol" description="A shared liquidity layer allowing a single token balance to supply multiple strategies simultaneously." href="https://1inch.com/aqua/" />. Instead of depositing funds into isolated pools, the Rock Account retains full custody of its tokens. Aqua merely tracks virtual allowances, executing trades peer-to-peer when a visitor taps the rock.
            </p>
            <p>
              Because capital remains in the rock, we automatically deploy idle stablecoins into yield protocols like <TooltipLink term="Aave v3" description="A decentralized non-custodial liquidity protocol for earning interest on deposits." href="https://aave.com/" /> to earn passive yield.
            </p>
            <p>
              To manage this complexity without bothering the user, we leverage <TooltipLink term="Gelato" description="A web3 automation network that executes smart contract functions reliably." href="https://www.gelato.network/" /> combined with <TooltipLink term="ERC-7579 Session Keys" description="A standard for modular smart accounts, allowing scoped permissions for automated agents." href="https://erc7579.com/" />. This allows the AI Oracle to automatically rebalance strategies and harvest yield securely, transforming the rock into an autonomous economic object.
            </p>
          </div>
        </section>

      </article>
    </main>
  );
}
