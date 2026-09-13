"use client";

/**
 * The MCP page (spec 17 Part 5 "MCP page"; spec 11 §5; D-004, D-008, D-013, D-019).
 *
 * The lead is the hosted endpoint, `/api/mcp`: a URL a person pastes into ChatGPT, claude.ai,
 * the Claude apps, Claude Code or Cursor, with nothing to install. A phone can only ever reach a
 * hosted server, which is why the stdio server in `mcp/` — still here, under "Run it yourself" —
 * was never enough on its own. Both offer the same read-only tools; the stdio one adds the two
 * operator tools, because only a process the operator starts can hold ADMIN_API_KEY.
 *
 * The starter prompt is the exact text the hosted server sends as its `instructions` on connect
 * (`lib/mcp/prompt.ts`), so a client that honours instructions needs nothing pasted and a person
 * can still read what the agent was told. It names the endpoint: a prompt cannot open a
 * connection, but an agent that knows the URL can say what is missing.
 *
 * The registry address in the stdio snippet is read from `lib/chain` (D-015); the endpoint URL
 * from the canonical origin (D-022). Nothing here is typed by hand. Long paths and snippets go
 * through `<CodeBlock>` so they wrap or scroll instead of pushing the page sideways (L-7).
 */

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Copy, Check, Cpu, ExternalLink, Layers, Plug, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { Term } from "@/components/ui/term";
import { addresses, appPath } from "@/lib/chain";
import { isDemoMode } from "@/lib/demo";
import { agentInstructions, DEMO_ROCK_ID, MCP_ENDPOINT_PATH } from "@/lib/mcp/prompt";
import { cn } from "@/lib/ui/cn";

const REPO_URL = "https://github.com/lucaguglielmi/bankrock-ethglobal/tree/main/mcp";

/** The rock the demo opens. Rock 1 is retired; rock 3 is the live one. */
const DEMO_ROCK_HREF = `/rock/${DEMO_ROCK_ID}`;

/** The hosted endpoint, on the canonical origin (D-022). */
const ENDPOINT_URL = appPath(MCP_ENDPOINT_PATH);

/** The same words the endpoint sends as its instructions on connect. */
const AGENT_PROMPT = agentInstructions(ENDPOINT_URL);

const REGISTRY_FOR_SNIPPET =
  addresses.registry ?? "<the registry address from contracts/deployments/sepolia.json>";

interface ClientGuide {
  label: string;
  /** One or two sentences on where this client runs and what it needs. */
  intro: string;
  /** Numbered steps, for a client that is configured through its own settings screens. */
  steps?: string[];
  /** A file or a place, for a client that is configured with text. */
  path?: string;
  snippet?: string;
}

const CLIENTS = {
  chatgpt: {
    label: "ChatGPT",
    intro:
      "ChatGPT calls remote MCP servers from OpenAI's cloud once Developer mode is on. It needs a Plus, Pro, Business, Enterprise or Edu plan, and the switch lives in the web app; the connector then belongs to your account, not the browser.",
    steps: [
      "On chatgpt.com, open Settings and turn on Developer mode. OpenAI keeps the toggle under Apps & Connectors › Advanced settings on some versions and under Security and login on others.",
      "Under Apps & Connectors, choose Create. Name it Bank Rock, paste the endpoint above as the MCP server URL, choose No authentication, confirm you trust it, and save.",
      `Open the ChatGPT app on your phone, start a chat, open the tools menu and switch Bank Rock on. Ask it about rock ${DEMO_ROCK_ID}.`,
    ],
  },
  claude: {
    label: "Claude",
    intro:
      "Claude reaches the endpoint from Anthropic's cloud, so one connector serves claude.ai, Claude Desktop and the Claude app for iPhone and Android. Custom connectors are available on every plan, free included.",
    steps: [
      "On claude.ai (or in Claude Desktop), open Settings › Connectors and choose Add custom connector.",
      "Name it Bank Rock, paste the endpoint above as the remote MCP server URL, leave the OAuth fields empty, and add it.",
      `In any chat, on the web or on your phone, open the tools menu and turn Bank Rock on. Ask it about rock ${DEMO_ROCK_ID}.`,
    ],
  },
  code: {
    label: "Claude Code, Cursor",
    intro:
      "Command-line and editor clients take the endpoint directly. No checkout, no environment variables.",
    path: "Claude Code: one command. Cursor: .cursor/mcp.json in your project",
    snippet: `# Claude Code
claude mcp add --transport http bankrock ${ENDPOINT_URL}

# Cursor — .cursor/mcp.json
{
  "mcpServers": {
    "bankrock": { "url": "${ENDPOINT_URL}" }
  }
}`,
  },
  local: {
    label: "Run it yourself",
    intro:
      "The same tools as a stdio process from a checkout of the repository. This is the only way to reach the two operator tools, which need ADMIN_API_KEY, and it is what an operator runs on a laptop that must not depend on the site being up.",
    path: "Build once, then point Claude Desktop at the built file (claude_desktop_config.json)",
    snippet: `git clone https://github.com/lucaguglielmi/bankrock-ethglobal.git
cd bankrock-ethglobal/mcp
npm ci && npm run build

# Try it in the terminal (Ctrl-C to stop):
SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \\
REGISTRY_ADDRESS=${REGISTRY_FOR_SNIPPET} \\
node dist/index.js

# Claude Desktop — claude_desktop_config.json
{
  "mcpServers": {
    "bankrock": {
      "command": "node",
      "args": ["/path/to/bankrock-ethglobal/mcp/dist/index.js"],
      "env": {
        "SEPOLIA_RPC_URL": "https://ethereum-sepolia-rpc.publicnode.com",
        "REGISTRY_ADDRESS": "${REGISTRY_FOR_SNIPPET}",
        "ADMIN_API_KEY": "<the operator key, only if you have it>"
      }
    }
  }
}`,
  },
} as const satisfies Record<string, ClientGuide>;

type ClientTab = keyof typeof CLIENTS;

interface Tool {
  name: string;
  badge: string;
  signature: string;
  description: string;
  /** Set when the tool needs something the hosted endpoint does not have, or never answers. */
  note?: string;
}

const OPERATOR_NOTE =
  "Only on a server you run yourself, with the operator's ADMIN_API_KEY. The hosted endpoint is anonymous and does not offer it.";

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
    description: "Whether the server can reach the RPC, the registry and the Bank Rock API right now.",
  },
  {
    name: "query_logs",
    badge: "Operator",
    signature: "level: string, limit: number, rockId?: string",
    description: "Recent server-side events, with personal data removed before they are stored.",
    note: OPERATOR_NOTE,
  },
  {
    name: "get_waitlist_stats",
    badge: "Operator",
    signature: "—",
    description: "How many people have joined the waitlist.",
    note: OPERATOR_NOTE,
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
  const [tab, setTab] = useState<ClientTab>("chatgpt");
  const [copied, setCopied] = useState<"endpoint" | "prompt" | null>(null);
  const demoMode = isDemoMode();

  const copy = async (what: "endpoint" | "prompt") => {
    try {
      await navigator.clipboard.writeText(what === "endpoint" ? ENDPOINT_URL : AGENT_PROMPT);
      setCopied(what);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      // Clipboard access denied — both texts are on screen and selectable.
    }
  };

  const client: ClientGuide = CLIENTS[tab];

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
            you connect the one you already use, on your laptop or on your phone.
          </p>
          <p className="max-w-prose text-base text-ink-2">
            The server is read-only by decision. It holds no key, so it cannot start or stop a
            strategy, move a token or sign anything. Every tool either reads <Term k="sepolia" />{" "}
            or answers <em>unavailable</em> with the reason. It never estimates and never invents
            a number.
          </p>

          <div className="flex flex-col gap-2">
            <h2 className="text-label text-ink-3">The endpoint</h2>
            <CodeBlock breakAll>{ENDPOINT_URL}</CodeBlock>
            <p className="max-w-prose text-sm text-ink-2">
              Hosted with the site, no sign-in, no key. Paste it into your client as a custom
              connector; the steps for each client are below.
            </p>
          </div>

          <div className="flex flex-col flex-wrap gap-3 sm:flex-row sm:items-center">
            <Button size="lg" onClick={() => copy("endpoint")}>
              {copied === "endpoint" ? <Check aria-hidden /> : <Plug aria-hidden />}
              {copied === "endpoint" ? "Endpoint copied" : "Copy the endpoint"}
            </Button>
            <Button size="lg" variant="outline" onClick={() => copy("prompt")}>
              {copied === "prompt" ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied === "prompt" ? "Prompt copied" : "Copy the starter prompt"}
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
            ChatGPT and the Claude apps connect to the hosted endpoint from their own cloud, so
            the same connector works on a phone. Command-line clients take the URL directly. The
            server you run yourself is for operators.
          </p>

          <div className="flex flex-wrap gap-2">
            {(Object.keys(CLIENTS) as ClientTab[]).map((id) => (
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
                {CLIENTS[id].label}
              </button>
            ))}
          </div>

          <p className="max-w-prose text-sm text-ink-2">{client.intro}</p>

          {client.steps ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-label text-ink-3">The endpoint</h3>
              <CodeBlock breakAll>{ENDPOINT_URL}</CodeBlock>
              <h3 className="mt-2 text-label text-ink-3">The steps</h3>
              <ol className="flex max-w-prose list-decimal flex-col gap-2 pl-5 text-sm text-ink-2">
                {client.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          ) : null}

          {client.path ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-label text-ink-3">Where it goes</h3>
              <CodeBlock breakAll>{client.path}</CodeBlock>
            </div>
          ) : null}

          {client.snippet ? (
            <div className="flex flex-col gap-2">
              <h3 className="text-label text-ink-3">What to put in it</h3>
              <CodeBlock>{client.snippet}</CodeBlock>
            </div>
          ) : null}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="flex items-center gap-2 text-h2 font-bold text-ink">
            <Terminal aria-hidden className="size-5 shrink-0" />
            Starter prompt
          </h2>
          <p className="max-w-prose text-sm text-ink-2">
            The hosted endpoint sends exactly this to your client the moment it connects, so
            usually there is nothing to paste. It is here to read, and to paste into a client that
            ignores server instructions. It names the endpoint on purpose: a prompt cannot open a
            connection, but an agent that knows the URL can tell you what is missing.
          </p>
          <CodeBlock>{AGENT_PROMPT}</CodeBlock>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="flex items-center gap-2 text-h2 font-bold text-ink">
            <Cpu aria-hidden className="size-5 shrink-0" />
            The tools
          </h2>
          <p className="max-w-prose text-sm text-ink-2">
            Ten tools. The hosted endpoint offers eight: six read the chain, and two exist only to
            say, honestly, that a feature is not built. The other two need an operator key and
            exist only on a server you run yourself.
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
