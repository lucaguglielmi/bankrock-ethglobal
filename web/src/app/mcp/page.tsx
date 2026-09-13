"use client";

/**
 * The MCP page (spec 17 Part 5 "MCP page"; spec 11 §5; D-004, D-008, D-013, D-019).
 *
 * What it says is what `mcp/index.ts` does: ten read-only tools, each of which either reads
 * Ethereum Sepolia or the Bank Rock API or answers `unavailable` with a reason. The per-tool
 * "Mock Sample Response" blocks of an earlier revision are gone — they presented invented
 * figures as measurements — and so is the banner that said the tools did not read live data,
 * which stopped being true when the contracts were deployed (D-034).
 *
 * The server needs two things the client's config must pass in `env`: an RPC URL and the
 * registry address. The address in the snippet is read from `lib/chain` (D-015); nothing here is
 * typed by hand. Long paths and snippets go through `<CodeBlock>` so they wrap or scroll instead
 * of pushing the page sideways (L-7).
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Copy, Check, Cpu, ExternalLink, Layers, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { Term } from "@/components/ui/term";
import { addresses } from "@/lib/chain";
import { isDemoMode } from "@/lib/demo";
import { cn } from "@/lib/ui/cn";

const REPO_URL = "https://github.com/lucaguglielmi/bankrock-ethglobal/tree/main/mcp";

/** The rock the demo opens. Rock 1 is retired; rock 3 is the live one. */
const DEMO_ROCK_HREF = "/rock/3";

const AGENT_PROMPT = `You are connected to the Bank Rock MCP server. It is read-only.

A Bank Rock is a real stone with an NTAG 424 DNA chip inside. Tapping it with a phone opens its
page. Each rock has its own on-chain account (a Safe) that holds USDC and WETH on Ethereum Sepolia,
and it offers those tokens for trading through 1inch Aqua. The tokens never leave the account;
every trade leaves a small fee inside it.

Tools:
1. get_rock_status({ rockId }) — state (dormant, awake, gift waiting, retired), owner, account, balances.
2. get_strategy_fees({ rockId }) — each live strategy: fee rate, what it may trade, what it can trade now, fees so far.
3. explain_recent_fees({ rockId }) — the same fee figures in plain language, with how far back the scan went.
4. get_strategy_volume({ rockId }) — how many trades each strategy has seen (a count, not a currency amount).
5. trace_transaction({ hash }) — the receipt for a transaction hash.
6. get_server_metrics() — whether the RPC, the registry and the API can be reached.

Start by reading the rock's state, then say what you can and cannot tell from it. Never state a
figure a tool did not return, and never quote a rate of return: the only rate is the fee.`;

function envBlock(indent: string): string {
  const registry = addresses.registry ?? "<the registry address from contracts/deployments/sepolia.json>";
  return [
    `${indent}"SEPOLIA_RPC_URL": "https://ethereum-sepolia-rpc.publicnode.com",`,
    `${indent}"REGISTRY_ADDRESS": "${registry}"`,
  ].join("\n");
}

const CONFIGS = {
  claude: {
    label: "Claude Desktop",
    path: "~/Library/Application Support/Claude/claude_desktop_config.json",
    snippet: `{
  "mcpServers": {
    "bankrock": {
      "command": "npx",
      "args": ["-y", "ts-node", "/path/to/bankrock-ethglobal/mcp/index.ts"],
      "env": {
${envBlock("        ")}
      }
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
      "transport": "stdio",
      "env": {
${envBlock("        ")}
      }
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
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \\
REGISTRY_ADDRESS=${addresses.registry ?? "<registry address>"} \\
npm start`,
  },
} as const;

type ConfigTab = keyof typeof CONFIGS;

interface Tool {
  name: string;
  badge: string;
  signature: string;
  description: string;
  /** Set when the tool needs something the public server does not have, or never answers. */
  note?: string;
}

const TOOLS: Tool[] = [
  {
    name: "get_rock_status",
    badge: "Registry",
    signature: "rockId: string",
    description:
      "Reads the registry on Sepolia: the rock's state, its owner, its Rock Account, the chip it is bound to, any gift waiting, and the USDC and WETH the account holds.",
  },
  {
    name: "get_strategy_fees",
    badge: "Aqua",
    signature: "rockId: string",
    description:
      "For each live strategy: the fee rate, the amount it may trade, the amount it can trade right now, and the fees it has kept so far, summed from Aqua's own trade records.",
  },
  {
    name: "explain_recent_fees",
    badge: "Aqua",
    signature: "rockId: string",
    description:
      "The same fee figures, narrated per strategy, with the range of blocks that was scanned so the agent can say when a total might be short.",
  },
  {
    name: "get_strategy_volume",
    badge: "Aqua",
    signature: "rockId: string",
    description:
      "How many trades each strategy has seen in that scan. A count of trades, not an amount of money.",
  },
  {
    name: "trace_transaction",
    badge: "Chain",
    signature: "hash: string",
    description:
      "The receipt for a transaction on Sepolia: whether it succeeded, its block, its gas, sender and recipient.",
  },
  {
    name: "get_server_metrics",
    badge: "Health",
    signature: "—",
    description: "Whether this server can reach the RPC, the registry and the Bank Rock API right now.",
  },
  {
    name: "query_logs",
    badge: "Operator",
    signature: "level: string, limit: number, rockId?: string",
    description: "Recent server-side events, with personal data removed before they are stored.",
    note: "Needs the operator's ADMIN_API_KEY; without it the tool answers unavailable.",
  },
  {
    name: "get_waitlist_stats",
    badge: "Operator",
    signature: "—",
    description: "How many people have joined the waitlist.",
    note: "Needs the operator's ADMIN_API_KEY; without it the tool answers unavailable.",
  },
  {
    name: "simulate_cross_chain_intent",
    badge: "Not built",
    signature: "rockId: string, sourceChain: string, amount: number",
    description: "Funding a rock from another network.",
    note: "Always answers unavailable: no bridge is integrated.",
  },
  {
    name: "optimize_idle_yield",
    badge: "Not built",
    signature: "rockId: string",
    description: "Putting idle tokens to work in a lending protocol.",
    note: "Always answers unavailable: this was cut from scope.",
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
          <h1 className="text-h1 font-extrabold text-ink">Ask an AI about a rock</h1>
          <p className="max-w-prose text-lead text-ink-2">
            Any <Term k="agent" /> that speaks <Term k="mcp" /> can read a rock: who owns it, what
            its <Term k="rockAccount" /> holds, which <Term k="strategy">strategies</Term> it runs
            and what <Term k="fee">fees</Term> they have kept. Bank Rock runs no AI of its own;
            you connect the one you already use.
          </p>
          <p className="max-w-prose text-base text-ink-2">
            The server is read-only by decision. It holds no key, so it cannot start or stop a
            strategy, move a token or sign anything. Every tool either reads <Term k="sepolia" />{" "}
            or the Bank Rock API, or answers <em>unavailable</em> with the reason. It never
            estimates and never invents a number.
          </p>

          <div className="flex flex-col flex-wrap gap-3 sm:flex-row sm:items-center">
            <Button size="lg" onClick={copyPrompt}>
              {copiedPrompt ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copiedPrompt ? "Prompt copied" : "Copy the starter prompt"}
            </Button>
            {demoMode ? (
              <Button size="lg" variant="outline" render={<Link href={DEMO_ROCK_HREF} />}>
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
            <Layers aria-hidden className="size-5 shrink-0" />
            How a stone reaches an agent
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {[
              {
                step: "1",
                title: "Tap",
                body: (
                  <>
                    The chip in the stone writes a fresh signed code into its link on every{" "}
                    <Term k="tap" />; our server checks it, so a copied link proves nothing.
                  </>
                ),
              },
              {
                step: "2",
                title: "Account",
                body: (
                  <>
                    The stone has its own account on Sepolia. It holds <Term k="usdc" /> and{" "}
                    <Term k="weth" />, and anyone may trade against them through{" "}
                    <Term k="aqua" />.
                  </>
                ),
              },
              {
                step: "3",
                title: "Ask",
                body: (
                  <>
                    An agent reads that state over MCP — the same contracts the rock page reads —
                    and explains it back to you in plain words.
                  </>
                ),
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

        <section className="flex flex-col gap-4">
          <h2 className="text-h2 font-bold text-ink">Connecting a client</h2>
          <p className="max-w-prose text-sm text-ink-2">
            The server runs on your own machine from a checkout of the repository. It needs an RPC
            endpoint for Sepolia and the <Term k="registry" /> address; the snippets below carry
            the ones this site is deployed against.
          </p>

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
            <Terminal aria-hidden className="size-5 shrink-0" />
            Starter prompt
          </h2>
          <p className="max-w-prose text-sm text-ink-2">
            Paste this into your client after connecting the server. It tells the agent what a rock
            is and what the tools can and cannot say.
          </p>
          <CodeBlock>{AGENT_PROMPT}</CodeBlock>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="flex items-center gap-2 text-h2 font-bold text-ink">
            <Cpu aria-hidden className="size-5 shrink-0" />
            The tools
          </h2>
          <p className="max-w-prose text-sm text-ink-2">
            Ten tools. Six read the chain and the public API. Two need an operator key. Two exist
            only to say, honestly, that a feature is not built.
          </p>

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
                {tool.note ? <p className="max-w-prose text-caption text-ink-3">{tool.note}</p> : null}
              </div>
            ))}
          </div>
        </section>

        <footer className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-border pt-8 text-sm text-ink-2">
          <Link href="/" className="hover:text-ink">
            Home
          </Link>
          <Link href="/learn/defi" className="hover:text-ink">
            The DeFi position
          </Link>
          <Link href="/learn/security" className="hover:text-ink">
            Security
          </Link>
          <Link href="/shop" className="hover:text-ink">
            Shop
          </Link>
          {demoMode ? (
            <Link href={DEMO_ROCK_HREF} className="hover:text-ink">
              Open a rock
            </Link>
          ) : null}
        </footer>
      </div>
    </main>
  );
}
