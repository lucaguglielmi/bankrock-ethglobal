"use client";

/**
 * The MCP page (spec 17 Part 5 "MCP page"; spec 15 M-1, M-2, D-004, D-013).
 *
 * Two changes beyond typography. First, the per-tool "Mock Sample Response" blocks are gone:
 * they presented hardcoded fiction — "15.2% APY in the last 30 days" — as though the server had
 * measured it, which spec 15 calls out as worse than hallucination because the numbers are
 * stable and therefore credible. The page now states once that the tools are not connected to
 * live data. Second, config snippets and the config path go through `<CodeBlock>`, so the long
 * unbreakable path wraps instead of pushing the page sideways (L-7).
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Copy, Check, Cpu, ExternalLink, Layers, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { isDemoMode } from "@/lib/demo";
import { cn } from "@/lib/ui/cn";

const REPO_URL = "https://github.com/lucaguglielmi/bankrock-ethglobal/tree/main/mcp";

const AGENT_PROMPT = `You are connected to the Bank Rock MCP server.

A Bank Rock is a physical stone with an NTAG 424 DNA chip in it. Tapping the stone proves
physical possession; the stone's account holds two tokens and anyone may trade against them.

Tools:
1. get_rock_status({ rockId }) — lifecycle state, owner and account address.
2. get_strategy_fees({ rockId }) — the strategy a rock runs and the fees it has recorded.
3. simulate_cross_chain_intent({ rockId, sourceChain, amount }) — a funding route, simulated.
4. explain_recent_fees({ rockId }) — recorded fees, in plain language.
5. query_logs({ level, limit, rockId }) — recent server-side events.
6. optimize_idle_yield({ rockId }) — suggestions for capital that is sitting idle.

Start by reading the rock's state, then say what you can and cannot tell from it. Do not state a
figure the tools did not return.`;

const CONFIGS = {
  claude: {
    label: "Claude Desktop",
    path: "~/Library/Application Support/Claude/claude_desktop_config.json",
    snippet: `{
  "mcpServers": {
    "bankrock": {
      "command": "npx",
      "args": ["-y", "ts-node", "/path/to/bankrock-ethglobal/mcp/index.ts"],
      "env": {}
    }
  }
}`,
  },
  cursor: {
    label: "Cursor and Windsurf",
    path: ".cursor/mcp.json",
    snippet: `{
  "mcpServers": {
    "bankrock": {
      "command": "npx",
      "args": ["-y", "ts-node", "./mcp/index.ts"],
      "transport": "stdio"
    }
  }
}`,
  },
  cli: {
    label: "Terminal",
    path: "Run it from a checkout of the repository",
    snippet: `git clone https://github.com/lucaguglielmi/bankrock-ethglobal.git
cd bankrock-ethglobal/mcp
npm install
npm run dev`,
  },
} as const;

type ConfigTab = keyof typeof CONFIGS;

const TOOLS = [
  {
    name: "get_rock_status",
    badge: "State",
    signature: "rockId: string",
    description: "The rock's lifecycle state, its owner and the account that holds its tokens.",
  },
  {
    name: "get_strategy_fees",
    badge: "Strategy",
    signature: "rockId: string",
    description: "Which strategy a rock runs, and the fees recorded against it.",
  },
  {
    name: "simulate_cross_chain_intent",
    badge: "Cross-chain",
    signature: "rockId: string, sourceChain: string, amount: number",
    description: "A simulated route for funding a rock from another chain.",
  },
  {
    name: "explain_recent_fees",
    badge: "Accounting",
    signature: "rockId: string",
    description: "Recent costs and fees, decoded into plain language.",
  },
  {
    name: "query_logs",
    badge: "Telemetry",
    signature: "level: string, limit: number, rockId?: string",
    description: "Recent server-side events for one rock or for the whole fleet.",
  },
  {
    name: "optimize_idle_yield",
    badge: "Suggestions",
    signature: "rockId: string",
    description: "Where capital that is sitting idle could go instead.",
  },
];

export default function McpPage() {
  const [tab, setTab] = useState<ConfigTab>("claude");
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const demoMode = isDemoMode();

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(AGENT_PROMPT);
      setCopiedPrompt(true);
      setTimeout(() => setCopiedPrompt(false), 2500);
    } catch {
      // Clipboard access denied — the prompt is on screen and selectable.
    }
  };

  const config = CONFIGS[tab];

  return (
    <main className="flex w-full flex-1 flex-col">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-16 py-6">
        <section className="flex flex-col gap-5">
          <span className="w-fit rounded-full bg-muted px-3 py-1 text-label text-ink-3">
            Model Context Protocol
          </span>
          <h1 className="text-h1 font-extrabold text-ink">Bank Rock for AI agents</h1>
          <p className="max-w-prose text-lead text-ink-2">
            A rock can be inspected by any agent that speaks the Model Context Protocol. Connect
            Claude, Cursor or your own client to a rock&rsquo;s state and its history.
          </p>

          <div className="flex flex-col flex-wrap gap-3 sm:flex-row sm:items-center">
            <Button size="lg" onClick={copyPrompt}>
              {copiedPrompt ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copiedPrompt ? "Prompt copied" : "Copy the starter prompt"}
            </Button>
            {demoMode ? (
              <Button size="lg" variant="outline" render={<Link href="/rock/1" />}>
                Open a rock
                <ArrowRight aria-hidden />
              </Button>
            ) : null}
            <Button
              size="lg"
              variant="ghost"
              render={<a href={REPO_URL} target="_blank" rel="noreferrer" />}
            >
              Server source
              <ExternalLink aria-hidden />
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="flex items-center gap-2 text-h2 font-bold text-ink">
            <Terminal aria-hidden className="size-5 shrink-0" />
            Starter prompt
          </h2>
          <p className="max-w-prose text-sm text-ink-2">
            Paste this into your client after connecting the server.
          </p>
          <CodeBlock>{AGENT_PROMPT}</CodeBlock>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-h2 font-bold text-ink">Connecting a client</h2>

          <div className="flex flex-wrap gap-2">
            {(Object.keys(CONFIGS) as ConfigTab[]).map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={tab === id}
                onClick={() => setTab(id)}
                className={cn(
                  "min-h-11 rounded-full border px-4 text-sm font-medium motion-safe:transition-colors",
                  tab === id
                    ? "border-ink bg-ink text-background"
                    : "border-border bg-background text-ink-2 hover:bg-muted",
                )}
              >
                {CONFIGS[id].label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-label text-ink-3">Where it goes</h3>
            <CodeBlock breakAll>{config.path}</CodeBlock>
          </div>

          <div className="flex flex-col gap-2">
            <h3 className="text-label text-ink-3">What to put in it</h3>
            <CodeBlock>{config.snippet}</CodeBlock>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="flex items-center gap-2 text-h2 font-bold text-ink">
            <Cpu aria-hidden className="size-5 shrink-0" />
            The tools
          </h2>

          <UnavailableState reason="These tools do not read live rock data yet, so an agent cannot rely on what they return." />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {TOOLS.map((tool) => (
              <div
                key={tool.name}
                className="flex flex-col gap-3 rounded-2xl border border-border p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">{tool.name}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-label text-ink-3">
                    {tool.badge}
                  </span>
                </div>
                <CodeBlock breakAll>{tool.signature}</CodeBlock>
                <p className="max-w-prose text-sm text-ink-2">{tool.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="flex items-center gap-2 text-h2 font-bold text-ink">
            <Layers aria-hidden className="size-5 shrink-0" />
            How a stone reaches an agent
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              {
                step: "1",
                title: "Tap",
                body: "The chip in the stone signs a one-time message that proves you are holding it.",
              },
              {
                step: "2",
                title: "Account",
                body: "The stone has its own account. It holds two tokens and anyone may trade against them.",
              },
              {
                step: "3",
                title: "Ask",
                body: "An agent reads that state over MCP and explains it back to you.",
              },
            ].map((item) => (
              <div
                key={item.step}
                className="flex flex-col gap-2 rounded-2xl border border-border p-4"
              >
                <span className="flex size-10 items-center justify-center rounded-2xl bg-ink text-base font-semibold text-background">
                  {item.step}
                </span>
                <h3 className="text-h3 font-semibold text-ink">{item.title}</h3>
                <p className="max-w-prose text-sm text-ink-2">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-8 text-sm text-ink-2">
          <Link href="/" className="hover:text-ink">
            Home
          </Link>
          <Link href="/shop" className="hover:text-ink">
            Shop
          </Link>
          <Link href="/alerts" className="hover:text-ink">
            Alerts
          </Link>
          {demoMode ? (
            <Link href="/rock/1" className="hover:text-ink">
              Open a rock
            </Link>
          ) : null}
        </footer>
      </div>
    </main>
  );
}
