"use client";

/**
 * The Contracts tab: every contract this rock touches, each in one plain sentence, with its
 * address. Every unfamiliar word in a sentence is a glossary `Term`, so a visitor can tap it and
 * read one sentence more without leaving the tab.
 *
 * There is no address literal in this file. Every value comes from `lib/chain` (D-015), and an
 * address that is not configured is shown as the reason it is missing, never as a placeholder
 * (D-013). This is the one tab, with Ownership, where a visitor meets an Ethereum address at all.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import { Address } from "@/components/ui/address";
import { Term } from "@/components/ui/term";
import { ENTRY_POINT_07_ADDRESS, explorer, requireAddress } from "@/lib/chain";
import { real, type Capability } from "@/lib/demo";

export interface ContractsTabProps {
  /**
   * This rock's account, from the registry. UNAVAILABLE while the rock has none, carrying the
   * reason — a dormant rock opens its account when it is awakened.
   */
  smartAccount: Capability<string>;
}

interface ContractEntry {
  key: string;
  title: string;
  /** One sentence. Glossary words are wrapped in `Term`. */
  summary: ReactNode;
  /** Who wrote it, in two words. */
  author: "Bank Rock" | "1inch" | "Safe" | "Circle" | "Ethereum";
  address: Capability<string>;
}

function entriesFor(smartAccount: Capability<string>): ContractEntry[] {
  return [
    {
      key: "account",
      title: "This rock's account",
      author: "Safe",
      summary: (
        <>
          The <Term k="rockAccount" /> is a <Term k="safe" /> that holds every token the rock has;
          only the owner can move them, and every action it takes is a{" "}
          <Term k="sponsoredTransaction" />.
        </>
      ),
      address: smartAccount,
    },
    {
      key: "registry",
      title: "Bank Rock Registry",
      author: "Bank Rock",
      summary: (
        <>
          The <Term k="registry" /> records who owns which rock and where each one is in its life;
          it holds no tokens and only acts on a signed <Term k="attestation" /> of a real tap.
        </>
      ),
      address: requireAddress("registry"),
    },
    {
      key: "aqua",
      title: "Aqua",
      author: "1inch",
      summary: (
        <>
          <Term k="aqua" /> keeps count of how much of the rock&rsquo;s <Term k="reserve" /> each{" "}
          <Term k="strategy" /> may trade; the tokens never leave the rock&rsquo;s account.
        </>
      ),
      address: requireAddress("aqua"),
    },
    {
      key: "aquaApp",
      title: "Strategy app — XYCSwap",
      author: "1inch",
      summary: (
        <>
          <Term k="xycSwap" /> is the <Term k="constantProduct" /> every strategy on this rock
          runs on; it sets the price and holds nothing.
        </>
      ),
      address: requireAddress("aquaApp"),
    },
    {
      key: "aquaTaker",
      title: "Trade router — XYCSwapTaker",
      author: "Bank Rock",
      summary: (
        <>
          <Term k="xycSwapTaker" /> is what a visitor&rsquo;s wallet calls to trade with the rock as
          the <Term k="taker" />; it has no owner and keeps nothing between trades.
        </>
      ),
      address: requireAddress("aquaTaker"),
    },
    {
      key: "usdc",
      title: "USDC",
      author: "Circle",
      summary: (
        <>
          <Term k="usdc" /> is one of the two tokens this rock trades — the test version on{" "}
          <Term k="sepolia" />, worth nothing.
        </>
      ),
      address: requireAddress("usdc"),
    },
    {
      key: "weth",
      title: "WETH",
      author: "Ethereum",
      summary: (
        <>
          <Term k="weth" /> is the other token this rock trades.
        </>
      ),
      address: requireAddress("weth"),
    },
    {
      key: "entryPoint",
      title: "EntryPoint 0.7",
      author: "Ethereum",
      summary: (
        <>
          The <Term k="entryPoint" /> is the shared contract every <Term k="userOperation" /> from
          the rock passes through; it is what lets a <Term k="paymaster" /> pay the{" "}
          <Term k="gas" /> for you.
        </>
      ),
      address: real(ENTRY_POINT_07_ADDRESS),
    },
  ];
}

export function ContractsTab({ smartAccount }: ContractsTabProps) {
  const entries = entriesFor(smartAccount);

  return (
    <>
      <p className="max-w-prose text-lead text-ink-2">
        Everything this rock does happens on <Term k="sepolia" /> and can be checked by anyone on{" "}
        <Term k="etherscan" />. Bank Rock wrote two of these contracts; the rest are the standard
        pieces they build on.
      </p>

      <ul className="flex flex-col divide-y divide-border">
        {entries.map((entry) => (
          <li key={entry.key} className="flex flex-col gap-2 py-5 first:pt-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h3 className="text-base font-medium text-ink">{entry.title}</h3>
              <span className="text-caption text-ink-3">by {entry.author}</span>
            </div>
            <p className="max-w-prose text-sm text-ink-2">{entry.summary}</p>
            {entry.address.state === "UNAVAILABLE" ? (
              <p className="text-sm text-ink-3">{entry.address.reason}</p>
            ) : (
              <Address
                value={entry.address.value}
                explorerHref={explorer.address(entry.address.value)}
              />
            )}
          </li>
        ))}
      </ul>

      <p className="text-sm text-ink-3">
        <Link href="/learn/defi" className="text-link underline-offset-4 hover:underline">
          How the pieces fit together
        </Link>
      </p>
    </>
  );
}
