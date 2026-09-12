"use client";

/**
 * "Buy with a card" — Privy's onramp flow for the embedded wallet (spec 20 Part 5, Flow G).
 *
 * `useFundWallet` opens whatever funding methods the Privy dashboard has switched on: a card
 * onramp (MoonPay, Coinbase), a transfer from an external wallet, or an exchange. Transfers from
 * other chains have their own, better path — `DepositAnywhereButton` — so this one is labelled
 * for the card. When nothing is switched on the call rejects, and the fallback is the plain truth:
 * the wallet's address. Never a simulated top-up (D-013).
 */

import * as React from "react";
import { useFundWallet } from "@privy-io/react-auth";
import type { Address as AddressType } from "viem";
import type { Chain } from "viem/chains";
import { Address } from "@/components/ui/address";
import { Button } from "@/components/ui/button";

export interface FundWalletButtonProps {
  address: AddressType;
  chain?: Chain;
  symbol: string;
  explorerHref?: string;
}

const NOT_ENABLED =
  "Privy's funding options are not switched on for this app yet, so send the asset to your wallet directly:";

export function FundWalletButton({ address, chain, symbol, explorerHref }: FundWalletButtonProps) {
  const { fundWallet } = useFundWallet();
  const [busy, setBusy] = React.useState(false);
  const [fallback, setFallback] = React.useState<string | null>(null);

  const handleClick = React.useCallback(async () => {
    setBusy(true);
    setFallback(null);
    try {
      await fundWallet({
        address,
        options: {
          chain,
          asset: symbol.toUpperCase() === "USDC" ? "USDC" : "native-currency",
          amount: "10",
        },
      });
    } catch {
      setFallback(NOT_ENABLED);
    } finally {
      setBusy(false);
    }
  }, [fundWallet, address, chain, symbol]);

  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" className="w-full" onClick={handleClick} disabled={busy}>
        {busy ? "Opening…" : `Buy ${symbol.toUpperCase()} with a card`}
      </Button>
      {fallback ? (
        <div className="flex flex-col gap-1">
          <p className="max-w-prose text-sm text-ink-2">{fallback}</p>
          <Address value={address} explorerHref={explorerHref} />
        </div>
      ) : null}
    </div>
  );
}
