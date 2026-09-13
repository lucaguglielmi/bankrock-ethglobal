import Image from "next/image";
import { TooltipLink } from "@/components/ui/tooltip-link";
import { Header } from "@/components/header";

export default function RockPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-white text-ink pt-[var(--header-h)] pb-24">
      <Header />
      
      <article className="mx-auto w-full max-w-6xl px-[var(--gutter)] pt-12 flex flex-col gap-24">
        
        {/* Header */}
        <header className="flex flex-col gap-6 text-center items-center">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">The Physical Object</h1>
          <p className="text-xl text-ink-2 max-w-2xl">
            A tangible, handcrafted interface for your self-custodial liquidity.
          </p>
        </header>

        {/* Anatomy of the Rock */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-24 items-center">
          <div className="flex flex-col gap-6 order-2 md:order-1">
            <h2 className="text-3xl font-bold">Anatomy of the Rock</h2>
            <div className="prose prose-lg text-ink-2">
              <p>
                Each Bank Rock is cast by hand, embedding a tiny passive <TooltipLink term="NFC tag" description="Near Field Communication: A short-range wireless technology that lets your phone read data from the rock." href="#" /> deep within the core. The tag carries a unique encrypted payload that links the physical object to its corresponding <TooltipLink term="smart contract" description="A self-executing program running on the Ethereum blockchain that enforces the rules of the Rock." href="#" />.
              </p>
              <p>
                Because the tag contains no private keys, the rock cannot be &quot;hacked&quot; if stolen. It acts purely as a physical intent to awaken the digital account. We use <TooltipLink term="Privy" description="A toolkit for progressive authentication and embedded wallets." href="https://docs.privy.io/" /> to authenticate you seamlessly when you tap the rock with your phone.
              </p>
            </div>
            
            <div className="bg-ink-4/20 p-6 rounded-2xl border border-black/5 mt-4">
              <p className="text-ink text-sm font-medium leading-relaxed">
                <strong>Note on the Hackathon Demo:</strong> For the practicality of testing, there is currently only a single physical rock (affectionately named <em>Rock 420</em>) able to generate infinite virtual rock instances from its link. 
                <br/><br/>
                On mainnet, each rock link will be entirely unique, utilizing the more secure AWS KMS architecture.
              </p>
            </div>
          </div>

          <div className="order-1 md:order-2 flex flex-col gap-6">
            <div className="w-full max-w-md aspect-[4/3] mx-auto bg-ink-4/10 rounded-3xl flex items-center justify-center relative overflow-hidden border border-black/5 shadow-xl">
              <Image src="/infographics/photo_rock_family.jpg" alt="Seven handmade Bank Rocks: river pebbles, each with a coloured resin cap over its NFC tag" fill className="object-cover" />
            </div>
            <div className="w-full max-w-md aspect-[4/3] mx-auto bg-ink-4/10 rounded-3xl flex items-center justify-center relative overflow-hidden border border-black/5 shadow-xl">
              <Image src="/infographics/photo_nfc_tag_on_finger.jpg" alt="The bare NFC tag, antenna coil and chip, on a fingertip for scale" fill className="object-cover" />
            </div>
          </div>
        </section>

        {/* The Activation Flow */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-24 items-center">
          <div className="order-1 flex justify-center">
            <div className="w-full max-w-md aspect-square rounded-3xl relative overflow-hidden shadow-xl bg-white border border-black/5">
              <Image src="/infographics/activation_flow.jpg" alt="Activation Flow" fill className="object-cover" />
            </div>
          </div>

          <div className="flex flex-col gap-6 order-2">
            <h2 className="text-3xl font-bold">The Activation Flow</h2>
            <div className="prose prose-lg text-ink-2">
              <p>
                Tapping the rock initiates a secure handshake between the physical world and the blockchain. The NFC payload is resolved via our backend, and you are prompted to log in with <TooltipLink term="Privy" description="Embedded wallet infrastructure." href="https://docs.privy.io/" />.
              </p>
              <p>
                Once authenticated, a <TooltipLink term="Pimlico" description="An infrastructure provider for ERC-4337 smart accounts and paymasters." href="https://docs.pimlico.io/" /> paymaster sponsors the transaction fees, transferring ownership of the Rock&apos;s smart account to your new wallet address.
              </p>
              <p>
                The entire process takes seconds and requires absolutely no ETH for <TooltipLink term="gas" description="The transaction fee required to perform operations on the Ethereum network." href="#" />.
              </p>
            </div>
          </div>
        </section>

      </article>
    </main>
  );
}
