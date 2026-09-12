import Link from "next/link";
import { Lock, ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Privacy Policy — Bank Rock",
  description: "Privacy Policy detailing our zero-PII philosophy, hardware attestation telemetry, and on-chain transparency for Bank Rock.",
};

export default function PrivacyPage() {
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
            <Link href="/terms" className="hover:text-black transition-colors">
              Terms & Conditions
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
            <Lock className="w-3.5 h-3.5 text-neutral-900" />
            Privacy Architecture
          </div>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-neutral-950 mb-4">
            Privacy Policy
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
              1. Our Zero-PII Philosophy
            </h2>
            <p>
              Bank Rock is architected from the ground up on self-sovereign, decentralized principles. 
              We believe that financial tools and cryptographic artifacts should respect user anonymity:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>No Personal Identifying Information (PII):</strong> We do not require, collect, or store your legal name, 
                physical home address, phone number, government identification, or banking credentials.
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
          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-950">
              2. Data We Process and Why
            </h2>
            <p>
              To ensure the security, physical authentication, and functionality of Bank Rock artifacts, the Interface processes 
              limited technical and cryptographic data:
            </p>
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white border border-neutral-200">
                <h3 className="font-bold text-neutral-950 text-sm sm:text-base mb-1">
                  A. Cryptographic NFC Hardware Attestations
                </h3>
                <p className="text-xs sm:text-sm text-neutral-600">
                  When tapping an NTAG 424 DNA stone, your browser transmits ephemeral cryptographic parameters (tag UID, SDM read counter, 
                  and AES-128 CMAC digest). This data is processed strictly to authenticate hardware authenticity and prevent replay or cloning attacks. 
                  It contains no user identity.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-neutral-200">
                <h3 className="font-bold text-neutral-950 text-sm sm:text-base mb-1">
                  B. Public Blockchain Data
                </h3>
                <p className="text-xs sm:text-sm text-neutral-600">
                  When you connect a wallet or awaken a rock, public addresses (your EOA, ERC-4337 Safe address, or Privy embedded signer) 
                  and transaction hashes are processed to display balances and execute swaps. Because blockchains are public ledgers, 
                  all on-chain transactions are publicly broadcast and permanently verifiable by nature.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-neutral-200">
                <h3 className="font-bold text-neutral-950 text-sm sm:text-base mb-1">
                  C. Ephemeral Diagnostic Telemetry
                </h3>
                <p className="text-xs sm:text-sm text-neutral-600">
                  We maintain a short-lived in-memory ring buffer (capped at 200 log entries) recording execution latency, RPC call status, 
                  and error codes. This telemetry contains no personal data and is used solely to monitor server performance and diagnose network failures.
                </p>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-950">
              3. Local Storage and Client-Side State
            </h2>
            <p>
              We utilize browser <code className="text-xs font-mono bg-neutral-100 px-1.5 py-0.5 rounded">localStorage</code> solely to preserve 
              your local UI state, such as theme preferences and active testnet session credentials. This information never leaves your device 
              and can be cleared at any time via your browser settings.
            </p>
          </section>

          {/* Section 4 */}
          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-950">
              4. Third-Party Infrastructure Providers
            </h2>
            <p>
              Bank Rock interfaces with specialized decentralized infrastructure providers to deliver account abstraction and edge hosting:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Privy (<a href="https://privy.io" target="_blank" rel="noopener noreferrer" className="underline">privy.io</a>):</strong> Provides 
                non-custodial embedded wallet creation and passkey authentication. Privy&apos;s data handling is subject to their independent Privacy Policy.
              </li>
              <li>
                <strong>Pimlico (<a href="https://pimlico.io" target="_blank" rel="noopener noreferrer" className="underline">pimlico.io</a>):</strong> Powers 
                our ERC-4337 Paymaster and Bundler infrastructure, processing UserOperations to sponsor gas.
              </li>
              <li>
                <strong>Cloudflare (<a href="https://cloudflare.com" target="_blank" rel="noopener noreferrer" className="underline">cloudflare.com</a>):</strong> Hosts 
                our web interface at the edge, providing DDoS mitigation and network routing.
              </li>
              <li>
                <strong>RPC Node Providers:</strong> Read and write calls to Base Sepolia and Ethereum nodes are routed through public or private JSON-RPC providers.
              </li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-950">
              5. Immutable Ledger Disclaimer
            </h2>
            <p>
              Please note that by the cryptographic nature of public blockchains, any transaction, ownership transfer, or liquidity action 
              broadcast to the Base network is permanent, irreversible, and publicly accessible to anyone globally. Bank Rock has no technical 
              ability to delete, modify, or erase historical on-chain logs.
            </p>
          </section>

          {/* Section 6 */}
          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-950">
              6. Updates and Revisions
            </h2>
            <p>
              As the Bank Rock protocol and decentralized standards evolve, this Privacy Policy may be updated. Revisions will be published 
              directly to this page with an updated version timestamp. Continued use of the Interface constitutes acceptance of any updates.
            </p>
          </section>

          {/* Section 7 */}
          <section className="space-y-4">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-neutral-950">
              7. Contact & Security Inquiries
            </h2>
            <p>
              For privacy, cryptographic, or open-source inquiries, please open an issue or discussion on GitHub at{" "}
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
            <Link href="/privacy" className="hover:text-black transition-colors font-semibold text-neutral-800">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-black transition-colors">
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
