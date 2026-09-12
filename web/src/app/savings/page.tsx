import type { Metadata } from "next";
import { SavingsCard } from "@/components/earn/savings-card";

export const metadata: Metadata = {
  title: "Savings — Bank Rock",
  description:
    "Put idle dollars to work from the wallet Privy gave you when you signed in. Add, take out, and see what the vault has actually paid.",
};

/**
 * The savings page (spec 20 Part 5). The same card an owner sees on their rock page, reachable
 * without a rock: sign in, add USDC, take it out. Every figure on it is read from Privy or the
 * chain, and none of them is a rate.
 */
export default function SavingsPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 py-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-h1 font-bold text-ink">Savings</h1>
        <p className="max-w-prose text-lead text-ink-2">
          Dollars that are not busy trading can earn on their own. Add some from the wallet you
          signed in with, take them out whenever you like.
        </p>
      </header>
      <SavingsCard context="page" />
    </main>
  );
}
