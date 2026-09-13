"use client";
import { Header } from "@/components/header";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export default function SecurityPage() {
  return (
    <main className="flex min-h-dvh flex-col bg-white text-ink pt-[var(--header-h)] pb-24">
      <Header />
      
      <article className="mx-auto w-full max-w-3xl px-[var(--gutter)] pt-12 flex flex-col gap-16">
        
        {/* Header */}
        <header className="flex flex-col gap-6 text-center items-center">
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">Security & Privacy</h1>
          <p className="text-xl text-ink-2 max-w-2xl">
            True self-custody and transparent telemetry. Safe by design.
          </p>
        </header>

        {/* Features Accordion */}
        <section className="flex flex-col gap-8">
          <h2 className="text-2xl font-bold">How we protect you</h2>
          
          <Accordion className="w-full">
            <AccordionItem value="item-1">
              <AccordionTrigger className="text-lg font-semibold">1. Hardware Independence (No private keys on NFC)</AccordionTrigger>
              <AccordionContent className="text-ink-2 text-base leading-relaxed">
                The NFC tag inside the Bank Rock is entirely passive. It contains a signed URL payload to identify the object, but it <strong>never</strong> stores a private key. This means if someone steals your physical rock, they cannot access your funds. Ownership is dictated by the smart contract, controlled by your authenticated wallet.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-2">
              <AccordionTrigger className="text-lg font-semibold">2. Self-Custody First</AccordionTrigger>
              <AccordionContent className="text-ink-2 text-base leading-relaxed">
                Bank Rock does not hold your funds. Using the 1inch Aqua protocol, tokens remain in the Rock&apos;s ERC-4337 smart account. Our servers cannot initiate a withdrawal or transfer. You, as the authenticated Privy signer, are the only entity capable of moving funds out of the rock.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-3">
              <AccordionTrigger className="text-lg font-semibold">3. The AI Oracle is read-only</AccordionTrigger>
              <AccordionContent className="text-ink-2 text-base leading-relaxed">
                The AI Oracle (MCP) never moves your funds. It can read your rock&apos;s live owner, reserve balances and fees straight from chain and answer questions about them, and that is all it can do — it holds no key, session or otherwise, and cannot sign a transaction on your behalf. Scoped ERC-7579 session keys for a bounded, agent-driven rebalancer are on the post-hackathon roadmap (spec 13), not something this build does today.
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="item-4">
              <AccordionTrigger className="text-lg font-semibold">4. Transparent Telemetry</AccordionTrigger>
              <AccordionContent className="text-ink-2 text-base leading-relaxed">
                We believe in full observability. Our MCP server exposes raw, structured server logs to you and your AI agents. You can trace exactly what the backend did during any transaction, removing the opaque &quot;black box&quot; nature of traditional web apps.
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>

        {/* Future Ideas Voting & Plans */}
        <section className="flex flex-col gap-8 bg-ink-4/10 p-6 sm:p-8 rounded-3xl border border-black/5">
          <div className="flex flex-col gap-4">
            <h3 className="text-xl font-bold">How do you feel?</h3>
            <p className="text-ink-2">
              Do you think Bank Rock is secure enough as it is? Would you trust it to hold 20% of your portfolio in its current status?
            </p>
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-2">
              <Button variant="outline" size="sm" className="rounded-full">👍 Absolutely</Button>
              <Button variant="outline" size="sm" className="rounded-full">😐 Maybe</Button>
              <Button variant="outline" size="sm" className="rounded-full">👎 No way</Button>
            </div>
          </div>

          <hr className="border-black/5" />

          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <h3 className="text-xl font-bold">Future Plans</h3>
              <span className="rounded-full bg-blue-100 px-3 py-0.5 text-xs font-semibold text-blue-700 uppercase tracking-widest">Coming soon</span>
            </div>
            <ul className="flex flex-col gap-4 text-base text-ink-2 mt-2">
              <li className="flex gap-3">
                <span className="text-ink font-bold mt-0.5">•</span>
                <span><strong>Hardware Wallet Integration:</strong> Ledger-level login to secure large holdings with physical device approval.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-ink font-bold mt-0.5">•</span>
                <span><strong>Transaction PINs:</strong> Require a secret code or biometric approval on your device for high-value operations.</span>
              </li>
              <li className="flex gap-3">
                <span className="text-ink font-bold mt-0.5">•</span>
                <span><strong>Dynamic NFC Payloads:</strong> Implementing AWS Nitro Enclaves to generate uniquely encrypted, rotating NFC URLs on-the-fly, making URL cloning impossible.</span>
              </li>
            </ul>
          </div>
        </section>

        {/* Suggestions Form */}
        <section className="flex flex-col gap-6">
          <div className="space-y-2">
            <h3 className="text-xl font-bold">Find a flaw? Tell us.</h3>
            <p className="text-ink-2">
              If you see something we aren&apos;t doing well, drop a message below.
            </p>
          </div>
          
          <form className="flex flex-col gap-4 max-w-lg" onSubmit={(e) => e.preventDefault()}>
            <Input 
              type="text" 
              placeholder="Email or Telegram handle" 
              className="bg-ink-4/10 border-black/10 focus-visible:ring-ink"
              required
            />
            <Textarea 
              placeholder="Your feedback (plain text only)" 
              className="bg-ink-4/10 border-black/10 focus-visible:ring-ink min-h-[120px]"
              required
            />
            <Button type="submit" className="w-fit">Submit Feedback</Button>
          </form>
        </section>

        {/* Conclusion */}
        <section className="mt-8 border-t border-black/10 pt-12">
          <p className="text-lg font-medium text-ink-2 italic">
            This page only exists because we are looking for our own Mr. Robot. If security is your thing and you want to help, please get in touch. We have great ambitions, especially in terms of smart contracts. Just chat to us!
          </p>
        </section>

      </article>
    </main>
  );
}
