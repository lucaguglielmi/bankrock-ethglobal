"use client";

/**
 * "Add funds" for the demo rock: two amount fields and one 56 px button that credits rock #420 in
 * this browser. The real "Add funds" sheet shows a QR of the Rock Account and moves nothing
 * itself; this one moves pretend money and says so in its header, its copy and its outcome line.
 */

import { useState, type ReactNode } from "react";
import { parseUnits } from "viem";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody } from "@/components/ui/sheet";
import { SimulatedBadge } from "@/components/ui/simulated-badge";
import { TokenIcon } from "@/components/ui/token-icon";
import {
  ActionOutcomeNotice,
  outcomeFrom,
  type ActionOutcome,
} from "@/components/rock/action-result";
import { tokens } from "@/lib/chain";
import type { Capability } from "@/lib/demo";
import type { DemoAmounts } from "./state";

const DECIMAL_PATTERN = /^\d*(\.\d*)?$/;
const ZERO = BigInt(0);

/** One-tap presets, in token units. */
const QUICK_USDC = ["500", "2500", "10000"] as const;
const QUICK_WETH = ["0.25", "1", "5"] as const;

function parseAmount(value: string, decimals: number): bigint | null {
  const trimmed = value.trim();
  if (trimmed === "") return ZERO;
  if (trimmed === "." || !DECIMAL_PATTERN.test(trimmed)) return null;
  try {
    return parseUnits(trimmed, decimals);
  } catch {
    return null;
  }
}

export interface DemoFundSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rockId: string;
  /** What the rock holds now, shown so the presenter sees the figure move. */
  reserves: Capability<DemoAmounts>;
  /** The demo funding action from `useDemoRockActions().fundDemo`. */
  onFund: (amounts: DemoAmounts) => Promise<Capability<DemoAmounts>>;
  isPending: boolean;
}

export function DemoFundSheet({
  open,
  onOpenChange,
  rockId,
  reserves,
  onFund,
  isPending,
}: DemoFundSheetProps) {
  const [usdcInput, setUsdcInput] = useState("");
  const [wethInput, setWethInput] = useState("");
  const [outcome, setOutcome] = useState<ActionOutcome | null>(null);

  // Start clean each time the sheet opens (state from the previous render, adjusted during render).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setUsdcInput("");
      setWethInput("");
      setOutcome(null);
    }
  }

  const usdcAmount = parseAmount(usdcInput, tokens.USDC.decimals);
  const wethAmount = parseAmount(wethInput, tokens.WETH.decimals);
  const invalid = usdcAmount === null || wethAmount === null;
  const hasAmount = !invalid && (usdcAmount > ZERO || wethAmount > ZERO);
  const done = outcome !== null && outcome.kind !== "error";

  const add = async () => {
    if (!hasAmount || usdcAmount === null || wethAmount === null) return;
    const result = await onFund({ usdc: usdcAmount, weth: wethAmount });
    // The funding result carries amounts, not a receipt; only its state matters to the notice.
    setOutcome(
      result.state === "UNAVAILABLE"
        ? { kind: "error", reason: result.reason }
        : outcomeFrom({ state: result.state, value: {} }),
    );
  };

  const footer: ReactNode = done ? (
    <Button type="button" size="lg" className="w-full" onClick={() => onOpenChange(false)}>
      Done
    </Button>
  ) : (
    <Button
      type="button"
      size="lg"
      className="w-full"
      disabled={!hasAmount || isPending}
      onClick={add}
    >
      {isPending ? "Adding…" : "Add to the rock"}
    </Button>
  );

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add funds"
      description={`Rock #${rockId} is a demo. This credits it in your browser — no wallet, no transfer.`}
      headerAccessory={<SimulatedBadge />}
      footer={footer}
    >
      <SheetBody className="flex flex-col gap-8">
        <FundField
          id="demo-fund-usdc"
          symbol="USDC"
          value={usdcInput}
          onChange={setUsdcInput}
          quick={QUICK_USDC}
          invalid={usdcAmount === null}
          disabled={done}
        />
        <FundField
          id="demo-fund-weth"
          symbol="WETH"
          value={wethInput}
          onChange={setWethInput}
          quick={QUICK_WETH}
          invalid={wethAmount === null}
          disabled={done}
        />

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-label text-ink-3">Holds now</h3>
            <SimulatedBadge />
          </div>
          {reserves.state === "UNAVAILABLE" ? (
            <p className="text-sm text-ink-3">{reserves.reason}</p>
          ) : (
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
              <Amount value={reserves.value.usdc} decimals={tokens.USDC.decimals} symbol="USDC" />
              <Amount value={reserves.value.weth} decimals={tokens.WETH.decimals} symbol="WETH" />
            </div>
          )}
          <p className="max-w-prose text-caption text-ink-3">
            Updates the moment you add. It survives a reload; &ldquo;Reset demo&rdquo; puts the
            seed back.
          </p>
        </div>

        <ActionOutcomeNotice outcome={outcome} successLabel="Added to the rock" />
      </SheetBody>
    </Sheet>
  );
}

function FundField({
  id,
  symbol,
  value,
  onChange,
  quick,
  invalid,
  disabled,
}: {
  id: string;
  symbol: "USDC" | "WETH";
  value: string;
  onChange: (value: string) => void;
  quick: readonly string[];
  invalid: boolean;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <label htmlFor={id} className="flex items-center gap-2 text-label text-ink-3">
        <TokenIcon symbol={symbol} className="size-4 text-ink-3" />
        {symbol} TO ADD
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          placeholder="0"
          aria-invalid={invalid || undefined}
          className="h-14 min-w-0 flex-1 rounded-xl border border-border bg-background px-4 text-num-lg tabular-nums text-ink placeholder:text-ink-4 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-danger"
        />
        <span className="text-sm font-medium text-ink-2">{symbol}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {quick.map((preset) => (
          <Button
            key={preset}
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-pressed={value === preset}
            onClick={() => onChange(preset)}
            className="rounded-full tabular-nums"
          >
            +{preset}
          </Button>
        ))}
      </div>
      {invalid ? (
        <p className="text-sm text-danger">That is not an amount. Digits and one decimal point.</p>
      ) : null}
    </div>
  );
}
