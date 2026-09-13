import { Lock } from "lucide-react";
import { LegalPageHeader, LegalPageFooter } from "@/components/chrome/legal-page";
import { InlineCode } from "@/components/ui/code-block";

export const metadata = {
  title: "Privacy Policy - Bank Rock",
  description: "Privacy Policy detailing our zero-PII philosophy, hardware attestation telemetry, and on-chain transparency for Bank Rock.",
};

const SECTIONS = [
  { id: "zero-pii", label: "Our Zero-PII Philosophy" },
  { id: "data-we-process", label: "Data We Process and Why" },
  { id: "local-storage", label: "Local Storage and Client-Side State" },
  { id: "third-party", label: "Third-Party Infrastructure Providers" },
  { id: "immutable-ledger", label: "Immutable Ledger Disclaimer" },
  { id: "updates", label: "Updates and Revisions" },
  { id: "contact", label: "Contact & Security Inquiries" },
];

export default function PrivacyPage() {
  const lastUpdated = "September 13, 2026";

  return (
    <main className="min-h-dvh bg-[#fafafa] text-ink">
      <div className="mx-auto max-w-4xl py-16 sm:py-24">
        <LegalPageHeader
          icon={Lock}
          eyebrow="Privacy Architecture"
          title="Privacy Policy"
          lastUpdated={lastUpdated}
          sections={SECTIONS}
        />

        {/* Content Body */}
        <div className="prose prose-neutral max-w-none space-y-12 text-base leading-relaxed text-ink-2">
          {/* Section 1 */}
          <section id={SECTIONS[0].id} className="space-y-4">
            <h2 className="text-h2 font-bold text-ink">1. Our Zero-PII Philosophy</h2>
            <p>
              Bank Rock is architected from the ground up on self-sovereign, decentralized principles.
              We believe that financial tools and cryptographic artifacts should respect user anonymity:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>No Personal Identifying Information (PII):</strong> Using a rock does not require your legal name,
                physical home address, phone number, government identification, or banking credentials, and we do not collect them.
                A name and an email address are stored only when you submit the contact form, together with your message.
              </li>
              <li>
                <strong>No Tracking Cookies or Ad Networks:</strong> We do not deploy cross-site tracking pixels, fingerprinting scripts,
                or third-party advertisement trackers.
              </li>
              <li>
                <strong>No Data Monetization:</strong> We never sell, monetize, or lease user telemetry to data brokers or marketing firms.
              </li>
            </ul>
          </section>

          {/* Section 2 */}
          <section id={SECTIONS[1].id} className="space-y-4">
            <h2 className="text-h2 font-bold text-ink">2. Data We Process and Why</h2>
            <p>
              To ensure the security, physical authentication, and functionality of Bank Rock artifacts, the Interface processes
              limited technical and cryptographic data:
            </p>
            <div className="space-y-4">
              <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                <h3 className="mb-1 text-h3 font-semibold text-ink">A. Cryptographic NFC Hardware Attestations</h3>
                <p className="text-base text-ink-2">
                  When tapping an NTAG 424 DNA stone, your browser transmits ephemeral cryptographic parameters (tag UID, SDM read counter,
                  and AES-128 CMAC digest). This data is processed strictly to authenticate hardware authenticity and prevent replay or cloning attacks.
                  It contains no user identity.
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                <h3 className="mb-1 text-h3 font-semibold text-ink">B. Public Blockchain Data</h3>
                <p className="text-base text-ink-2">
                  When you sign in or awaken a rock, public addresses (your Privy embedded wallet address and the rock&apos;s Safe address)
                  and transaction hashes are processed to display balances and execute swaps. Because blockchains are public ledgers,
                  all on-chain transactions are publicly broadcast and permanently verifiable by nature.
                </p>
              </div>

              <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                <h3 className="mb-1 text-h3 font-semibold text-ink">C. Ephemeral Diagnostic Telemetry</h3>
                <p className="text-base text-ink-2">
                  We maintain a short-lived in-memory ring buffer (capped at 200 log entries) recording execution latency, RPC call status,
                  and error codes. This telemetry contains no personal data and is used solely to monitor server performance and diagnose network failures.
                </p>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section id={SECTIONS[2].id} className="space-y-4">
            <h2 className="text-h2 font-bold text-ink">3. Local Storage and Client-Side State</h2>
            {/* After the hackathon: a theme setting may be added; there is none today, so it is not listed here. */}
            <p>
              We use browser <InlineCode>localStorage</InlineCode> only for local state: the rock 420 stage demo
              (<InlineCode>bankrock.demo.rock420.v1</InlineCode>), your sound preference, the last sign-in method you used, whether you
              dismissed the add-to-home-screen banner, and a copy of any email address you entered in the newsletter form (the address itself
              is also sent to our server when you submit it). Privy&apos;s SDK keeps its own sign-in session in your browser. Everything else
              never leaves your device, and all of it can be cleared at any time via your browser settings.
            </p>
          </section>

          {/* Section 4 */}
          <section id={SECTIONS[3].id} className="space-y-4">
            <h2 className="text-h2 font-bold text-ink">4. Third-Party Infrastructure Providers</h2>
            <p>
              Bank Rock interfaces with specialized decentralized infrastructure providers to deliver account abstraction and edge hosting:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>Privy (<a href="https://privy.io" target="_blank" rel="noopener noreferrer" className="text-link underline">privy.io</a>):</strong> Provides
                non-custodial embedded wallet creation and passkey authentication. Privy&apos;s data handling is subject to their independent Privacy Policy.
              </li>
              <li>
                <strong>Pimlico (<a href="https://pimlico.io" target="_blank" rel="noopener noreferrer" className="text-link underline">pimlico.io</a>):</strong> Powers
                our ERC-4337 Paymaster and Bundler infrastructure, processing UserOperations to sponsor gas.
              </li>
              <li>
                <strong>Cloudflare (<a href="https://cloudflare.com" target="_blank" rel="noopener noreferrer" className="text-link underline">cloudflare.com</a>):</strong> Hosts
                our web interface at the edge, providing DDoS mitigation and network routing.
              </li>
              <li>
                <strong>RPC Node Providers:</strong> Read and write calls to Ethereum Sepolia are routed through public or private JSON-RPC providers.
              </li>
            </ul>
          </section>

          {/* Section 5 */}
          <section id={SECTIONS[4].id} className="space-y-4">
            <h2 className="text-h2 font-bold text-ink">5. Immutable Ledger Disclaimer</h2>
            <p>
              Please note that by the cryptographic nature of public blockchains, any transaction, ownership transfer, or liquidity action
              broadcast to the Ethereum network is permanent, irreversible, and publicly accessible to anyone globally. Bank Rock has no technical
              ability to delete, modify, or erase historical on-chain logs.
            </p>
          </section>

          {/* Section 6 */}
          <section id={SECTIONS[5].id} className="space-y-4">
            <h2 className="text-h2 font-bold text-ink">6. Updates and Revisions</h2>
            <p>
              As the Bank Rock protocol and decentralized standards evolve, this Privacy Policy may be updated. Revisions will be published
              directly to this page with an updated version timestamp. Continued use of the Interface constitutes acceptance of any updates.
            </p>
          </section>

          {/* Section 7 */}
          <section id={SECTIONS[6].id} className="space-y-4">
            <h2 className="text-h2 font-bold text-ink">7. Contact & Security Inquiries</h2>
            <p>
              For privacy, cryptographic, or open-source inquiries, please open an issue or discussion on GitHub at{" "}
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
          { href: "/privacy", label: "Privacy Policy", current: true },
          { href: "/terms", label: "Terms and Conditions" },
          { href: "/mcp", label: "AI Oracle" },
        ]}
      />
    </main>
  );
}
