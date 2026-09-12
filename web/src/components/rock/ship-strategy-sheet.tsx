"use client";

/**
 * Start earning — shipping a strategy to Aqua (spec 04, Flow B steps 8–10).
 *
 * Three things this sheet is careful about:
 *
 *  - the consequence sentence is literal. `ship` moves no tokens: the rock keeps them in its own
 *    account and Aqua records how much of that reserve this strategy may trade
 *    (`contracts/aqua/NOTES.md` §7). The copy says exactly that, because "deposit" would be
 *    wrong in a way the user would only discover later;
 *  - the fee tier is the strategy's identity, not a setting. A strategy whose `feeBps` differs by
 *    one basis point hashes differently and has no balances, so it is chosen here, once, and
 *    never presented as an adjustable slider afterwards (NOTES §6);
 *  - **the choices are the streams the readers probe**, taken from `SHIP_OPTIONS`, which is
 *    derived from `DEFAULT_STREAMS`. The free 5 / 30 / 100 bps tiers this sheet used to offer on
 *    stream 0 could ship a strategy that `findShippedStream` never looks for: the position card,
 *    the Trade button, the quote route and Cash in would all report "not trading" over a live
 *    allowance, with no way back short of shipping again at the fee a reader knows.
 *
 * Nothing is annualised anywhere in this flow (D-004).
 */

import { useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody } from "@/components/ui/sheet";
import { tokens } from "@/lib/chain";
import type { Capability } from "@/lib/demo";
import { cn } from "@/lib/ui/cn";
import { useAudio } from "@/context/audio-context";
import { useRockActions } from "@/hooks/useBankRock";
import {
  ActionOutcomeNotice,
  outcomeFrom,
  type ActionOutcome,
} from "@/components/rock/action-result";
import { formatFeeRate } from "@/components/rock/util";
import { SHIP_OPTIONS, shipOptionFor, type ShipOption } from "@/components/rock/ship-options";

const DECIMAL_PATTERN = /^\d*(\.\d*)?$/;

/** Parses a typed amount into base units. Returns null for anything that is not a clean number. */
function parseAmount(value: string, decimals: number): bigint | null {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "." || !DECIMAL_PATTERN.test(trimmed)) return null;
  try {
    return parseUnits(trimmed, decimals);
  } catch {
    return null;
  }
}

export interface ShipStrategySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rockId: string;
  reserves: Capability<{ usdc: bigint; weth: bigint }>;
  /** Which stream the sheet opens on. It must be one the readers probe; see `ship-options.ts`. */
  streamIndex?: number;
  onShipped: () => void;
}

export function ShipStrategySheet({
  open,
  onOpenChange,
  rockId,
  reserves,
  streamIndex = 0,
  onShipped,
}: ShipStrategySheetProps) {
  const { shipStrategy, isPending } = useRockActions();
  const { playTap, playSuccess, playError } = useAudio();

  const [step, setStep] = useState<"amounts" | "review">("amounts");
  const [usdcInput, setUsdcInput] = useState("");
  const [wethInput, setWethInput] = useState("");
  const [option, setOption] = useState<ShipOption>(() => shipOptionFor(streamIndex));
  const [outcome, setOutcome] = useState<ActionOutcome | null>(null);

  const held = reserves.state === "UNAVAILABLE" ? null : reserves.value;
  const usdcAmount = parseAmount(usdcInput, tokens.USDC.decimals);
  const wethAmount = parseAmount(wethInput, tokens.WETH.decimals);

  const tooMuchUsdc = held !== null && usdcAmount !== null && usdcAmount > held.usdc;
  const tooMuchWeth = held !== null && wethAmount !== null && wethAmount > held.weth;
  const hasAmounts =
    usdcAmount !== null && wethAmount !== null && usdcAmount > BigInt(0) && wethAmount > BigInt(0);
  const canReview = hasAmounts && !tooMuchUsdc && !tooMuchWeth;

  const confirm = async () => {
    if (!canReview || usdcAmount === null || wethAmount === null) return;
    playTap();
    const result = outcomeFrom(
      await shipStrategy(rockId, {
        usdcAmount,
        wethAmount,
        feeBps: option.feeBps,
        streamIndex: option.streamIndex,
      }),
    );
    setOutcome(result);
    if (result.kind === "error") {
      playError();
      return;
    }
    playSuccess();
    onShipped();
  };

  const footer =
    step === "amounts" ? (
      <Button
        size="lg"
        className="w-full"
        disabled={!canReview}
        onClick={() => {
          setOutcome(null);
          setStep("review");
        }}
      >
        Review
      </Button>
    ) : (
      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <Button
          size="lg"
          className="w-full sm:flex-1"
          onClick={confirm}
          disabled={isPending || !canReview}
        >
          {isPending ? "Starting…" : "Start earning"}
        </Button>
        <Button
          size="lg"
          variant="outline"
          className="w-full sm:flex-1"
          onClick={() => setStep("amounts")}
        >
          Back
        </Button>
      </div>
    );

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Start earning"
      description="Let people trade against this rock."
      footer={footer}
    >
      <SheetBody className="flex flex-col gap-6">
        {step === "amounts" ? (
          <>
            <AmountField
              id="ship-usdc"
              label="USDC to make available"
              symbol="USDC"
              value={usdcInput}
              onChange={setUsdcInput}
              max={held ? formatUnits(held.usdc, tokens.USDC.decimals) : null}
              tooMuch={tooMuchUsdc}
            />
            <AmountField
              id="ship-weth"
              label="WETH to make available"
              symbol="WETH"
              value={wethInput}
              onChange={setWethInput}
              max={held ? formatUnits(held.weth, tokens.WETH.decimals) : null}
              tooMuch={tooMuchWeth}
            />

            <fieldset className="flex flex-col gap-2">
              <legend className="text-label text-ink-3">What each trade pays this rock</legend>
              <div
                className={cn(
                  "grid grid-cols-1 gap-2",
                  SHIP_OPTIONS.length > 1 ? "sm:grid-cols-2" : null,
                )}
              >
                {SHIP_OPTIONS.map((candidate) => {
                  const isActive = candidate.streamIndex === option.streamIndex;
                  return (
                    <button
                      key={candidate.streamIndex}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => setOption(candidate)}
                      className={cn(
                        "flex min-h-12 flex-col justify-center rounded-2xl border px-4 py-2 text-left motion-safe:transition-colors",
                        isActive
                          ? "border-ink bg-ink text-background"
                          : "border-border bg-background text-ink-2 hover:bg-muted",
                      )}
                    >
                      <span className="text-sm font-semibold">
                        {candidate.label} — {formatFeeRate(candidate.feeBps)}
                      </span>
                      <span
                        className={cn(
                          "text-caption",
                          isActive ? "text-background/80" : "text-ink-3",
                        )}
                      >
                        {candidate.hint}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="max-w-prose text-sm text-ink-3">
                This is fixed once you start. Changing it later means starting a new stream.
              </p>
            </fieldset>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-3 rounded-2xl border border-border p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-label text-ink-3">Available to trade</span>
                <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <Amount
                    value={usdcAmount ?? BigInt(0)}
                    decimals={tokens.USDC.decimals}
                    symbol="USDC"
                  />
                  <Amount
                    value={wethAmount ?? BigInt(0)}
                    decimals={tokens.WETH.decimals}
                    symbol="WETH"
                  />
                </span>
              </div>
              <p className="text-sm text-ink-2">
                {option.label} — earns {formatFeeRate(option.feeBps)} of every trade.
              </p>
            </div>

            <p className="max-w-prose text-base text-ink-2">
              Your rock keeps its tokens; Aqua tracks what is available to trade.
            </p>
            <p className="max-w-prose text-sm text-ink-3">
              You can stop at any time with Cash in, and the fees stay in the rock&rsquo;s own
              balance — there is nothing to collect.
            </p>

            <ActionOutcomeNotice outcome={outcome} successLabel="This rock is trading" />
          </>
        )}
      </SheetBody>
    </Sheet>
  );
}

function AmountField({
  id,
  label,
  symbol,
  value,
  onChange,
  max,
  tooMuch,
}: {
  id: string;
  label: string;
  symbol: string;
  value: string;
  onChange: (value: string) => void;
  max: string | null;
  tooMuch: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-label text-ink-3">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(changed) => onChange(changed.target.value)}
          placeholder="0"
          className="h-14 min-w-0 flex-1 rounded-xl border border-border bg-background px-4 text-num-lg tabular-nums text-ink placeholder:text-ink-4"
        />
        <span className="text-sm font-medium text-ink-2">{symbol}</span>
        {max !== null ? (
          <Button variant="outline" size="sm" onClick={() => onChange(max)}>
            Max
          </Button>
        ) : null}
      </div>
      {tooMuch ? (
        <p className="text-sm text-danger">This rock does not hold that much {symbol}.</p>
      ) : max !== null ? (
        <p className="text-sm text-ink-3">
          Holds {max} {symbol}.
        </p>
      ) : null}
    </div>
  );
}
