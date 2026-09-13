"use client";

/**
 * Start earning - shipping a strategy to Aqua (spec 04, Flow B steps 8–10).
 *
 * Three things this sheet is careful about:
 *
 *  - the consequence sentence is literal. `ship` moves no tokens: the rock keeps them in its own
 *    account and Aqua records how much of that reserve this strategy may trade
 *    (`contracts/aqua/NOTES.md` §4, §7). The copy says exactly that, because "deposit" would be
 *    wrong in a way the user would only discover later;
 *  - the fee tier is the strategy's identity, not a setting. A strategy whose `feeBps` differs by
 *    one basis point hashes differently and has no balances, so it is chosen here, once, and
 *    never presented as an adjustable slider afterwards (NOTES §6);
 *  - **the choices are the streams the readers probe**, taken from `SHIP_OPTIONS`, which is
 *    derived from `DEFAULT_STREAMS`. A fee tier offered here that no reader probed would ship a
 *    strategy nothing could see. Streams already live on the rock are excluded by the caller
 *    (`excludeStreamIndexes`): a strategy is immutable, so re-shipping one reverts.
 *
 * Two steps: **offer**, then **review**. The offer is a share of the rock - one slider, 0–100 %,
 * applied to *both* holdings so the rock keeps its own price (spec 21's one-sided balancing is
 * not implemented, so nothing here invents a rebalance) - followed by the strategy cards, each
 * saying what it would be allowed to trade at that share. Anyone who wants exact figures can
 * switch to two plain amount fields; whichever mode is showing is the source of the amounts.
 *
 * Nothing is annualised anywhere in this flow (D-004).
 */

import { useState, type ReactNode } from "react";
import { formatUnits, parseUnits } from "viem";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody } from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { TokenIcon } from "@/components/ui/token-icon";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { tokens } from "@/lib/chain";
import type { Capability } from "@/lib/demo";
import { formatAmount } from "@/lib/ui/format";
import { useAudio } from "@/context/audio-context";
import { useRockActions } from "@/hooks/useBankRock";
import {
  ActionOutcomeNotice,
  outcomeFrom,
  type ActionOutcome,
} from "@/components/rock/action-result";
import { formatFeeRate } from "@/components/rock/util";
import { SHIP_OPTIONS, type ShipOption } from "@/components/rock/ship-options";
import { StrategyPicker } from "@/components/rock/strategy-picker";

const DECIMAL_PATTERN = /^\d*(\.\d*)?$/;
const ZERO = BigInt(0);
const HUNDRED = BigInt(100);

/** The shares offered as one-tap chips. The slider itself moves in steps of 5. */
const QUICK_SHARES = [25, 50, 75, 100] as const;
const SHARE_STEP = 5;
const DEFAULT_SHARE = 50;

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

/** `held × share / 100`, in base units - the same share of each holding, so the price is kept. */
function shareOf(held: bigint, share: number): bigint {
  return (held * BigInt(share)) / HUNDRED;
}

export interface ShipStrategySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rockId: string;
  reserves: Capability<{ usdc: bigint; weth: bigint }>;
  /**
   * The option the sheet opens on - what the picker on the Liquidity tab hands over. It shows as
   * selected, and the other offered options stay a tap away.
   */
  option?: ShipOption;
  /** Which stream to preselect when no `option` is given. Must be one the readers probe. */
  initialStreamIndex?: number;
  /** Older name for `initialStreamIndex`. */
  streamIndex?: number;
  /** Streams already live on this rock. They are never offered: a live strategy is immutable. */
  excludeStreamIndexes?: ReadonlyArray<number | bigint>;
  /** Narrows the offered options further. Defaults to every entry of `SHIP_OPTIONS`. */
  options?: readonly ShipOption[];
  onShipped: () => void;
}

type Step = "offer" | "review";
/** Where the amounts come from: the share slider, or two typed fields. */
type AmountMode = "share" | "manual";

interface FlowState {
  step: Step;
  option: ShipOption | null;
  mode: AmountMode;
  /** The share of the rock offered, 0–100, when `mode` is "share". */
  share: number;
  usdcInput: string;
  wethInput: string;
  outcome: ActionOutcome | null;
}

function offeredOptions(
  options: readonly ShipOption[] | undefined,
  excluded: ReadonlyArray<number | bigint> | undefined,
): ShipOption[] {
  const skip = new Set((excluded ?? []).map((index) => Number(index)));
  return (options ?? SHIP_OPTIONS).filter((candidate) => !skip.has(candidate.streamIndex));
}

function initialFlow(
  offered: readonly ShipOption[],
  option: ShipOption | undefined,
  streamIndex: number | undefined,
): FlowState {
  const preselected =
    (option && offered.find((candidate) => candidate.streamIndex === option.streamIndex)) ??
    (streamIndex !== undefined
      ? offered.find((candidate) => candidate.streamIndex === streamIndex)
      : undefined) ??
    (offered.length === 1 ? offered[0] : undefined) ??
    null;

  return {
    step: "offer",
    option: preselected,
    mode: "share",
    share: DEFAULT_SHARE,
    usdcInput: "",
    wethInput: "",
    outcome: null,
  };
}

export function ShipStrategySheet({
  open,
  onOpenChange,
  rockId,
  reserves,
  option,
  initialStreamIndex,
  streamIndex,
  excludeStreamIndexes,
  options,
  onShipped,
}: ShipStrategySheetProps) {
  const { shipStrategy, isPending } = useRockActions();
  const { playTap, playSuccess, playError } = useAudio();

  const offered = offeredOptions(options, excludeStreamIndexes);
  const preselectIndex = initialStreamIndex ?? streamIndex;

  const [flow, setFlow] = useState<FlowState>(() =>
    initialFlow(offered, option, preselectIndex),
  );

  // Start over each time the sheet is opened (previous-render state adjusted during render).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setFlow(initialFlow(offered, option, preselectIndex));
  }

  const patch = (changes: Partial<FlowState>) => setFlow((current) => ({ ...current, ...changes }));

  const held = reserves.state === "UNAVAILABLE" ? null : reserves.value;
  const holdsBoth = held !== null && held.usdc > ZERO && held.weth > ZERO;
  // A holding the read says is zero: no strategy can start until it is funded.
  const knownShort = held !== null && !holdsBoth;

  // The amounts, from whichever mode is showing.
  const shareUsdc = held ? shareOf(held.usdc, flow.share) : null;
  const shareWeth = held ? shareOf(held.weth, flow.share) : null;
  const usdcAmount =
    flow.mode === "share" ? shareUsdc : parseAmount(flow.usdcInput, tokens.USDC.decimals);
  const wethAmount =
    flow.mode === "share" ? shareWeth : parseAmount(flow.wethInput, tokens.WETH.decimals);

  const tooMuchUsdc = held !== null && usdcAmount !== null && usdcAmount > held.usdc;
  const tooMuchWeth = held !== null && wethAmount !== null && wethAmount > held.weth;
  const hasAmounts =
    usdcAmount !== null && wethAmount !== null && usdcAmount > ZERO && wethAmount > ZERO;
  const canReview = flow.option !== null && hasAmounts && !tooMuchUsdc && !tooMuchWeth;
  const shipped = flow.outcome !== null && flow.outcome.kind !== "error";

  /** Switch to the typed fields, starting from what the slider was offering. */
  const switchToManual = () =>
    patch({
      mode: "manual",
      usdcInput: shareUsdc !== null && shareUsdc > ZERO ? formatUnits(shareUsdc, tokens.USDC.decimals) : "",
      wethInput: shareWeth !== null && shareWeth > ZERO ? formatUnits(shareWeth, tokens.WETH.decimals) : "",
    });

  const confirm = async () => {
    if (!canReview || flow.option === null || usdcAmount === null || wethAmount === null) return;
    playTap();
    const result = outcomeFrom(
      await shipStrategy(rockId, {
        usdcAmount,
        wethAmount,
        feeBps: flow.option.feeBps,
        streamIndex: flow.option.streamIndex,
      }),
    );
    patch({ outcome: result });
    if (result.kind === "error") {
      playError();
      return;
    }
    playSuccess();
    onShipped();
  };

  let footer: ReactNode;
  if (offered.length === 0) {
    footer = undefined;
  } else if (flow.step === "offer") {
    footer = (
      <Button
        size="lg"
        className="w-full"
        disabled={!canReview}
        onClick={() => patch({ outcome: null, step: "review" })}
      >
        Review
      </Button>
    );
  } else if (shipped) {
    footer = (
      <Button size="lg" className="w-full" onClick={() => onOpenChange(false)}>
        Done
      </Button>
    );
  } else {
    footer = (
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
          onClick={() => patch({ step: "offer" })}
          disabled={isPending}
        >
          Back
        </Button>
      </div>
    );
  }

  /** "2.5 USDC · 0.0025 WETH" - what a card would ship at the current offer. */
  const breakdownText =
    usdcAmount !== null && wethAmount !== null
      ? `${formatAmount(usdcAmount, { decimals: tokens.USDC.decimals, maxFractionDigits: 2 })} USDC · ${formatAmount(wethAmount, { decimals: tokens.WETH.decimals, maxFractionDigits: 4 })} WETH`
      : null;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Start earning"
      description="Let people trade against this rock."
      footer={footer}
    >
      <SheetBody className="flex flex-col gap-8">
        {offered.length === 0 ? (
          <p className="max-w-prose text-base text-ink-2">
            Every strategy this rock can run is already live.
          </p>
        ) : flow.step === "offer" ? (
          <>
            <section className="flex flex-col gap-4">
              <h3 className="text-h3 font-semibold text-ink">
                How much of the rock to put to work
              </h3>

              {flow.mode === "share" ? (
                <ShareControl
                  share={flow.share}
                  onShareChange={(share) => patch({ share })}
                  disabled={!holdsBoth}
                  usdc={shareUsdc}
                  weth={shareWeth}
                />
              ) : (
                <>
                  <AmountField
                    id="ship-usdc"
                    label="USDC to make available"
                    symbol="USDC"
                    value={flow.usdcInput}
                    onChange={(value) => patch({ usdcInput: value })}
                    max={held ? formatUnits(held.usdc, tokens.USDC.decimals) : null}
                    tooMuch={tooMuchUsdc}
                  />
                  <AmountField
                    id="ship-weth"
                    label="WETH to make available"
                    symbol="WETH"
                    value={flow.wethInput}
                    onChange={(value) => patch({ wethInput: value })}
                    max={held ? formatUnits(held.weth, tokens.WETH.decimals) : null}
                    tooMuch={tooMuchWeth}
                  />
                </>
              )}

              {reserves.state === "UNAVAILABLE" ? (
                <UnavailableState reason={reserves.reason} className="py-4" />
              ) : knownShort ? (
                <p className="max-w-prose text-sm text-ink-2">
                  A strategy needs both USDC and WETH, and this rock holds no{" "}
                  {reserves.value.usdc === ZERO ? "USDC" : "WETH"} yet.
                </p>
              ) : null}
            </section>

            <section className="flex flex-col gap-4">
              <h3 className="text-h3 font-semibold text-ink">How it earns</h3>
              <StrategyPicker
                options={offered}
                selectedStreamIndex={flow.option?.streamIndex ?? null}
                disabled={knownShort}
                onPick={(picked) => patch({ option: picked })}
                renderDetail={breakdownText ? () => breakdownText : undefined}
              />
              <div className="flex flex-col gap-3">
                <p className="max-w-prose text-sm text-ink-3">
                  The fee is fixed once you start. Changing it later means starting another
                  stream.
                </p>
                <Button
                  variant="link"
                  size="sm"
                  className="self-start px-0 text-link"
                  onClick={flow.mode === "share" ? switchToManual : () => patch({ mode: "share" })}
                >
                  {flow.mode === "share" ? "Set amounts by hand instead" : "Use the slider instead"}
                </Button>
              </div>
            </section>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-3 rounded-2xl border border-border p-4">
              <div className="flex flex-col gap-1">
                <span className="text-label text-ink-3">Available to trade</span>
                <span className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                  <Amount value={usdcAmount ?? ZERO} decimals={tokens.USDC.decimals} symbol="USDC" />
                  <Amount value={wethAmount ?? ZERO} decimals={tokens.WETH.decimals} symbol="WETH" />
                </span>
              </div>
              {flow.option ? (
                <p className="text-sm text-ink-2">
                  {flow.option.label} - earns {formatFeeRate(flow.option.feeBps)} of every trade.
                </p>
              ) : null}
            </div>

            <p className="max-w-prose text-base text-ink-2">
              Your rock keeps its tokens; Aqua tracks what is available to trade.
            </p>
            <p className="max-w-prose text-sm text-ink-3">
              You can stop at any time, and the fees stay in the rock&rsquo;s own balance - there is
              nothing to collect.
            </p>

            <ActionOutcomeNotice outcome={flow.outcome} successLabel="This rock is trading" />
          </>
        )}
      </SheetBody>
    </Sheet>
  );
}

/**
 * The share of the rock on offer: the big percentage, the slider, four quick chips, and the
 * live "= X USDC + Y WETH" line. Both tokens are scaled by the same share, so the rock's own
 * price is what a visitor trades against.
 */
function ShareControl({
  share,
  onShareChange,
  disabled,
  usdc,
  weth,
}: {
  share: number;
  onShareChange: (share: number) => void;
  disabled: boolean;
  usdc: bigint | null;
  weth: bigint | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-num-lg font-bold tabular-nums text-ink">
        {share}%
      </p>
      <Slider
        aria-label="Share of the rock to put to work"
        formatValueText={(value) => `${value}%`}
        value={share}
        onValueChange={onShareChange}
        min={0}
        max={100}
        step={SHARE_STEP}
        disabled={disabled}
      />
      <div className="flex flex-wrap gap-2">
        {QUICK_SHARES.map((quick) => (
          <button
            key={quick}
            type="button"
            aria-pressed={share === quick}
            disabled={disabled}
            onClick={() => onShareChange(quick)}
            className="inline-flex h-11 min-w-16 items-center justify-center rounded-full border border-border bg-background px-4 text-sm font-medium tabular-nums text-ink motion-safe:transition-colors hover:bg-muted aria-pressed:border-ink aria-pressed:bg-ink aria-pressed:text-background disabled:pointer-events-none disabled:opacity-50"
          >
            {quick}%
          </button>
        ))}
      </div>
      {usdc !== null && weth !== null ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-ink-2">
          <span aria-hidden>=</span>
          <span className="inline-flex items-center gap-1.5">
            <TokenIcon symbol="USDC" className="size-5 text-ink-2" />
            <Amount value={usdc} decimals={tokens.USDC.decimals} symbol="USDC" size="sm" />
          </span>
          <span aria-hidden>+</span>
          <span className="inline-flex items-center gap-1.5">
            <TokenIcon symbol="WETH" className="size-5 text-ink-2" />
            <Amount value={weth} decimals={tokens.WETH.decimals} symbol="WETH" size="sm" />
          </span>
        </p>
      ) : null}
    </div>
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
