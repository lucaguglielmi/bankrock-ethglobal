"use client";

/**
 * Aqua explainer sheet (spec 17 Part 5 "Aqua explainer", L-10, L-12; spec 15 Part 8).
 *
 * What this file used to be: a near-full-height black modal with a **second** full-bleed canvas
 * running behind scrolling text (L-10), hover-only tooltips that touch could never reach (L-12),
 * `prose` classes that did nothing because the typography plugin was not installed (T-10), and a
 * whole tab rendered in monospace (T-4).
 *
 * What it is now: a `Sheet` at `size="lg"`. No canvas at all. Tabs are 44 px segmented buttons,
 * glossary terms are `HelpTerm` (a tappable popover on touch, a tooltip on a pointer), the
 * mapping table is a definition list that stacks below `sm`, and code is `CodeBlock`. No annual
 * return figure appears, here or anywhere (D-004).
 */

import * as React from "react";
import { ArrowRight, Beaker, Code, GraduationCap, Sparkles } from "lucide-react";
import { Sheet, SheetBody } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { CodeBlock, InlineCode } from "@/components/ui/code-block";
import { HelpTerm } from "@/components/ui/popover";

interface AquaInfoModalProps {
  triggerText: string;
}

type TabType = "simple" | "defi" | "nerd" | "agents";

const TABS = [
  { id: "simple", label: "Simple", icon: Sparkles },
  { id: "defi", label: "DeFi user", icon: Beaker },
  { id: "nerd", label: "Finance nerd", icon: GraduationCap },
  { id: "agents", label: "Agents", icon: Code },
] as const;

/** Bank Rock ↔ Aqua vocabulary. A definition list, so it stacks below `sm` (§4.6). */
const MAPPING: Array<{ rock: string; aqua: string }> = [
  { rock: "Rock Account", aqua: "Maker" },
  { rock: "Token reserves", aqua: "ERC-20 balances the account already holds" },
  { rock: "Liquidity stream", aqua: "Immutable strategy" },
  { rock: "Opening and closing it", aqua: "ship / dock" },
];

const SHIP_SIGNATURE =
  "ship(address app, bytes strategy, address[] tokens, uint256[] amounts)";

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-h3 font-semibold text-ink">{children}</h3>;
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return <p className="max-w-prose text-base text-ink-2">{children}</p>;
}

function Diagram({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="rounded-2xl border border-border p-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="mx-auto h-auto w-full max-w-full object-contain" />
    </div>
  );
}

export function AquaInfoModal({ triggerText }: AquaInfoModalProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [tab, setTab] = React.useState<TabType>("simple");

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="default"
        onClick={() => setIsOpen(true)}
        className="rounded-full border-white/20 bg-white/5 text-base font-semibold hover:bg-white/10 hover:text-current"
      >
        {triggerText}
        <ArrowRight aria-hidden />
      </Button>

      <Sheet
        open={isOpen}
        onOpenChange={setIsOpen}
        title="Understanding Aqua"
        description="Choose how deep you want to go."
        size="lg"
      >
        <SheetBody className="flex flex-col gap-6">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Level of depth">
            {TABS.map((entry) => {
              const Icon = entry.icon;
              const selected = tab === entry.id;
              return (
                <Button
                  key={entry.id}
                  type="button"
                  variant={selected ? "default" : "outline"}
                  aria-pressed={selected}
                  onClick={() => setTab(entry.id)}
                  className="h-11 rounded-full px-4 text-sm font-semibold"
                >
                  <Icon aria-hidden />
                  {entry.label}
                </Button>
              );
            })}
          </div>

          {tab === "simple" ? (
            <div className="flex flex-col gap-4">
              <SectionHeading>Your money never leaves your pocket</SectionHeading>
              <Paragraph>
                Normally, to earn fees by letting other people trade against your money, you have
                to hand that money over to a pool and hope the pool behaves.
              </Paragraph>
              <Paragraph>
                Aqua changes that. Your tokens stay in your own account. Instead of moving them,
                you make a{" "}
                <HelpTerm term="virtual allocation">
                  A promise that a strategy may use your tokens, written down on-chain. The tokens
                  themselves stay in your account until somebody actually trades against them.
                </HelpTerm>{" "}
                — a promise that says: this strategy may use my tokens, but they stay where they
                are until somebody actually trades.
              </Paragraph>
              <div className="rounded-2xl border border-border p-4">
                <SectionHeading>What that means for a rock</SectionHeading>
                <p className="mt-2 max-w-prose text-base text-ink-2">
                  The rock holds tokens in its own account. Through Aqua it offers them to the
                  market and earns a fee when someone trades, but the tokens sit inside the rock
                  until that trade happens. Your{" "}
                  <HelpTerm term="liquidity">
                    The money that is ready to be traded or moved. In most of DeFi, providing
                    liquidity means locking it away first.
                  </HelpTerm>{" "}
                  stays under your control the whole time.
                </p>
              </div>
            </div>
          ) : null}

          {tab === "defi" ? (
            <div className="flex flex-col gap-4">
              <SectionHeading>How Aqua routes a trade</SectionHeading>
              <Paragraph>
                A maker — here, the rock — keeps its tokens in its own smart account and assigns
                virtual balances to one or more strategies. One approved balance can back several
                strategies at once, with no deposit into any separate pool.
              </Paragraph>
              <Diagram src="/diagrams/diagram1.svg" alt="How a trade is routed through Aqua" />
              <dl className="flex flex-col gap-3 text-base">
                <div>
                  <dt className="font-semibold text-ink">The maker</dt>
                  <dd className="max-w-prose text-ink-2">
                    The Rock Account itself. It holds the actual ERC-20 tokens.
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink">The strategy</dt>
                  <dd className="max-w-prose text-ink-2">
                    An immutable curve deployed on-chain. It decides the price at which the maker
                    is willing to buy or sell.
                  </dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink">The swap</dt>
                  <dd className="max-w-prose text-ink-2">
                    When someone routes a trade through the aggregator and this strategy is the
                    best price, the swap executes straight against the rock&rsquo;s account.
                  </dd>
                </div>
              </dl>
              <Paragraph>
                Because the strategy is immutable, changing the terms means closing the old one
                (<InlineCode>dock</InlineCode>) and opening a new one (
                <InlineCode>ship</InlineCode>).
              </Paragraph>
            </div>
          ) : null}

          {tab === "nerd" ? (
            <div className="flex flex-col gap-4">
              <SectionHeading>Mechanics, and what can go wrong</SectionHeading>
              <Paragraph>
                Aqua decouples the execution curve from the custody of the assets: the curve is
                on-chain and immutable, the assets never leave the maker&rsquo;s account.
              </Paragraph>
              <Diagram src="/diagrams/diagram2.svg" alt="Where the assets sit while a strategy is live" />

              <SectionHeading>One reserve, more than one use</SectionHeading>
              <Paragraph>
                Because the tokens are not locked inside a pool, the same balance can back several
                strategies. When a swap arrives, the liquidity it needs is pulled just in time.
              </Paragraph>

              <SectionHeading>Constant product</SectionHeading>
              <Paragraph>
                The rock runs a two-token constant-product strategy — <InlineCode>x × y = k</InlineCode>,
                the same shape as a classic pool — executed virtually. Fee, curve, salt and expiry
                are baked into the strategy when it is shipped.
              </Paragraph>

              <SectionHeading>Risks</SectionHeading>
              <div className="flex flex-col gap-3">
                <div className="rounded-2xl border border-border p-4">
                  <h4 className="text-base font-semibold text-ink">Divergence loss</h4>
                  <p className="mt-1 max-w-prose text-sm text-ink-2">
                    Like any market-making curve, holding both sides through a large price move
                    leaves you worse off than simply having held the winning side.
                  </p>
                </div>
                <div className="rounded-2xl border border-border p-4">
                  <h4 className="text-base font-semibold text-ink">Smart contract risk</h4>
                  <p className="mt-1 max-w-prose text-sm text-ink-2">
                    The rock depends on the Aqua and SwapVM contracts. If they are compromised,
                    what the rock holds is at risk.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {tab === "agents" ? (
            <div className="flex flex-col gap-4">
              <SectionHeading>The vocabulary</SectionHeading>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                {MAPPING.map((entry) => (
                  <React.Fragment key={entry.rock}>
                    <dt className="text-sm font-semibold text-ink">{entry.rock}</dt>
                    <dd className="text-sm text-ink-2 sm:text-right">{entry.aqua}</dd>
                  </React.Fragment>
                ))}
              </dl>

              <SectionHeading>Opening a position</SectionHeading>
              <Paragraph>
                The maker approves Aqua itself — not the app — and then ships a strategy over the
                tokens it already holds.
              </Paragraph>
              <CodeBlock>{SHIP_SIGNATURE}</CodeBlock>

              <SectionHeading>What the rock ships</SectionHeading>
              <Paragraph>
                A two-token constant-product SwapVM program over test USDC and WETH, chosen for
                predictable behaviour and standard routing rather than a custom Aqua app.
              </Paragraph>
            </div>
          ) : null}
        </SheetBody>
      </Sheet>
    </>
  );
}
