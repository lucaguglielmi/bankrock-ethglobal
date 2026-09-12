import { TooltipLink } from "@/components/ui/tooltip-link";
import { Header } from "@/components/header";

export default function RockPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-white text-ink pt-[var(--header-h)] pb-24">
      <Header />
      
      <article className="mx-auto w-full max-w-4xl px-[var(--gutter)] pt-12 flex flex-col gap-16">
        
        {/* Header */}
        <header className="flex flex-col gap-6 text-center items-center">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">The Physical Object</h1>
          <p className="text-xl text-ink-2 max-w-2xl">
            A tangible, handcrafted interface for your self-custodial liquidity.
          </p>
        </header>

        {/* Infographic Placeholder */}
        <section className="w-full aspect-[4/3] bg-ink-4/10 rounded-3xl flex items-center justify-center border border-black/5 overflow-hidden relative">
          <div className="text-ink-3 font-mono font-medium tracking-widest uppercase">
            [ Infographic 1 Placeholder ]
          </div>
        </section>

        {/* Anatomy of the Rock */}
        <section className="flex flex-col gap-8">
          <h2 className="text-2xl font-bold">Anatomy of the Rock</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-ink-4/20 rounded-2xl aspect-square flex items-center justify-center relative overflow-hidden">
              <span className="text-ink-3 font-mono text-sm">[ Photo: Rock with Silicon & NFC tag ]</span>
            </div>
            <div className="bg-ink-4/20 rounded-2xl aspect-square flex items-center justify-center relative overflow-hidden">
              <span className="text-ink-3 font-mono text-sm">[ Photo: Finger with tag for size reference ]</span>
            </div>
          </div>
          
          <div className="prose prose-lg text-ink-2 max-w-none">
            <p>
              Each Bank Rock is cast by hand, embedding a tiny passive NFC tag deep within the core. The tag carries a unique encrypted payload that links the physical object to its corresponding smart contract.
            </p>
            <p>
              Because the tag contains no private keys, the rock cannot be &quot;hacked&quot; if stolen. It acts purely as a physical intent to awaken the digital account. We use <TooltipLink term="Privy" description="A toolkit for progressive authentication and embedded wallets." href="https://docs.privy.io/" /> to authenticate you seamlessly when you tap the rock with your phone.
            </p>
          </div>
        </section>

        {/* The Activation Flow (D2 Diagram Placeholder) */}
        <section className="flex flex-col gap-8">
          <h2 className="text-2xl font-bold">The Activation Flow</h2>
          
          <div className="w-full p-8 bg-ink-4/10 rounded-2xl border border-black/5 flex flex-col items-center justify-center min-h-[300px]">
             {/* We can place the compiled D2 SVG here. Using animated dashed lines in D2 (e.g. d2 --animate) */}
            <span className="text-ink-3 font-mono text-sm mb-4">[ D2 Animated Flow Diagram Placeholder ]</span>
            <div className="text-sm text-ink-2 max-w-xl text-center">
              Tap Rock &rarr; Resolve NFC Payload &rarr; Privy Auth &rarr; <TooltipLink term="Pimlico" description="An infrastructure provider for ERC-4337 smart accounts and paymasters." href="https://docs.pimlico.io/" /> Paymaster sponsors gas &rarr; Smart Account Ownership Transferred &rarr; Aqua Liquidity Initialized.
            </div>
          </div>
        </section>

        {/* Practicality Note */}
        <section className="bg-ink-4/20 p-8 rounded-2xl border border-black/5 mt-8">
          <p className="text-ink text-sm font-medium leading-relaxed">
            <strong>Note on the Hackathon Demo:</strong> For the practicality of testing and demoing, there is currently only a single physical rock (affectionately named <em>Rock 420</em>) able to generate infinite virtual rock instances from its link. 
            <br/><br/>
            On mainnet, each rock link will be entirely unique, utilizing the more secure AWS KMS architecture already documented for our post-hackathon plans.
          </p>
        </section>

      </article>
    </main>
  );
}
