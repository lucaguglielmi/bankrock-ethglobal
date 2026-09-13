"use client";

/**
 * Start earning — shipping a strategy to Aqua (spec 04, Flow B steps 8–10).
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
 * Three steps: choose (skipped when the caller preselected an option, or only one is left),
 * amounts, review. The chosen strategy stays visible as a summary with a "Change" affordance, so
 * the choice is never out of sight while the amounts are typed.
 *
 * Nothing is annualised anywhere in this flow (D-004).
 */

import { useState, type ReactNode } from "react";
import { formatUnits, parseUnits } from "viem";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody } from "@/components/ui/sheet";
import { tokens } from "@/lib/chain";
import type { Capability } from "@/lib/demo";
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
  /**
   * The option the sheet opens on — what the picker on the Liquidity tab hands over. When given,
   * the choose step is skipped and the option shows as a summary with a "Change" affordance.
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

type Step = "choose" | "amounts" | "review";

interface FlowState {
  step: Step;
  option: ShipOption | null;
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
    step: preselected ? "amounts" : "choose",
    option: preselected,
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
  const usdcAmount = parseAmount(flow.usdcInput, tokens.USDC.decimals);
  const wethAmount = parseAmount(flow.wethInput, tokens.WETH.decimals);

  const tooMuchUsdc = held !== null && usdcAmount !== null && usdcAmount > held.usdc;
  const tooMuchWeth = held !== null && wethAmount !== null && wethAmount > held.weth;
  const hasAmounts =
    usdcAmount !== null && wethAmount !== null && usdcAmount > ZERO && wethAmount > ZERO;
  const canReview = flow.option !== null && hasAmounts && !tooMuchUsdc && !tooMuchWeth;
  const shipped = flow.outcome !== null && flow.outcome.kind !== "error";

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
  if (flow.step === "choose") {
    footer = undefined;
  } else if (flow.step === "amounts") {
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
          onClick={() => patch({ step: "amounts" })}
          disabled={isPending}
        >
          Back
        </Button>
      </div>
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Start earning"
      description={
        flow.step === "choose"
          ? "Choose how this rock earns."
          : "Let people trade against this rock."
      }
      footer={footer}
    >
      <SheetBody className="flex flex-col gap-6">
        {offered.length === 0 ? (
          <p className="max-w-prose text-base text-ink-2">
            Every strategy this rock can run is already live.
          </p>
        ) : flow.step === "choose" ? (
          <>
            <StrategyPicker
              options={offered}
              selectedStreamIndex={flow.option?.streamIndex}
              onPick={(picked) => patch({ option: picked, step: "amounts" })}
            />
            <p className="max-w-prose text-sm text-ink-3">
              The fee is fixed once you start. Changing it later means starting another stream.
            </p>
          </>
        ) : flow.step === "amounts" ? (
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

            {flow.option ? (
              <StrategySummary
                option={flow.option}
                onChange={offered.length > 1 ? () => patch({ step: "choose" }) : undefined}
              />
            ) : null}
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
                  {flow.option.label} — earns {formatFeeRate(flow.option.feeBps)} of every trade.
                </p>
              ) : null}
            </div>

            <p className="max-w-prose text-base text-ink-2">
              Your rock keeps its tokens; Aqua tracks what is available to trade.
            </p>
            <p className="max-w-prose text-sm text-ink-3">
              You can stop at any time, and the fees stay in the rock&rsquo;s own balance — there is
              nothing to collect.
            </p>

            <ActionOutcomeNotice outcome={flow.outcome} successLabel="This rock is trading" />
          </>
        )}
      </SheetBody>
    </Sheet>
  );
}

/** The chosen strategy, as a summary — its name, fee and one line — with a way to change it. */
function StrategySummary({ option, onChange }: { option: ShipOption; onChange?: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-label text-ink-3">Strategy</span>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border p-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-base font-semibold text-ink">
            {option.label} — {formatFeeRate(option.feeBps)}
          </span>
          <span className="max-w-prose text-sm text-ink-3">{option.hint}</span>
        </div>
        {onChange ? (
          <Button variant="outline" size="sm" onClick={onChange}>
            Change
          </Button>
        ) : null}
      </div>
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
