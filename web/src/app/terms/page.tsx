import Link from "next/link";
import { Shield, ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Terms and Conditions — Bank Rock",
  description: "Terms of Service and Conditions governing the use of Bank Rock physical hardware, ERC-4337 accounts, and decentralized interfaces.",
};

export default function TermsPage() {
  const lastUpdated = "September 12, 2026";

  return (
    <div className="min-h-screen bg-[#fafafa] text-neutral-900 selection:bg-neutral-900 selection:text-white font-sans antialiased">
      {/* Navigation Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-neutral-200/80">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold tracking-tight text-neutral-800 hover:text-black transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Bank Rock</span>
          </Link>
          <div className="flex items-center gap-6 text-xs font-medium text-neutral-500">
            <Link href="/privacy" className="hover:text-black transition-colors">
              Privacy Policy
            </Link>
            <Link href="/shop" className="hover:text-black transition-colors">
              Artifacts
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-6 py-16 sm:py-24">
        {/* Title Section */}
        <div className="border-b border-neutral-200 pb-10 mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-neutral-100 text-neutral-700 text-xs font-mono uppercase tracking-wider mb-4">
            <Shield className="w-3.5 h-3.5 text-neutral-900" />
            Legal Protocol Specification
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-neutral-950 mb-4">
            Terms and Conditions
          </h1>
          <p className="text-sm font-mono text-neutral-400">
            Last Updated: {lastUpdated} • Version 1.0.0
          </p>
        </div>

        {/* Content Body */}
        <div className="prose prose-neutral max-w-none text-neutral-700 space-y-12 leading-relaxed text-sm sm:text-base">
          {/* Section 1 */}
          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-950">
              1. Nature of the Protocol & Interface
            </h2>
            <p>
              Bank Rock provides physical cryptographic hardware (natural stone embedded with NXP NTAG 424 DNA secure elements), 
              software interfaces, and autonomous agent protocols (the &quot;Interface&quot;) that interact with decentralized public 
              blockchains, notably Base, Ethereum, and affiliated Layer-2 networks.
            </p>
            <p>
              By accessing or using the Interface, interacting with physical Bank Rock artifacts, or invoking our Model Context 
              Protocol (MCP) endpoints, you agree to comply with and be bound by these Terms and Conditions (&quot;Terms&quot;). 
              If you do not agree, do not use the Interface or interact with Bank Rock hardware.
            </p>
          </section>

          {/* Section 2 */}
          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-950">
              2. Self-Custodial Architecture & Cryptographic Key Responsibility
            </h2>
            <p>
              Bank Rock is fundamentally non-custodial:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>No Custody of Funds:</strong> Neither Bank Rock, its developers, nor its affiliates hold custody, control, 
                or possession of any digital assets, private keys, or smart contract balances associated with your account.
              </li>
              <li>
                <strong>Account Abstraction & Signers:</strong> User accounts utilize ERC-4337 Safe Smart Account infrastructure. 
                Signers generated via passkeys, embedded wallets (powered by Privy), or external EOAs remain under your exclusive control.
              </li>
              <li>
                <strong>Irreversibility:</strong> Transactions initiated via your credentials cannot be cancelled, modified, or reversed 
                by Bank Rock once signed and broadcast to the blockchain.
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-950">
              3. Physical Hardware & Proof of Physical Possession
            </h2>
            <p>
              Each Bank Rock contains an NXP NTAG 424 DNA secure chip featuring dynamic AES-128 Cipher-based Message Authentication 
              Codes (CMAC) and monotonically incrementing read counters:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Proof of Possession:</strong> Physical possession of the rock allows generation of fresh cryptographic attestation 
                proofs. Anyone holding the physical artifact may trigger tap verifications. You are solely responsible for securing physical custody.
              </li>
              <li>
                <strong>Anti-Replay Verification:</strong> The protocol enforces strict monotonic counter checks. Replayed signatures 
                or counterfeit tags are rejected by the attestation verifier.
              </li>
              <li>
                <strong>Physical Artifact Disclaimer:</strong> Bank Rocks are crafted from natural Tuscan stone. Natural geological fissures, 
                veins, mineral inclusions, and surface variations are intrinsic characteristics of natural stone and not defects.
              </li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-950">
              4. Decentralized Protocols & Liquidity Provisions
            </h2>
            <p>
              The Interface facilitates interaction with decentralized smart contracts, including the Bank Rock Registry, Pimlico Paymasters, 
              Across Protocol cross-chain relayers, and 1inch Aqua maker reserves:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>No Guarantee of Yield or Liquidity:</strong> Yield metrics, APR percentages, and fee accrual calculations 
                are estimates derived from real-time and historical on-chain activity. Market volatility, arbitrage, and volume fluctuations 
                may cause returns to vary or result in impermanent loss.
              </li>
              <li>
                <strong>Autonomous Keeper Bots:</strong> Rebalancing actions executed via our keeper network or MCP agent tools are software 
                automations designed to balance inventory. They do not guarantee price protection or profit.
              </li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-950">
              5. No Financial, Investment, or Legal Advice
            </h2>
            <p>
              All information provided on this website, in telemetry feeds, or via the Bank Rock MCP Server is for informational, 
              experimental, and technical purposes only. Nothing contained herein constitutes investment advice, financial guidance, 
              or a recommendation to buy, sell, or hold any cryptocurrency or digital asset.
            </p>
          </section>

          {/* Section 6 */}
          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-950">
              6. Limitation of Liability & &quot;As Is&quot; Disclaimer
            </h2>
            <p className="uppercase text-xs font-mono tracking-wider text-neutral-500">
              Important: Please read carefully
            </p>
            <p>
              THE INTERFACE, PHYSICAL ARTIFACTS, SMART CONTRACTS, AND AGENT TOOLS ARE PROVIDED ON AN &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; BASIS, 
              WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. TO THE MAXIMUM EXTENT PERMITTED BY LAW, BANK ROCK DISCLAIMS 
              ALL WARRANTIES, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
            </p>
            <p>
              UNDER NO CIRCUMSTANCES SHALL BANK ROCK, ITS CREATORS, CONTRIBUTORS, OR AFFILIATES BE LIABLE FOR ANY DIRECT, INDIRECT, 
              INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES, INCLUDING LOSS OF PROFITS, DATA, CRYPTOGRAPHIC KEYS, DIGITAL ASSETS, OR 
              PHYSICAL ARTIFACT DAMAGE ARISING OUT OF OR IN CONNECTION WITH THE USE OF THIS SOFTWARE OR PROTOCOL.
            </p>
          </section>

          {/* Section 7 */}
          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-950">
              7. Contact & Governance
            </h2>
            <p>
              For protocol inquiries, security disclosures, or hardware verification questions, contact the maintainers via the 
              official repository or community channels at{" "}
              <a 
                href="https://github.com/lucaguglielmi/bankrock-ethglobal" 
                target="_blank" 
                rel="noopener noreferrer"
                className="underline font-mono text-black hover:text-neutral-600"
              >
                github.com/lucaguglielmi/bankrock-ethglobal
              </a>.
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-neutral-200 py-12 bg-white">
        <div className="max-w-4xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-neutral-400">
          <p>© {new Date().getFullYear()} Bank Rock. Built for ETHGlobal.</p>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-black transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-black transition-colors font-semibold text-neutral-800">
              Terms and Conditions
            </Link>
            <Link href="/mcp" className="hover:text-black transition-colors">
              MCP Oracle
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
