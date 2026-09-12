"use client";

/**
 * Cross-chain sheet — the one surface that stays simulated after the exit (spec 15 Part 8),
 * and is therefore badged on every view (D-013, Part 3).
 *
 * What this file used to be: a hand-rolled modal that read mainnet USDC balances from five
 * hardcoded mainnet token addresses (D-015), ran a fake "Across solver" progress
 * animation with a countdown, generated two 64-hex strings at random and presented them as a
 * source and a destination transaction, with an explorer link (S-2, D-014).
 *
 * What it is now: a `Sheet` that says plainly that no bridge is integrated. With
 * `NEXT_PUBLIC_DEMO_MODE=true` it walks through the shape of the deposit and ends on a result
 * that carries the `SIMULATED` badge and the literal text `no transaction — simulated`, never a
 * hash, never a link, never the word "broadcast". With the flag off it is UNAVAILABLE.
 */

import * as React from "react";
import { ArrowRight } from "lucide-react";
import { Sheet, SheetBody } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Address } from "@/components/ui/address";
import { Amount } from "@/components/ui/amount";
import { SimulatedBadge } from "@/components/ui/simulated-badge";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { isDemoMode } from "@/lib/demo";

export type SupportedSourceChainId = 42161 | 10 | 1 | 137 | 8453;

export interface ChainConfig {
  id: SupportedSourceChainId;
  name: string;
  shortName: string;
  icon: string;
}

export type DepositTokenType = "USDC" | "ETH";

export interface CrossChainModalProps {
  isOpen: boolean;
  onClose: () => void;
  rockId: string;
  smartAccountAddress: string;
  /**
   * Fired when the simulated deposit completes. **No hash is passed** — there is no
   * transaction to name (D-014). Signature changed from
   * `(amount, token, sourceChainName, txHash)`.
   */
  onDepositSuccess?: (
    amount: number,
    token: DepositTokenType,
    sourceChainName: string,
  ) => void;
}

const SOURCE_CHAINS: ChainConfig[] = [
  { id: 42161, name: "Arbitrum One", shortName: "Arbitrum", icon: "🔵" },
  { id: 10, name: "OP Mainnet", shortName: "Optimism", icon: "🔴" },
  { id: 1, name: "Ethereum", shortName: "Ethereum", icon: "⚪" },
  { id: 137, name: "Polygon PoS", shortName: "Polygon", icon: "🟣" },
  { id: 8453, name: "Base", shortName: "Base", icon: "🔷" },
];

const NO_BRIDGE_REASON =
  "No bridge is integrated yet, so money cannot actually move from another chain to this rock.";

const DECIMAL_INPUT = /^(\d+(\.\d*)?|\.\d+)$/;

const TOKENS: DepositTokenType[] = ["USDC", "ETH"];

export function CrossChainModal({
  isOpen,
  onClose,
  rockId,
  smartAccountAddress,
  onDepositSuccess,
}: CrossChainModalProps) {
  const simulated = isDemoMode();

  const [chainId, setChainId] = React.useState<SupportedSourceChainId>(42161);
  const [token, setToken] = React.useState<DepositTokenType>("USDC");
  const [amount, setAmount] = React.useState("");
  const [done, setDone] = React.useState(false);

  const selectedChain =
    SOURCE_CHAINS.find((chain) => chain.id === chainId) ?? SOURCE_CHAINS[0];
  const trimmedAmount = amount.trim();
  const parsedAmount = DECIMAL_INPUT.test(trimmedAmount) ? Number(trimmedAmount) : 0;
  const hasAmount = parsedAmount > 0;

  const handleSimulate = React.useCallback(() => {
    if (!simulated || !hasAmount) return;
    setDone(true);
    onDepositSuccess?.(parsedAmount, token, selectedChain.name);
  }, [simulated, hasAmount, parsedAmount, token, selectedChain, onDepositSuccess]);

  let footer: React.ReactNode;
  if (!simulated) {
    footer = (
      <Button type="button" size="lg" className="w-full" disabled>
        Deposit from another chain
      </Button>
    );
  } else if (done) {
    footer = (
      <Button type="button" size="lg" className="w-full" onClick={onClose}>
        Done
      </Button>
    );
  } else {
    footer = (
      <Button
        type="button"
        size="lg"
        className="w-full whitespace-normal"
        disabled={!hasAmount}
        onClick={handleSimulate}
      >
        <span className="motion-safe:transition-opacity">
          {hasAmount
            ? `Simulate sending ${trimmedAmount} ${token} from ${selectedChain.shortName}`
            : "Enter an amount"}
        </span>
        <ArrowRight aria-hidden />
      </Button>
    );
  }

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Top up from another chain"
      description={`Money you hold elsewhere, moved into rock #${rockId}'s account.`}
      headerAccessory={<SimulatedBadge />}
      footer={footer}
    >
      <SheetBody className="flex flex-col gap-6">
        {!simulated ? (
          <UnavailableState reason={NO_BRIDGE_REASON} />
        ) : done ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-h3 font-semibold text-ink">Simulated deposit complete</h3>
              <SimulatedBadge />
            </div>
            <p className="max-w-prose text-base text-ink-2">
              This is what the deposit would look like. Nothing left your wallet and nothing
              arrived in the rock.
            </p>
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 text-sm">
              <dt className="text-ink-3">Amount</dt>
              <dd className="justify-self-end">
                <Amount value={parsedAmount} symbol={token} size="sm" />
              </dd>
              <dt className="text-ink-3">From</dt>
              <dd className="justify-self-end font-medium text-ink">{selectedChain.name}</dd>
              <dt className="text-ink-3">Into</dt>
              <dd className="justify-self-end">
                <Address value={smartAccountAddress} />
              </dd>
              <dt className="text-ink-3">Transaction</dt>
              <dd className="justify-self-end text-ink-3">no transaction — simulated</dd>
            </dl>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <span className="text-label text-ink-3">THE ROCK&rsquo;S ACCOUNT</span>
              <Address value={smartAccountAddress} />
            </div>

            <fieldset className="flex flex-col gap-2">
              <legend className="text-label text-ink-3">SEND FROM</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {SOURCE_CHAINS.map((chain) => {
                  const selected = chain.id === chainId;
                  return (
                    <Button
                      key={chain.id}
                      type="button"
                      variant={selected ? "default" : "outline"}
                      aria-pressed={selected}
                      onClick={() => setChainId(chain.id)}
                      className="h-11 w-full min-w-0 gap-1.5 px-2 text-sm font-semibold"
                    >
                      <span aria-hidden>{chain.icon}</span>
                      <span className="truncate">{chain.shortName}</span>
                    </Button>
                  );
                })}
              </div>
            </fieldset>

            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor="cross-chain-amount" className="text-label text-ink-3">
                  HOW MUCH
                </label>
                <div className="flex gap-2">
                  {TOKENS.map((symbol) => (
                    <Button
                      key={symbol}
                      type="button"
                      variant={token === symbol ? "default" : "outline"}
                      aria-pressed={token === symbol}
                      onClick={() => setToken(symbol)}
                      className="h-11 rounded-full px-4 text-sm font-semibold"
                    >
                      {symbol}
                    </Button>
                  ))}
                </div>
              </div>
              <input
                id="cross-chain-amount"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                placeholder="0.0"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                className="h-14 w-full rounded-2xl border border-border bg-transparent px-3 text-num font-semibold tabular-nums text-ink outline-none placeholder:text-ink-4 focus:border-ring focus:ring-3 focus:ring-ring/50"
              />
            </div>

            <p className="max-w-prose text-sm text-ink-2">
              {NO_BRIDGE_REASON} This screen shows the shape of the flow so it can be judged on
              its design, not its numbers: no route is quoted, no fee is charged and no
              transaction is made.
            </p>
          </>
        )}
      </SheetBody>
    </Sheet>
  );
}
