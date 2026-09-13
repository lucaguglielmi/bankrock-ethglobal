"use client";

/**
 * The Contracts tab: every contract this rock touches, each in one plain sentence, with its
 * address.
 *
 * There is no address literal in this file. Every value comes from `lib/chain` (D-015), and an
 * address that is not configured is shown as the reason it is missing, never as a placeholder
 * (D-013). This is the one tab, with Ownership, where a visitor meets an Ethereum address at all.
 */

import Link from "next/link";
import { Address } from "@/components/ui/address";
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
  summary: string;
  address: Capability<string>;
}

function entriesFor(smartAccount: Capability<string>): ContractEntry[] {
  return [
    {
      key: "account",
      title: "This rock's account",
      summary:
        "A Safe smart account. It holds every token the rock has, and only the owner can move them.",
      address: smartAccount,
    },
    {
      key: "registry",
      title: "Bank Rock Registry",
      summary: "Records who owns which rock and where each one is in its life. It holds no tokens.",
      address: requireAddress("registry"),
    },
    {
      key: "aqua",
      title: "Aqua",
      summary:
        "The 1inch protocol that tracks how much of the rock's reserve each strategy may trade. It holds nothing itself.",
      address: requireAddress("aqua"),
    },
    {
      key: "aquaApp",
      title: "Strategy app — XYCSwap",
      summary: "The pricing curve every strategy on this rock runs on.",
      address: requireAddress("aquaApp"),
    },
    {
      key: "aquaTaker",
      title: "Router — XYCSwapTaker",
      summary: "The contract a wallet calls to trade with the rock.",
      address: requireAddress("aquaTaker"),
    },
    {
      key: "usdc",
      title: "USDC",
      summary: "One of the two tokens this rock trades.",
      address: requireAddress("usdc"),
    },
    {
      key: "weth",
      title: "WETH",
      summary: "The other token this rock trades.",
      address: requireAddress("weth"),
    },
    {
      key: "entryPoint",
      title: "EntryPoint 0.7",
      summary: "The account-abstraction contract that lets the rock's transactions be sponsored.",
      address: real(ENTRY_POINT_07_ADDRESS),
    },
  ];
}

export function ContractsTab({ smartAccount }: ContractsTabProps) {
  const entries = entriesFor(smartAccount);

  return (
    <>
      <p className="max-w-prose text-lead text-ink-2">
        Everything this rock does is on Ethereum Sepolia and readable by anyone.
      </p>

      <ul className="flex flex-col divide-y divide-border">
        {entries.map((entry) => (
          <li key={entry.key} className="flex flex-col gap-2 py-5 first:pt-0">
            <h3 className="text-base font-medium text-ink">{entry.title}</h3>
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
