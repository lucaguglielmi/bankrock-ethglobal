import { ContactModal } from "@/components/contact-modal";

export default function Shop() {
  return (
    <main className="flex min-h-screen flex-col bg-white text-black p-6 md:p-24 relative overflow-hidden pt-32">
      <div className="flex-1 flex flex-col items-center z-10 w-full max-w-4xl mx-auto mt-10">
        <h1 className="text-4xl md:text-5xl font-black tracking-tighter mb-6 text-center">
          Financial Freedom Cannot Be Bought.
        </h1>
        <p className="text-lg md:text-xl text-neutral-500 font-medium mb-12 text-center max-w-2xl leading-relaxed">
          Bank Rocks are not for sale. They are a physical interface to an experimental agentic DeFi layer. 
          The first OG rocks will be granted exclusively to those who can convince us they deserve one. 
          Initially, your Bank Rock will operate on testnet. After a feedback round, we will launch and you will be able to activate your rock on mainnet.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl mx-auto">
          
          {/* Option 1: OG Rock */}
          <div className="border border-neutral-200 rounded-3xl p-8 hover:border-black/20 hover:shadow-xl transition-all group bg-white/50 backdrop-blur-md relative overflow-hidden flex flex-col">
            <h2 className="text-2xl font-bold mb-2">Claim an OG Rock</h2>
            <p className="text-neutral-500 mb-8 flex-1">Tell us why you are the perfect candidate to test the physical agentic DeFi experience.</p>
            <ContactModal triggerText="Convince Us" title="Claim an OG Rock" variant="dark" />
          </div>

          {/* Option 2: Sponsor */}
          <div className="border border-neutral-200 rounded-3xl p-8 hover:border-black/20 hover:shadow-xl transition-all group bg-white/50 backdrop-blur-md relative overflow-hidden flex flex-col">
            <h2 className="text-2xl font-bold mb-2">Become a Sponsor</h2>
            <p className="text-neutral-500 mb-8 flex-1">Help fund the liquidity inside the Bank Rocks. We can personalize the dashboard with quests to drive volume to your protocol.</p>
            <ContactModal triggerText="Get in Touch" title="Sponsor Bank Rock" variant="light" />
          </div>

        </div>
      </div>
    </main>
  );
}
