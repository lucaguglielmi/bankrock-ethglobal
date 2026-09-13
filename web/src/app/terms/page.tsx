import { Shield } from "lucide-react";
import { LegalPageHeader, LegalPageFooter } from "@/components/chrome/legal-page";

export const metadata = {
  title: "Terms and Conditions — Bank Rock",
  description: "Terms of Service and Conditions governing the use of Bank Rock physical hardware, ERC-4337 accounts, and decentralized interfaces.",
};

const SECTIONS = [
  { id: "nature-of-protocol", label: "Nature of the Protocol & Interface" },
  { id: "self-custodial", label: "Self-Custodial Architecture & Key Responsibility" },
  { id: "physical-hardware", label: "Physical Hardware & Proof of Possession" },
  { id: "decentralized-protocols", label: "Decentralized Protocols & Liquidity" },
  { id: "no-advice", label: "No Financial, Investment, or Legal Advice" },
  { id: "liability", label: "Limitation of Liability" },
  { id: "contact", label: "Contact & Governance" },
];

export default function TermsPage() {
  const lastUpdated = "September 13, 2026";

  return (
    <main className="min-h-dvh bg-[#fafafa] text-ink">
      <div className="mx-auto max-w-4xl py-16 sm:py-24">
        <LegalPageHeader
          icon={Shield}
          eyebrow="Legal Protocol Specification"
          title="Terms and Conditions"
          lastUpdated={lastUpdated}
          sections={SECTIONS}
        />

        {/* Content Body */}
        <div className="prose prose-neutral max-w-none space-y-12 text-base leading-relaxed text-ink-2">
          {/* Section 1 */}
          <section id={SECTIONS[0].id} className="space-y-4">
            <h2 className="text-h2 font-bold text-ink">1. Nature of the Protocol & Interface</h2>
            {/* After the hackathon: Layer-2 deployments and an agent runtime with scoped session keys (D-010) are planned; today it is Ethereum Sepolia only (D-033) and Bank Rock runs no AI of its own, so neither is claimed. */}
            <p>
              Bank Rock provides physical cryptographic hardware (natural stone embedded with NXP NTAG 424 DNA secure elements),
              software interfaces, and a read-only Model Context Protocol (MCP) server (the &quot;Interface&quot;) that interact with a
              decentralized public blockchain, currently Ethereum Sepolia only. Bank Rock runs no AI of its own; the MCP server can read a rock, never act on it.
            </p>
            <p>
              By accessing or using the Interface, interacting with physical Bank Rock artifacts, or invoking our Model Context
              Protocol (MCP) endpoints, you agree to comply with and be bound by these Terms and Conditions (&quot;Terms&quot;).
              If you do not agree, do not use the Interface or interact with Bank Rock hardware.
            </p>
          </section>

          {/* Section 2 */}
          <section id={SECTIONS[1].id} className="space-y-4">
            <h2 className="text-h2 font-bold text-ink">2. Self-Custodial Architecture & Cryptographic Key Responsibility</h2>
            <p>Bank Rock is fundamentally non-custodial:</p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>No Custody of Funds:</strong> Neither Bank Rock, its developers, nor its affiliates hold custody, control,
                or possession of any digital assets, private keys, or smart contract balances associated with your account.
              </li>
              <li>
                {/* After the hackathon: external EOAs or hardware signers as additional Safe owners are planned; today the Safe has one owner, the Privy embedded wallet. */}
                <strong>Account Abstraction & Signers:</strong> Your Rock Account is an ERC-4337 Safe Smart Account with a single owner:
                your Privy embedded wallet, which you sign into with an email or a passkey. That wallet remains under your exclusive control.
              </li>
              <li>
                <strong>Irreversibility:</strong> Transactions initiated via your credentials cannot be cancelled, modified, or reversed
                by Bank Rock once signed and broadcast to the blockchain.
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section id={SECTIONS[2].id} className="space-y-4">
            <h2 className="text-h2 font-bold text-ink">3. Physical Hardware & Proof of Physical Possession</h2>
            <p>
              Each Bank Rock contains an NXP NTAG 424 DNA secure chip featuring dynamic AES-128 Cipher-based Message Authentication
              Codes (CMAC) and monotonically incrementing read counters:
            </p>
            <ul className="list-disc space-y-2 pl-6">
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
          <section id={SECTIONS[3].id} className="space-y-4">
            <h2 className="text-h2 font-bold text-ink">4. Decentralized Protocols & Liquidity Provisions</h2>
            <p>
              The Interface facilitates interaction with decentralized smart contracts, including the Bank Rock Registry, Pimlico Paymasters,
              and 1inch Aqua maker reserves:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>No Guarantee of Returns:</strong> Fee figures shown are summed from Aqua&apos;s own on-chain events for that
                strategy, never estimated, never annualised, and never a promise of yield. Market volatility, arbitrage, and volume fluctuations
                may cause returns to vary or result in divergence loss.
              </li>
            </ul>
          </section>

          {/* Section 5 */}
          <section id={SECTIONS[4].id} className="space-y-4">
            <h2 className="text-h2 font-bold text-ink">5. No Financial, Investment, or Legal Advice</h2>
            <p>
              All information provided on this website, in telemetry feeds, or via the Bank Rock MCP Server is for informational,
              experimental, and technical purposes only. Nothing contained herein constitutes investment advice, financial guidance,
              or a recommendation to buy, sell, or hold any cryptocurrency or digital asset.
            </p>
          </section>

          {/* Section 6 */}
          <section id={SECTIONS[5].id} className="space-y-4">
            <h2 className="text-h2 font-bold text-ink">6. Limitation of Liability & &quot;As Is&quot; Disclaimer</h2>
            <p className="text-caption text-ink-3 uppercase">Important: Please read carefully</p>
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
          <section id={SECTIONS[6].id} className="space-y-4">
            <h2 className="text-h2 font-bold text-ink">7. Contact & Governance</h2>
            <p>
              For protocol inquiries, security disclosures, or hardware verification questions, contact the maintainers via the
              official repository or community channels at{" "}
              <a
                href="https://github.com/lucaguglielmi/bankrock-ethglobal"
                target="_blank"
                rel="noopener noreferrer"
                className="text-link underline"
              >
                github.com/lucaguglielmi/bankrock-ethglobal
              </a>.
            </p>
          </section>
        </div>
      </div>

      <LegalPageFooter
        links={[
          { href: "/privacy", label: "Privacy Policy" },
          { href: "/terms", label: "Terms and Conditions", current: true },
          { href: "/mcp", label: "AI Oracle" },
        ]}
      />
    </main>
  );
}
