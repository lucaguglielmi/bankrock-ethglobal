import { ContactModal } from "@/components/contact-modal";

export default function Shop() {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-white text-ink">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-start sm:items-center py-16 sm:py-24">
        <h1 className="mb-6 max-w-prose text-left sm:text-center text-h1 font-extrabold">
          Financial Freedom Cannot Be Bought.
        </h1>
        <p className="mb-12 max-w-prose text-left sm:text-center text-lead text-ink-2">
          Bank Rocks are not for sale. They are a physical interface to an experimental agentic DeFi layer.
          The first OG rocks will be granted exclusively to those who barter for one, or can convince us they deserve it.
          Initially, your Bank Rock will operate on testnet. After a feedback round, we will launch and you will be able to activate your rock on mainnet.
        </p>

        <div className="grid w-full max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Option 1: OG Rock */}
          <div className="flex flex-col rounded-3xl border border-neutral-200 bg-white/50 p-8 backdrop-blur-md motion-safe:transition-all hover:border-black/20 hover:shadow-xl">
            <h2 className="mb-2 text-h2 font-bold">Get a Testnet Rock</h2>
            <div className="mb-8 flex-1 text-base text-ink-2">
              <p>You can get a physical testnet Bank Rock in two ways:</p>
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                <li>Barter something for it (value not important)</li>
                <li>Convince us you should have one</li>
              </ul>
            </div>
            <ContactModal triggerText="Convince Us / Barter" title="Claim a Testnet Rock" variant="dark" />
          </div>

          {/* Option 2: Sponsor */}
          <div className="flex flex-col rounded-3xl border border-neutral-200 bg-white/50 p-8 backdrop-blur-md motion-safe:transition-all hover:border-black/20 hover:shadow-xl">
            <h2 className="mb-2 text-h2 font-bold">Become a Sponsor</h2>
            <p className="mb-8 flex-1 text-base text-ink-2">
              Help fund the liquidity inside the Bank Rocks. We can personalize the dashboard with quests to drive volume to your protocol.
            </p>
            <ContactModal triggerText="Get in Touch" title="Sponsor Bank Rock" variant="light" />
          </div>
        </div>
      </div>
    </main>
  );
}
