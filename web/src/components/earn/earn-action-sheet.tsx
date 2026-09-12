"use client";

/**
 * Add to savings / take out — one sheet for both earn writes (spec 20 Part 5).
 *
 * Three steps, the same shape as the ship sheet: an amount, a review that says in one sentence
 * what will happen, and a result that only ever states what Privy reported. The wallet signs
 * the request during the confirm step; until then nothing has been sent, and the copy says so.
 *
 * Nothing here is a rate. The only figures are the amount typed, the amount available, and —
 * on the result — the transaction hash Privy reported, through `<TxHash>` (D-014).
 */

import * as React from "react";
import { Check, Clock } from "lucide-react";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody } from "@/components/ui/sheet";
import { TxHash } from "@/components/ui/tx-hash";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { useAudio } from "@/context/audio-context";
import type { EarnOutcome } from "@/hooks/useEarn";
import type { Capability } from "@/lib/demo";
import { parseAmountInput, type EarnActionKind, type EarnVault } from "@/lib/earn/shared";
import { formatUnits } from "viem";
import { formatAmount } from "@/lib/ui/format";

export interface EarnActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: EarnActionKind;
  vault: EarnVault;
  /** The most that can move: the wallet's balance for a deposit, the position for a withdrawal. */
  available: bigint;
  chainName?: string;
  isPending: boolean;
  onSubmit: (rawAmount: bigint) => Promise<Capability<EarnOutcome>>;
  /** Fired after a result is shown, so the caller can re-read the position. */
  onDone: () => void;
}

const COPY: Record<
  EarnActionKind,
  { title: string; verb: string; done: string; pending: string; direction: (v: string, c: string) => string }
> = {
  deposit: {
    title: "Add to savings",
    verb: "Add",
    done: "Added to savings",
    pending: "Deposit submitted — still confirming",
    direction: (vault, chain) => `From your wallet on ${chain} into ${vault}.`,
  },
  withdraw: {
    title: "Take out",
    verb: "Take out",
    done: "Taken out of savings",
    pending: "Withdrawal submitted — still confirming",
    direction: (vault, chain) => `From ${vault} back to your wallet on ${chain}.`,
  },
};

export function EarnActionSheet({
  open,
  onOpenChange,
  kind,
  vault,
  available,
  chainName = "the vault's chain",
  isPending,
  onSubmit,
  onDone,
}: EarnActionSheetProps) {
  const copy = COPY[kind];
  const { playSuccess, playError } = useAudio();
  const [step, setStep] = React.useState<"amount" | "review" | "result">("amount");
  const [input, setInput] = React.useState("");
  const [outcome, setOutcome] = React.useState<Capability<EarnOutcome> | null>(null);
  const wasOpen = React.useRef(open);

  // A fresh sheet every time it opens: the previous result must not be mistaken for this one.
  React.useEffect(() => {
    if (open && !wasOpen.current) {
      setStep("amount");
      setInput("");
      setOutcome(null);
    }
    wasOpen.current = open;
  }, [open]);

  const decimals = vault.asset.decimals;
  const symbol = vault.asset.symbol.toUpperCase();
  const rawAmount = parseAmountInput(input, decimals);
  const overAvailable = rawAmount !== null && rawAmount > available;
  const canContinue = rawAmount !== null && !overAvailable;
  const availableLabel = formatAmount(available, { decimals, maxFractionDigits: 2 });

  const useMax = () => {
    // Exact, from the integer: a rounded display string could exceed what is really there.
    setInput(formatUnits(available, decimals));
  };

  const confirm = async () => {
    if (rawAmount === null) return;
    const result = await onSubmit(rawAmount);
    setOutcome(result);
    setStep("result");
    if (result.state === "UNAVAILABLE") playError();
    else playSuccess();
    onDone();
  };

  let footer: React.ReactNode;
  if (step === "amount") {
    footer = (
      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={!canContinue}
        onClick={() => setStep("review")}
      >
        {canContinue ? "Review" : overAvailable ? `Only ${availableLabel} ${symbol} available` : "Enter an amount"}
      </Button>
    );
  } else if (step === "review") {
    footer = (
      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <Button size="lg" className="w-full sm:flex-1" onClick={confirm} disabled={isPending}>
          <span className="motion-safe:transition-opacity">
            {isPending ? "Waiting for your wallet…" : `${copy.verb} ${input.trim()} ${symbol}`}
          </span>
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="w-full sm:flex-1"
          onClick={() => setStep("amount")}
          disabled={isPending}
        >
          Back
        </Button>
      </div>
    );
  } else {
    footer = (
      <Button type="button" size="lg" className="w-full" onClick={() => onOpenChange(false)}>
        Done
      </Button>
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (isPending) return;
        onOpenChange(next);
      }}
      title={copy.title}
      description={copy.direction(vault.name, chainName)}
      footer={footer}
    >
      <SheetBody className="flex flex-col gap-6">
        {step === "amount" ? (
          <>
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label htmlFor={`earn-${kind}-amount`} className="text-label text-ink-3">
                  HOW MUCH
                </label>
                <button
                  type="button"
                  onClick={useMax}
                  disabled={available === BigInt(0)}
                  className="inline-flex h-11 items-center rounded-full border border-border px-4 text-sm font-semibold text-ink hover:bg-muted disabled:opacity-50"
                >
                  Max {availableLabel} {symbol}
                </button>
              </div>
              <input
                id={`earn-${kind}-amount`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                placeholder="0.00"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                aria-invalid={overAvailable || undefined}
                className="h-14 w-full rounded-2xl border border-border bg-transparent px-3 text-num font-semibold tabular-nums text-ink outline-none placeholder:text-ink-4 focus:border-ring focus:ring-3 focus:ring-ring/50"
              />
              {overAvailable ? (
                <p role="alert" className="text-sm text-danger">
                  That is more than the {availableLabel} {symbol} available.
                </p>
              ) : null}
            </div>
            <p className="max-w-prose text-sm text-ink-2">
              {kind === "deposit"
                ? "Whatever you add stays yours. You can take it out again at any time, subject to how much the vault can pay out that moment."
                : "Takes the amount out of the vault and back into your wallet. Anything left keeps earning."}
            </p>
          </>
        ) : step === "review" ? (
          <>
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 text-sm">
              <dt className="text-ink-3">Amount</dt>
              <dd className="justify-self-end">
                <Amount value={rawAmount ?? BigInt(0)} decimals={decimals} symbol={symbol} />
              </dd>
              <dt className="text-ink-3">Vault</dt>
              <dd className="justify-self-end font-medium text-ink">{vault.name}</dd>
              <dt className="text-ink-3">Network</dt>
              <dd className="justify-self-end font-medium text-ink">{chainName}</dd>
            </dl>
            <p className="max-w-prose text-sm text-ink-2">
              Your wallet signs this request itself. Bank Rock forwards it to Privy and cannot
              change the amount, the vault or the wallet after you sign. Nothing has been sent yet.
            </p>
          </>
        ) : outcome === null || outcome.state === "UNAVAILABLE" ? (
          <UnavailableState reason={outcome?.reason ?? "Nothing was sent"} />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              {outcome.value.action.status === "succeeded" ? (
                <Check aria-hidden className="size-5 text-positive" />
              ) : (
                <Clock aria-hidden className="size-5 text-ink-3" />
              )}
              <h3 className="text-h3 font-semibold text-ink">
                {outcome.value.action.status === "succeeded" ? copy.done : copy.pending}
              </h3>
            </div>
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 text-sm">
              <dt className="text-ink-3">Amount</dt>
              <dd className="justify-self-end">
                <Amount value={rawAmount ?? BigInt(0)} decimals={decimals} symbol={symbol} />
              </dd>
              <dt className="text-ink-3">Status</dt>
              <dd className="justify-self-end font-medium capitalize text-ink">
                {outcome.value.action.status}
              </dd>
              <dt className="text-ink-3">Transaction</dt>
              <dd className="justify-self-end">
                {outcome.value.action.txHash ? (
                  <TxHash
                    value={outcome.value.action.txHash}
                    explorerHref={outcome.value.explorerHref}
                  />
                ) : (
                  <span className="text-ink-3">not reported yet</span>
                )}
              </dd>
            </dl>
            {outcome.value.action.status !== "succeeded" ? (
              <p className="max-w-prose text-sm text-ink-2">
                Privy is still confirming it on chain. Your position updates on its own once it
                lands; nothing further is needed from you.
              </p>
            ) : null}
          </div>
        )}
      </SheetBody>
    </Sheet>
  );
}
