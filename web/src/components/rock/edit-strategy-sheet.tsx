"use client";

/**
 * Edit a live stream — which, on Aqua, means making more of the rock available to it
 * (`contracts/aqua/NOTES.md` §4, §7; `Aqua.sol` `push`).
 *
 * A strategy is immutable: its fee is part of its hash, and a docked stream can never be revived.
 * The one thing that can change is the virtual balance, and only upwards, through
 * `Aqua.push(maker, app, strategyHash, token, amount)` from the rock's own account. So this sheet
 * says three things plainly and offers nothing else:
 *
 *  - the fee is fixed;
 *  - saving raises what Aqua may trade from the rock's account on this strategy. No tokens move —
 *    the rock keeps them, exactly as when the stream started;
 *  - making *less* available is not an edit. It is Stop, one tap away.
 *
 * Amounts are what is *added*, so the review line states the total the stream will then allow.
 * Nothing here is annualised (D-004).
 */

import { useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { Amount } from "@/components/ui/amount";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody } from "@/components/ui/sheet";
import { TokenIcon } from "@/components/ui/token-icon";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { tokens } from "@/lib/chain";
import type { Capability } from "@/lib/demo";
import { useAudio } from "@/context/audio-context";
import { useRockActions } from "@/hooks/useBankRock";
import type { ParsedStream } from "@/hooks/useAquaStrategy";
import {
  ActionOutcomeNotice,
  outcomeFrom,
  type ActionOutcome,
} from "@/components/rock/action-result";
import { streamName } from "@/components/rock/stream-card";
import { formatFeeRate } from "@/components/rock/util";

const DECIMAL_PATTERN = /^\d*(\.\d*)?$/;
const ZERO = BigInt(0);

/** Parses a typed amount into base units. Null for anything that is not a clean number. */
function parseAmount(value: string, decimals: number): bigint | null {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "." || !DECIMAL_PATTERN.test(trimmed)) return null;
  try {
    return parseUnits(trimmed, decimals);
  } catch {
    return null;
  }
}

export interface EditStrategySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rockId: string;
  /** The live stream being edited, as the page last read it. */
  stream: ParsedStream;
  /** The rock's real balances — the ceiling on what can be added. */
  reserves: Capability<{ usdc: bigint; weth: bigint }>;
  /** Called once the push has really gone through. */
  onSaved: () => void;
  /** "Stop instead": the caller closes this sheet and opens the stop sheet for the same stream. */
  onStopInstead: () => void;
}

interface FormState {
  usdcInput: string;
  wethInput: string;
  outcome: ActionOutcome | null;
}

const EMPTY: FormState = { usdcInput: "", wethInput: "", outcome: null };

export function EditStrategySheet({
  open,
  onOpenChange,
  rockId,
  stream,
  reserves,
  onSaved,
  onStopInstead,
}: EditStrategySheetProps) {
  const { topUpStrategy, isPending } = useRockActions();
  const { playTap, playSuccess, playError } = useAudio();
  const [form, setForm] = useState<FormState>(EMPTY);

  // Start over each time the sheet is opened (previous-render state adjusted during render).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setForm(EMPTY);
  }

  const patch = (changes: Partial<FormState>) => setForm((current) => ({ ...current, ...changes }));

  const held = reserves.state === "UNAVAILABLE" ? null : reserves.value;

  // Empty means "add nothing" for that token; anything typed must parse.
  const usdcAdd = form.usdcInput.trim() === "" ? ZERO : parseAmount(form.usdcInput, tokens.USDC.decimals);
  const wethAdd = form.wethInput.trim() === "" ? ZERO : parseAmount(form.wethInput, tokens.WETH.decimals);

  const tooMuchUsdc = held !== null && usdcAdd !== null && usdcAdd > held.usdc;
  const tooMuchWeth = held !== null && wethAdd !== null && wethAdd > held.weth;
  const addsSomething =
    usdcAdd !== null && wethAdd !== null && (usdcAdd > ZERO || wethAdd > ZERO);
  const canSave = addsSomething && !tooMuchUsdc && !tooMuchWeth && held !== null;
  const saved = form.outcome !== null && form.outcome.kind !== "error";

  const thenUsdc = stream.virtual.usdc + (usdcAdd ?? ZERO);
  const thenWeth = stream.virtual.weth + (wethAdd ?? ZERO);

  const save = async () => {
    if (!canSave || usdcAdd === null || wethAdd === null) return;
    playTap();
    const result = outcomeFrom(
      await topUpStrategy(rockId, {
        streamIndex: Number(stream.streamIndex),
        usdcAmount: usdcAdd,
        wethAmount: wethAdd,
      }),
    );
    patch({ outcome: result });
    if (result.kind === "error") {
      playError();
      return;
    }
    playSuccess();
    onSaved();
  };

  const footer = saved ? (
    <Button size="lg" className="w-full" onClick={() => onOpenChange(false)}>
      Done
    </Button>
  ) : (
    <Button size="lg" className="w-full" onClick={save} disabled={isPending || !canSave}>
      {isPending ? "Saving…" : "Save"}
    </Button>
  );

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Edit ${streamName(stream)}`}
      description={`The fee is fixed at ${formatFeeRate(stream.feeBps)}. You can make more of the rock available to this strategy.`}
      footer={footer}
    >
      <SheetBody className="flex flex-col gap-8">
        <div className="flex flex-col gap-1">
          <span className="text-label text-ink-3">Allowed by this stream</span>
          <span className="flex flex-wrap items-center gap-x-6 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <TokenIcon symbol="USDC" className="size-5 text-ink-2" />
              <Amount value={stream.virtual.usdc} decimals={tokens.USDC.decimals} symbol="USDC" />
            </span>
            <span className="inline-flex items-center gap-1.5">
              <TokenIcon symbol="WETH" className="size-5 text-ink-2" />
              <Amount value={stream.virtual.weth} decimals={tokens.WETH.decimals} symbol="WETH" />
            </span>
          </span>
          <span className="max-w-prose text-caption text-ink-3">
            An allowance against the rock&rsquo;s reserve, not a separate pot.
          </span>
        </div>

        <section className="flex flex-col gap-4">
          <AmountField
            id="edit-usdc"
            label="Add USDC"
            symbol="USDC"
            value={form.usdcInput}
            onChange={(value) => patch({ usdcInput: value, outcome: null })}
            max={held ? formatUnits(held.usdc, tokens.USDC.decimals) : null}
            tooMuch={tooMuchUsdc}
            disabled={saved || isPending}
          />
          <AmountField
            id="edit-weth"
            label="Add WETH"
            symbol="WETH"
            value={form.wethInput}
            onChange={(value) => patch({ wethInput: value, outcome: null })}
            max={held ? formatUnits(held.weth, tokens.WETH.decimals) : null}
            tooMuch={tooMuchWeth}
            disabled={saved || isPending}
          />
          {reserves.state === "UNAVAILABLE" ? (
            <UnavailableState reason={reserves.reason} className="py-4" />
          ) : null}
        </section>

        <div className="flex flex-col gap-3">
          <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-base text-ink-2">
            <span>This strategy will then allow</span>
            <Amount value={thenUsdc} decimals={tokens.USDC.decimals} symbol="USDC" size="sm" />
            <span>and</span>
            <Amount value={thenWeth} decimals={tokens.WETH.decimals} symbol="WETH" size="sm" />
          </p>
          <p className="max-w-prose text-sm text-ink-3">
            No tokens move. The rock keeps them in its own account; this only raises what Aqua may
            trade from that account on this strategy.
          </p>
        </div>

        <div className="flex flex-col gap-1 border-t border-border pt-4">
          <p className="max-w-prose text-sm text-ink-3">
            To make less available, stop this strategy.
          </p>
          <Button
            variant="link"
            size="sm"
            className="self-start px-0 text-link"
            onClick={onStopInstead}
            disabled={isPending}
          >
            Stop instead
          </Button>
        </div>

        <ActionOutcomeNotice outcome={form.outcome} successLabel="This strategy allows more now" />
      </SheetBody>
    </Sheet>
  );
}

/**
 * One typed amount with a Max. The same field the ship sheet uses for its by-hand mode; it lives
 * there un-exported, so this is its twin until one of them moves to `components/ui`.
 */
function AmountField({
  id,
  label,
  symbol,
  value,
  onChange,
  max,
  tooMuch,
  disabled,
}: {
  id: string;
  label: string;
  symbol: string;
  value: string;
  onChange: (value: string) => void;
  max: string | null;
  tooMuch: boolean;
  disabled?: boolean;
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
          disabled={disabled}
          className="h-14 min-w-0 flex-1 rounded-xl border border-border bg-background px-4 text-num-lg tabular-nums text-ink placeholder:text-ink-4 disabled:opacity-50"
        />
        <span className="text-sm font-medium text-ink-2">{symbol}</span>
        {max !== null ? (
          <Button variant="outline" size="sm" onClick={() => onChange(max)} disabled={disabled}>
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
