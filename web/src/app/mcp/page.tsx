"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Copy,
  Check,
  Terminal,
  ArrowRight,
  Cpu,
  Layers,
  Sparkles,
  ExternalLink,
  Code,
} from "lucide-react";
import { LoginButton } from "@/components/login-button";

export default function McpPage() {
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [activeConfigTab, setActiveConfigTab] = useState<"claude" | "cursor" | "cli">("claude");
  const [copiedConfig, setCopiedConfig] = useState(false);

  const agentPrompt = `You are an autonomous DeFi asset manager connected to the Bank Rock MCP server.

MCP Server Repository: https://github.com/lucaguglielmi/bankrock-ethglobal/tree/main/mcp
Protocol: Model Context Protocol (MCP) over Stdio / SSE Transport

Bank Rocks are physical Tuscan riverbed stones embedded with NTAG 424 DNA cryptographic chips, binding physical custody directly to ERC-4337 smart accounts and Aqua AMM liquidity pools.

Your capabilities with the Bank Rock MCP tools:
1. \`get_rock_status\`({ rockId: "1" }): Inspect physical rock state, NTAG 424 DNA cryptographic authentication, ownership, and health.
2. \`analyze_strategy_yield\`({ rockId: "1" }): Query active Aqua liquidity pools, capital efficiency, and 30-day APY performance.
3. \`simulate_cross_chain_intent\`({ rockId: "1", sourceChain: "Base", amount: 100 }): Simulate cross-chain funding intents, LayerZero bridging latency, and fee execution routes.
4. \`explain_recent_fees\`({ rockId: "1" }): Retrieve on-chain receipts to break down LP fees vs. gas sponsorship.
5. \`query_logs\`({ level: "info", limit: 10, rockId: "1" }): Audit recent backend telemetry and state transitions.
6. \`optimize_idle_yield\`({ rockId: "1" }): Formulate reallocation strategies for unallocated USDC across Aave, Morpho, and Aqua pools.

Initial Instruction:
Start by inspecting the current physical and on-chain state of Rock #1 using \`get_rock_status({ rockId: "1" })\`, analyze its strategy yield with \`analyze_strategy_yield({ rockId: "1" })\`, and present an executive summary with optimization recommendations.`;

  const claudeConfig = `{
  "mcpServers": {
    "bankrock": {
      "command": "npx",
      "args": [
        "-y",
        "ts-node",
        "/path/to/bankrock-ethglobal/mcp/index.ts"
      ],
      "env": {}
    }
  }
}`;

  const cursorConfig = `{
  "mcpServers": {
    "bankrock": {
      "command": "npx",
      "args": [
        "-y",
        "ts-node",
        "./mcp/index.ts"
      ],
      "transport": "stdio"
    }
  }
}`;

  const cliCommand = `# Clone and run the Bank Rock MCP server locally
git clone https://github.com/lucaguglielmi/bankrock-ethglobal.git
cd bankrock-ethglobal/mcp
npm install
npm run dev`;

  const handleCopyPrompt = async () => {
    await navigator.clipboard.writeText(agentPrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2500);
  };

  const handleCopyConfig = async (content: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedConfig(true);
    setTimeout(() => setCopiedConfig(false), 2500);
  };

  const activeConfigContent =
    activeConfigTab === "claude"
      ? claudeConfig
      : activeConfigTab === "cursor"
      ? cursorConfig
      : cliCommand;

  const tools = [
    {
      name: "get_rock_status",
      badge: "Physical Proof",
      signature: "rockId: string",
      description:
        "Aggregates data from NTAG 424 DNA cryptographic chip, Privy, and Web3 smart accounts to return unified hardware health and verified ownership.",
      output: 'Mock: Rock 1 is healthy and active. Owner verified via SDM hardware signature.',
    },
    {
      name: "analyze_strategy_yield",
      badge: "Aqua AMM",
      signature: "rockId: string",
      description:
        "Queries live Aqua liquidity positions via Web3 and returns human-readable capital allocation, fee accrual, and rolling APY metrics.",
      output: 'Mock: Rock 1 has generated 15.2% APY in the last 30 days via Aqua Constant Product.',
    },
    {
      name: "simulate_cross_chain_intent",
      badge: "Cross-Chain",
      signature: "rockId: string, sourceChain: string, amount: number",
      description:
        "Calculates cross-chain bridging routes, LayerZero message latencies, and paymaster gas subsidies to fund the rock from any EVM L2.",
      output: 'Mock: To fund 100 USDC from Base, estimated bridge fee is 1.2 USDC taking approx 2 mins.',
    },
    {
      name: "explain_recent_fees",
      badge: "Accounting",
      signature: "rockId: string",
      description:
        "Retrieves and decodes recent on-chain events to explain transaction costs, paymaster sponsorship, and protocol fee splits in plain language.",
      output: 'Mock: Rock 1 spent 2.5 USDC on bridging fees to Optimism and 0.5 USDC on gas sponsorship.',
    },
    {
      name: "query_logs",
      badge: "Telemetry",
      signature: "level: string, limit: number, rockId?: string",
      description:
        "Queries backend telemetry, hardware attestation logs, and state transitions for full observability.",
      output: 'Mock: Retrieved 10 logs at level info for rock 1. Status: all signatures valid.',
    },
    {
      name: "optimize_idle_yield",
      badge: "Agent Strategy",
      signature: "rockId: string",
      description:
        "Scans Aave, Morpho, and Aqua liquidity pools to suggest optimal reallocation for the rock\'s idle capital.",
      output: 'Mock: Rock 1 has 500 idle USDC. Aave v3 on Base offers 8.5% APY. Recommend deposit.',
    },
  ];

  return (
    <main className="flex min-h-screen flex-col bg-white text-black font-sans selection:bg-black selection:text-white">
      {/* Navbar */}
      <nav className="w-full flex justify-between items-center z-50 p-6 md:px-12 fixed top-0 bg-white/70 backdrop-blur-md border-b border-black/5">
        <Link href="/" className="text-xl font-bold tracking-tighter hover:opacity-70 transition-opacity">
          Bank Rock
        </Link>
        <div className="flex gap-6 md:gap-8 items-center">
          <Link href="/shop" className="text-sm font-medium hover:opacity-50 transition-opacity">
            Shop
          </Link>
          <Link
            href="/mcp"
            className="text-sm font-semibold text-black border-b border-black pb-0.5"
          >
            AI Oracle
          </Link>
          <Link
            href="/rock/1"
            className="text-sm font-medium text-neutral-500 hover:text-black transition-colors flex items-center gap-1"
          >
            Live Demo
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
          <LoginButton />
        </div>
      </nav>

      {/* Content Container */}
      <div className="pt-32 pb-24 px-6 md:px-12 max-w-5xl mx-auto w-full flex flex-col gap-20">
        {/* Hero Section */}
        <section className="flex flex-col items-start gap-6">
          <div className="inline-flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-widest text-blue-600">
            <Sparkles className="w-3.5 h-3.5" />
            Model Context Protocol · Agentic Infrastructure
          </div>

          <h1 className="text-5xl md:text-7xl font-black tracking-tighter leading-none">
            Bank Rock AI Oracle &amp; MCP Server
          </h1>

          <p className="text-xl md:text-2xl text-neutral-600 font-normal leading-relaxed max-w-3xl">
            Physical Bank Rocks can be inspected, analyzed, and managed by any autonomous AI agent using the open{" "}
            <span className="text-black font-medium">Model Context Protocol</span>. Connect Claude, Cursor, Windsurf, or custom LLMs directly to cryptographic hardware state and automated Aqua liquidity strategies.
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button
              onClick={handleCopyPrompt}
              className="group flex items-center gap-2.5 bg-black text-white px-7 py-3.5 rounded-full font-semibold text-sm hover:bg-neutral-800 transition-all shadow-md active:scale-95 cursor-pointer"
            >
              {copiedPrompt ? (
                <>
                  <Check className="w-4 h-4 text-green-400" />
                  Copied Agent Prompt!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy Quick Start Prompt
                </>
              )}
            </button>

            <Link
              href="/rock/1"
              className="flex items-center gap-2 px-6 py-3.5 rounded-full border border-black/15 font-semibold text-sm hover:bg-neutral-50 transition-colors"
            >
              Inspect Rock #1 Live
              <ArrowRight className="w-4 h-4" />
            </Link>

            <a
              href="https://github.com/lucaguglielmi/bankrock-ethglobal/tree/main/mcp"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-4 py-3.5 text-neutral-500 hover:text-black font-medium text-sm transition-colors"
            >
              GitHub Server Source
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </section>

        {/* Quick Start Agent Prompt Card */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Terminal className="w-5 h-5 text-black" />
              <h2 className="text-2xl font-bold tracking-tight">Quick Start Agent Prompt</h2>
            </div>
            <span className="text-xs font-mono text-neutral-400 uppercase tracking-wider">Ready to paste into Claude or Cursor</span>
          </div>

          <div className="relative border border-neutral-200 rounded-3xl bg-neutral-900 text-neutral-100 p-6 md:p-8 shadow-xl overflow-hidden group">
            <div className="flex items-center justify-between pb-4 border-b border-neutral-800 mb-5">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500/80"></span>
                <span className="w-3 h-3 rounded-full bg-yellow-500/80"></span>
                <span className="w-3 h-3 rounded-full bg-green-500/80"></span>
                <span className="ml-2 text-xs font-mono text-neutral-400">system-prompt.txt</span>
              </div>

              <button
                onClick={handleCopyPrompt}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-medium transition-all text-neutral-200 hover:text-white cursor-pointer"
              >
                {copiedPrompt ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-green-400" />
                    <span className="text-green-400 font-semibold">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Prompt</span>
                  </>
                )}
              </button>
            </div>

            <pre className="font-mono text-xs md:text-sm text-neutral-300 leading-relaxed whitespace-pre-wrap select-all overflow-x-auto">
              {agentPrompt}
            </pre>
          </div>
        </section>

        {/* Configuration Setup Card */}
        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Code className="w-5 h-5 text-black" />
              <h2 className="text-2xl font-bold tracking-tight">Client Integration Configuration</h2>
            </div>
            <p className="text-neutral-500 text-sm">
              Add Bank Rock to your desktop client or IDE to grant the model context protocol capabilities.
            </p>
          </div>

          <div className="border border-neutral-200 rounded-3xl bg-neutral-50/70 p-6 md:p-8">
            {/* Tabs */}
            <div className="flex items-center justify-between border-b border-neutral-200 pb-4 mb-5 flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveConfigTab("claude")}
                  className={`px-4 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    activeConfigTab === "claude"
                      ? "bg-black text-white shadow-sm"
                      : "text-neutral-600 hover:text-black bg-neutral-100"
                  }`}
                >
                  Claude Desktop
                </button>
                <button
                  onClick={() => setActiveConfigTab("cursor")}
                  className={`px-4 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    activeConfigTab === "cursor"
                      ? "bg-black text-white shadow-sm"
                      : "text-neutral-600 hover:text-black bg-neutral-100"
                  }`}
                >
                  Cursor &amp; Windsurf
                </button>
                <button
                  onClick={() => setActiveConfigTab("cli")}
                  className={`px-4 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    activeConfigTab === "cli"
                      ? "bg-black text-white shadow-sm"
                      : "text-neutral-600 hover:text-black bg-neutral-100"
                  }`}
                >
                  CLI Stdio Run
                </button>
              </div>

              <button
                onClick={() => handleCopyConfig(activeConfigContent)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-neutral-300 hover:border-black text-xs font-medium transition-colors bg-white cursor-pointer"
              >
                {copiedConfig ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-green-600" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Config</span>
                  </>
                )}
              </button>
            </div>

            {/* Path Helper */}
            <div className="text-xs text-neutral-500 font-mono mb-3">
              {activeConfigTab === "claude" && (
                <>Target: <span className="text-neutral-800 font-semibold">~/Library/Application Support/Claude/claude_desktop_config.json</span></>
              )}
              {activeConfigTab === "cursor" && (
                <>Target: <span className="text-neutral-800 font-semibold">.cursor/mcp.json</span> or Windsurf MCP Settings</>
              )}
              {activeConfigTab === "cli" && (
                <>Run directly via terminal from the repository</>
              )}
            </div>

            <div className="bg-white border border-neutral-200 rounded-2xl p-5 overflow-x-auto">
              <pre className="font-mono text-xs text-neutral-800 leading-relaxed select-all">
                {activeConfigContent}
              </pre>
            </div>
          </div>
        </section>

        {/* Available MCP Tools Catalog */}
        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-black" />
              <h2 className="text-2xl font-bold tracking-tight">Available MCP Tools</h2>
            </div>
            <p className="text-neutral-500 text-sm">
              Standardized JSON-RPC 2.0 tools exposed by the Bank Rock MCP server for autonomous agents.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {tools.map((tool) => (
              <div
                key={tool.name}
                className="p-6 rounded-3xl border border-neutral-200 bg-white hover:border-black/30 hover:shadow-lg transition-all flex flex-col justify-between gap-4"
              >
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-base text-black">{tool.name}</span>
                    <span className="text-[11px] font-semibold tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-neutral-100 text-neutral-600 border border-neutral-200">
                      {tool.badge}
                    </span>
                  </div>
                  <div className="text-xs font-mono text-neutral-500 bg-neutral-50 px-2 py-1 rounded border border-neutral-100 inline-block w-fit">
                    args: {tool.signature}
                  </div>
                  <p className="text-sm text-neutral-600 leading-relaxed">
                    {tool.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-neutral-100">
                  <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider block mb-1">
                    Mock Sample Response:
                  </span>
                  <div className="text-xs font-mono text-neutral-700 bg-neutral-50 p-2 rounded-lg border border-neutral-100 truncate">
                    {tool.output}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Physical to Agent Architecture Pipeline */}
        <section className="flex flex-col gap-6 border-t border-neutral-100 pt-16">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-black" />
              <h2 className="text-2xl font-bold tracking-tight">How Tangible DeFi Meets Agentic MCP</h2>
            </div>
            <p className="text-neutral-500 text-sm">
              From Florentine riverbed stones to autonomous cross-chain execution.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-3xl bg-neutral-50 border border-neutral-100 flex flex-col gap-3">
              <div className="w-10 h-10 rounded-2xl bg-black text-white flex items-center justify-center font-bold">
                1
              </div>
              <h3 className="font-bold text-lg">Physical Attestation</h3>
              <p className="text-sm text-neutral-600 leading-relaxed">
                Tapping the rock generates an AES-128 cryptographic SUN token via the NTAG 424 DNA chip, verifying physical custody on-chain.
              </p>
            </div>

            <div className="p-6 rounded-3xl bg-neutral-50 border border-neutral-100 flex flex-col gap-3">
              <div className="w-10 h-10 rounded-2xl bg-black text-white flex items-center justify-center font-bold">
                2
              </div>
              <h3 className="font-bold text-lg">Smart Account &amp; Aqua AMM</h3>
              <p className="text-sm text-neutral-600 leading-relaxed">
                ERC-4337 Account Abstraction automatically provisions gasless accounts, deploying capital into Aqua AMM liquidity pools for automated yield.
              </p>
            </div>

            <div className="p-6 rounded-3xl bg-neutral-50 border border-neutral-100 flex flex-col gap-3">
              <div className="w-10 h-10 rounded-2xl bg-black text-white flex items-center justify-center font-bold">
                3
              </div>
              <h3 className="font-bold text-lg">Open MCP Oracle</h3>
              <p className="text-sm text-neutral-600 leading-relaxed">
                Any LLM or autonomous agent queries the rock&apos;s state via JSON-RPC tools, orchestrating rebalances and auditing yields programmatically.
              </p>
            </div>
          </div>
        </section>

        {/* Action Banner */}
        <section className="rounded-3xl bg-black text-white p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex flex-col gap-2">
            <h3 className="text-3xl font-bold tracking-tight">Experience Bank Rock</h3>
            <p className="text-neutral-400 max-w-md">
              Check out the live rock dashboard or order your own Tuscan riverbed rock with embedded cryptographic authentication.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/rock/1"
              className="bg-white text-black px-6 py-3.5 rounded-full font-bold text-sm hover:bg-neutral-200 transition-colors shadow-lg whitespace-nowrap"
            >
              View Rock #1
            </Link>
            <Link
              href="/shop"
              className="border border-white/20 text-white px-6 py-3.5 rounded-full font-bold text-sm hover:bg-white/10 transition-colors whitespace-nowrap"
            >
              Order a Rock
            </Link>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="w-full bg-black text-white py-16 px-6 md:px-12 border-t border-neutral-900 mt-auto">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
          <div>
            <div className="text-2xl font-black tracking-tighter mb-1">Bank Rock</div>
            <p className="text-xs text-neutral-500 font-mono">Tuscany, IT — 43.7696° N, 11.2558° E</p>
          </div>
          <div className="flex gap-8 text-neutral-400 font-medium text-sm">
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <Link href="/shop" className="hover:text-white transition-colors">Shop</Link>
            <Link href="/mcp" className="hover:text-white transition-colors">AI Oracle (MCP)</Link>
            <Link href="/rock/1" className="hover:text-white transition-colors">Rock #1 Demo</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
