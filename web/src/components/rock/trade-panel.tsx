"use client";

/**
 * The trade panel (Flow D; spec 17 §4.5, Part 5 "Trade sheet"; spec 15 Phase 3, SC-4).
 *
 * What this file used to be: a hand-rolled centred modal with its own Escape handler and
 * backdrop, hardcoded trader balances (`USDC: 500, WETH: 0.25` — N-4), an invented price-impact
 * formula (N-6), a hardcoded mainnet pair of token addresses, a receipt naming the wrong network,
 * a synthesized hash in the success state (D-014) and a swipe-to-swap gesture whose knob
 * disappeared under the clip before its 200 px threshold on a 360 px phone (L-6). Then it became
 * a `Sheet`, then three stacked cards.
 *
 * What it is now: `TradePanel`, inline content for the rock dashboard's Trade tab — one card with
 * two halves ("Top up the rock" / "Send from the rock"), a flip button riding the divider between
 * them, the deal-quality row always in view, the rest of the quote behind a "Details" disclosure,
 * and the one 56 px button in a footer band whose label morphs with the state (STEERING.md). Every
 * number on screen comes from `GET /api/rocks/[id]/quote` — the amount out, the fee in basis points
 * and the price impact in basis points, all from the same source that will execute the swap — or
 * from a real balance read of the visitor's account. Nothing is computed here except the slippage
 * floor and the per-unit rate, both of which are arithmetic on the quote. The button calls
 * `useTakerActions().swap`, and the receipt is whatever that returns — a real hash, or an honest
 * reason.
 *
 * A rock may have several live streams at once. When it does, a "Trading against" chip row above
 * the card picks the one the quote and the swap are aimed at, defaulting to the lowest fee.
 *
 * The panel also shows **the account the swap comes from**: the visitor's personal Safe (D-029,
 * salt 0) and its two balances, in a compact row under the card. Its address sits behind a "Show
 * address" disclosure so no hex is on screen at load, but it is one tap away: an account that
 * holds nothing says so, and blocks the button, before anything is signed — and the visitor can
 * see where to send tokens.
 *
 * The `TradeModal` sheet wrapper is gone: the tabbed dashboard renders `TradePanel` inline
 * through `rock/tabs/trade-tab.tsx`, and nothing else opened the sheet.
 */

import * as React from "react";
import { formatUnits, parseUnits, type Address } from "viem";
import { Collapsible } from "@base-ui/react/collapsible";
import { ArrowUpDown, ChevronDown, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
// Aliased: `Address` is viem's address *type* in this file, and the primitive is a component.
import { Address as AddressLine } from "@/components/ui/address";
import { Amount } from "@/components/ui/amount";
import { TokenIcon } from "@/components/ui/token-icon";
import { HelpTerm } from "@/components/ui/popover";
import { CapabilityResult } from "@/components/sheets/capability-result";
import { defaultStream, TradeStreamPicker } from "@/components/rock/trade-stream-picker";
import { cn } from "@/lib/ui/cn";
import { defaultMaxFractionDigits, formatAmount, toDisplayNumber } from "@/lib/ui/format";
import { explorer, tokens, type TokenSymbol } from "@/lib/chain";
import type { Capability } from "@/lib/demo";
import { useAuth } from "@/context/auth-context";
import { useTakerActions } from "@/hooks/useTakerActions";
import type { ParsedStream } from "@/hooks/useAquaStrategy";

const QUOTE_DEBOUNCE_MS = 350;

/** The deal the user is promised cannot get worse than this before it reverts. */
const SLIPPAGE_TOLERANCE_BPS = 50; // 0.50 %
const BPS_DENOMINATOR = 10_000;

/** Accepts "12", "12.", ".5", "0.0091" — anything a decimal keypad can produce. */
const DECIMAL_INPUT = /^(\d+(\.\d*)?|\.\d+)$/;

export const NO_MAKER_REASON =
  "This rock has no account yet, so there is nothing to trade against.";

const EMPTY_STREAMS: readonly ParsedStream[] = [];

export interface TradePanelProps {
  rockId: string;
  /** The rock's account — the maker the quote and the swap are aimed at. */
  maker?: Address;
  /**
   * The rock's live streams. With more than one, a "Trading against" picker chooses which stream
   * the quote and the swap use; the lowest fee is selected first.
   */
  streams?: readonly ParsedStream[];
  /** Pins the stream to trade against and hides the picker. */
  streamIndex?: number;
  authenticated: boolean;
  /** Opens the onboarding sheet. Falls back to `login()` when the page does not supply one. */
  onRequestSignIn?: () => void;
  /** Called once a swap has really executed — the page refetches what the chain now says. */
  onTradeSuccess?: () => void;
  className?: string;
}

/** `GET /api/rocks/[id]/quote` — `amountOut` is in base units, `amountOutFormatted` is decimal. */
interface QuoteValue {
  amountOut: string;
  amountOutFormatted: string;
  feeBps: number;
  priceImpactBps: number;
  source: string;
}

interface QuoteResponseBody {
  state?: "REAL" | "UNAVAILABLE";
  reason?: string;
  value?: Partial<QuoteValue>;
}

type QuoteState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "real"; value: QuoteValue }
  | { status: "unavailable"; reason: string };

type SwapResult = Capability<{ txHash: `0x${string}`; amountOut: bigint }>;

function otherToken(symbol: TokenSymbol): TokenSymbol {
  return symbol === "USDC" ? "WETH" : "USDC";
}

function isBaseUnits(value: unknown): value is string {
  return typeof value === "string" && /^\d+$/.test(value);
}

/** Base units for a string that already matched `DECIMAL_INPUT`, or null if viem refuses it. */
function toBaseUnits(value: string, decimals: number): bigint | null {
  try {
    return parseUnits(value, decimals);
  } catch {
    return null;
  }
}

/** Deal quality, in the user's words (STEERING.md). Colours are tokens only (§3.5). */
function impactTone(bps: number): { text: string; bar: string; word: string } {
  if (bps < 50) return { text: "text-positive", bar: "bg-positive", word: "Good" };
  if (bps < 200) return { text: "text-warning", bar: "bg-warning", word: "Fair" };
  return { text: "text-danger", bar: "bg-danger", word: "Poor" };
}

function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

/**
 * How many decimals a per-unit rate needs to be legible: two for anything at or above one, and
 * enough to show three meaningful digits for anything smaller ("0.00099 WETH", not "0.0010").
 */
function rateFractionDigits(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0 || rate >= 1) return 2;
  return Math.min(8, Math.ceil(-Math.log10(rate)) + 2);
}

/**
 * The token on one side of the swap. It shows which token that side is in, and tapping it
 * switches the pair around — with two tokens, "pay with the other one" is the only other choice.
 * Ink-filled on the side the visitor is paying from; outlined on the side the rock pays out.
 */
function TokenChip({
  symbol,
  side,
  onFlip,
}: {
  symbol: TokenSymbol;
  side: "in" | "out";
  onFlip: () => void;
}) {
  const other = otherToken(symbol);
  return (
    <Button
      type="button"
      variant={side === "in" ? "default" : "outline"}
      aria-label={
        side === "in"
          ? `Paying with ${symbol}. Pay with ${other} instead`
          : `Receiving ${symbol}. Receive ${other} instead`
      }
      onClick={onFlip}
      className="h-11 gap-2 rounded-full pl-3 pr-4 text-sm font-semibold"
    >
      <TokenIcon symbol={symbol} className="size-5" />
      <span aria-hidden>{symbol}</span>
    </Button>
  );
}

export function TradePanel({
  rockId,
  maker,
  streams = EMPTY_STREAMS,
  streamIndex: pinnedStreamIndex,
  authenticated,
  onRequestSignIn,
  onTradeSuccess,
  className,
}: TradePanelProps) {
  const { login } = useAuth();
  const { account, balances, swap, isPending } = useTakerActions();

  const [tokenIn, setTokenIn] = React.useState<TokenSymbol>("USDC");
  const [amountIn, setAmountIn] = React.useState("");
  const [chosenStream, setChosenStream] = React.useState<number | null>(null);
  const [addressShown, setAddressShown] = React.useState(false);
  /**
   * The last answer, tagged with the request it answers. Tagging is what keeps a stale quote
   * off the screen without a setState in the effect body: an answer for a different pair,
   * stream or amount is simply not the current answer.
   */
  const [answer, setAnswer] = React.useState<{ key: string; quote: QuoteState } | null>(null);
  const [result, setResult] = React.useState<SwapResult | null>(null);
  const [swapError, setSwapError] = React.useState<string | null>(null);

  const addressRegionId = React.useId();
  const amountInputId = React.useId();
  const amountHintId = React.useId();

  /* ---------------------------------------------------------------------- */
  /* Which stream. Pinned by the caller, chosen by the visitor, or cheapest.  */
  /* ---------------------------------------------------------------------- */

  const fallbackStreamIndex = React.useMemo(() => {
    if (pinnedStreamIndex !== undefined) return pinnedStreamIndex;
    const cheapest = defaultStream(streams);
    return cheapest ? Number(cheapest.streamIndex) : 0;
  }, [pinnedStreamIndex, streams]);

  // A choice survives only while that stream is still live; a docked stream falls back quietly.
  const streamIndex =
    pinnedStreamIndex === undefined &&
    chosenStream !== null &&
    streams.some((stream) => Number(stream.streamIndex) === chosenStream)
      ? chosenStream
      : fallbackStreamIndex;

  const tokenOut = otherToken(tokenIn);
  const decimalsIn = tokens[tokenIn].decimals;
  const decimalsOut = tokens[tokenOut].decimals;

  const trimmedAmount = amountIn.trim();
  const hasAmount = DECIMAL_INPUT.test(trimmedAmount) && Number(trimmedAmount) > 0;
  const quoteKey = `${maker ?? ""}:${streamIndex}:${tokenIn}:${trimmedAmount}`;

  const quote = React.useMemo<QuoteState>(() => {
    if (!maker) return { status: "unavailable", reason: NO_MAKER_REASON };
    if (!hasAmount) return { status: "idle" };
    if (answer?.key === quoteKey) return answer.quote;
    return { status: "loading" };
  }, [maker, hasAmount, answer, quoteKey]);

  React.useEffect(() => {
    if (!hasAmount || !maker) return;

    const controller = new AbortController();
    const key = `${maker}:${streamIndex}:${tokenIn}:${trimmedAmount}`;
    const timer = setTimeout(() => {
      const url =
        `/api/rocks/${encodeURIComponent(rockId)}/quote` +
        `?maker=${maker}&streamIndex=${streamIndex}` +
        `&tokenIn=${tokenIn}&amountIn=${encodeURIComponent(trimmedAmount)}`;

      fetch(url, { signal: controller.signal })
        .then(async (response) => {
          const body = (await response.json().catch(() => ({}))) as QuoteResponseBody;
          if (controller.signal.aborted) return;

          const value = body.value;
          if (
            response.ok &&
            body.state === "REAL" &&
            value &&
            isBaseUnits(value.amountOut) &&
            typeof value.amountOutFormatted === "string" &&
            typeof value.feeBps === "number" &&
            typeof value.priceImpactBps === "number"
          ) {
            setAnswer({
              key,
              quote: {
                status: "real",
                value: {
                  amountOut: value.amountOut,
                  amountOutFormatted: value.amountOutFormatted,
                  feeBps: value.feeBps,
                  priceImpactBps: value.priceImpactBps,
                  source: value.source ?? "the rock's own strategy",
                },
              },
            });
            return;
          }

          setAnswer({
            key,
            quote: {
              status: "unavailable",
              reason:
                body.reason ??
                "No price is available for this pair right now, so nothing can be quoted.",
            },
          });
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setAnswer({
            key,
            quote: {
              status: "unavailable",
              reason: "The price could not be loaded, so nothing can be quoted.",
            },
          });
        });
    }, QUOTE_DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [rockId, maker, streamIndex, tokenIn, trimmedAmount, hasAmount]);

  const handleFlip = React.useCallback(() => {
    setTokenIn((current) => otherToken(current));
    setSwapError(null);
  }, []);

  const handleSelectStream = React.useCallback((index: number) => {
    setChosenStream(index);
    setSwapError(null);
  }, []);

  /** The floor the swap will not go below: the quote, less the 0.5 % tolerance. */
  const minAmountOut =
    quote.status === "real"
      ? (BigInt(quote.value.amountOut) *
          BigInt(BPS_DENOMINATOR - SLIPPAGE_TOLERANCE_BPS)) /
        BigInt(BPS_DENOMINATOR)
      : null;

  /* ---------------------------------------------------------------------- */
  /* The account the swap comes from, and whether it can pay for one.        */
  /* ---------------------------------------------------------------------- */

  const heldIn =
    balances.state === "UNAVAILABLE"
      ? null
      : tokenIn === "USDC"
        ? balances.value.usdc
        : balances.value.weth;

  // Memoised deliberately: the React Compiler cannot see through `toBaseUnits`, and an
  // unmemoised call here makes it give up on the quote memo above (react-hooks lint rule).
  const amountInUnits = React.useMemo(
    () => toBaseUnits(trimmedAmount, decimalsIn),
    [trimmedAmount, decimalsIn],
  );
  const shortfall =
    heldIn !== null &&
    amountInUnits !== null &&
    amountInUnits > BigInt(0) &&
    amountInUnits > heldIn;

  /**
   * The stream must be able to settle what it quotes. `executable` is min(virtual, wallet,
   * allowance) on the output side, read with the strategy; a quote above it would revert on
   * chain (docs/dashboard-strategies.md), so it is said here instead of discovered in a receipt.
   */
  const selectedStream = streams.find((stream) => Number(stream.streamIndex) === streamIndex);
  const payableOut = selectedStream
    ? tokenOut === "USDC"
      ? selectedStream.executable.usdc
      : selectedStream.executable.weth
    : null;
  const exceedsStream =
    payableOut !== null && quote.status === "real" && BigInt(quote.value.amountOut) > payableOut;

  /**
   * Said before anything is signed. An account with no input token cannot swap: the UserOperation
   * fails in estimation, and the bundler's reason is not something a visitor can act on.
   */
  const fundingMessage =
    heldIn === null
      ? null
      : heldIn === BigInt(0)
        ? `This account holds no ${tokenIn}. Send some to its address first.`
        : shortfall
          ? `This account holds ${formatUnits(heldIn, decimalsIn)} ${tokenIn}. Send more to its address first.`
          : null;

  /** "Max": the whole balance the account really holds, as the exact decimal string. */
  const handleMax = React.useCallback(() => {
    if (heldIn === null || heldIn === BigInt(0)) return;
    setAmountIn(formatUnits(heldIn, decimalsIn));
    setSwapError(null);
  }, [heldIn, decimalsIn]);

  const handleSwap = React.useCallback(async () => {
    if (!maker || quote.status !== "real" || minAmountOut === null || shortfall || exceedsStream) {
      return;
    }
    setSwapError(null);

    try {
      const capability = await swap({
        rockId,
        maker,
        streamIndex,
        tokenIn,
        amountIn: parseUnits(trimmedAmount, decimalsIn),
        minAmountOut,
      });
      setResult(capability);

      // Only a real execution counts. What changed is read back from the chain by the page, not
      // inferred here from the amount the visitor was shown (D-014).
      if (capability.state === "REAL") onTradeSuccess?.();
    } catch (error) {
      setSwapError(
        error instanceof Error
          ? error.message
          : "The swap did not go through. Nothing moved.",
      );
    }
  }, [
    maker,
    quote,
    minAmountOut,
    shortfall,
    exceedsStream,
    swap,
    rockId,
    streamIndex,
    tokenIn,
    trimmedAmount,
    decimalsIn,
    onTradeSuccess,
  ]);

  const handleSignIn = React.useCallback(() => {
    if (onRequestSignIn) {
      onRequestSignIn();
      return;
    }
    void login();
  }, [onRequestSignIn, login]);

  /** After a receipt: back to a fresh form, in place. */
  const handleReset = React.useCallback(() => {
    setResult(null);
    setAmountIn("");
    setSwapError(null);
  }, []);

  const impact = quote.status === "real" ? impactTone(quote.value.priceImpactBps) : null;
  const canSwap =
    quote.status === "real" &&
    authenticated &&
    account.state !== "UNAVAILABLE" &&
    !shortfall &&
    !exceedsStream &&
    !isPending;

  // Rounded the way `<Amount>` rounds, so the label reads "0.0091 WETH", not eighteen digits.
  const quotedOut =
    quote.status === "real"
      ? formatAmount(BigInt(quote.value.amountOut), {
          decimals: decimalsOut,
          maxFractionDigits: defaultMaxFractionDigits(tokenOut),
        })
      : null;

  /**
   * The per-unit rate of *this* quote — amount out over amount in, nothing else. It is not a
   * market price and is not read from anywhere but the quote; it is hidden when there is none.
   */
  const rate =
    quote.status === "real" && hasAmount
      ? toDisplayNumber(BigInt(quote.value.amountOut), decimalsOut) / Number(trimmedAmount)
      : null;
  const rateShown = rate !== null && Number.isFinite(rate) && rate > 0;

  const primaryLabel = !authenticated
    ? "Sign in to trade"
    : isPending
      ? "Swapping…"
      : !hasAmount
        ? "Enter an amount"
        : quote.status === "loading"
          ? "Getting a quote…"
          : quotedOut !== null
            ? `Swap ${trimmedAmount} ${tokenIn} → ${quotedOut} ${tokenOut}`
            : `Swap ${tokenIn} → ${tokenOut}`;

  const primaryBusy = authenticated && (isPending || quote.status === "loading");

  /* ---------------------------------------------------------------------- */
  /* Receipt: in place of the card body, with the way back.                  */
  /* ---------------------------------------------------------------------- */

  if (result) {
    return (
      <div className={cn("flex flex-col gap-4", className)}>
        <section className="rounded-3xl border border-border bg-background">
          <div className="p-5">
            <CapabilityResult
              result={result}
              title="Swap done"
              description="The rock's reserve and its earnings have moved with it."
              rows={
                result.state !== "UNAVAILABLE" ? (
                  <>
                    <dt className="text-ink-3">You received</dt>
                    <dd className="justify-self-end">
                      <span className="inline-flex items-center gap-1.5">
                        <TokenIcon symbol={tokenOut} className="size-4 text-ink-3" />
                        <Amount
                          value={result.value.amountOut}
                          decimals={decimalsOut}
                          symbol={tokenOut}
                          size="sm"
                        />
                      </span>
                    </dd>
                  </>
                ) : null
              }
            />
          </div>
          <div className="border-t border-border p-4">
            <Button type="button" size="lg" className="w-full" onClick={handleReset}>
              Trade again
            </Button>
          </div>
        </section>
      </div>
    );
  }

  /* ---------------------------------------------------------------------- */
  /* The card.                                                               */
  /* ---------------------------------------------------------------------- */

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {pinnedStreamIndex === undefined ? (
        <TradeStreamPicker streams={streams} value={streamIndex} onChange={handleSelectStream} />
      ) : null}

      <section className="rounded-3xl border border-border bg-background">
        {/* Top half — what goes into the rock */}
        <div className="flex flex-col gap-3 p-5 pb-7">
          <label htmlFor={amountInputId} className="text-label uppercase text-ink-3">
            Top up the rock
          </label>
          <div className="flex items-center gap-3">
            <input
              id={amountInputId}
              type="text"
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              placeholder="0"
              value={amountIn}
              onChange={(event) => {
                setAmountIn(event.target.value);
                setSwapError(null);
              }}
              aria-describedby={amountHintId}
              className="-mx-1 min-w-0 flex-1 rounded-lg bg-transparent px-1 text-num-lg font-bold tabular-nums text-ink outline-none placeholder:text-ink-4"
            />
            <TokenChip symbol={tokenIn} side="in" onFlip={handleFlip} />
          </div>
          <div className="flex min-h-10 items-center justify-between gap-3">
            {heldIn !== null ? (
              <>
                <p id={amountHintId} className="text-sm text-ink-3">
                  Your account holds{" "}
                  <Amount
                    value={heldIn}
                    decimals={decimalsIn}
                    symbol={tokenIn}
                    size="sm"
                    className="text-ink-2"
                  />
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={heldIn === BigInt(0)}
                  onClick={handleMax}
                  className="-mr-3 text-ink-2"
                >
                  Max
                </Button>
              </>
            ) : (
              <p id={amountHintId} className="text-sm text-ink-3">
                Type the amount of {tokenIn} to swap.
              </p>
            )}
          </div>
        </div>

        {/* The divider, with the flip button riding it */}
        <div className="relative border-t border-border">
          <IconButton
            aria-label={`Swap direction: pay ${tokenOut} instead`}
            variant="outline"
            onClick={handleFlip}
            className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background shadow-xs"
          >
            <ArrowUpDown />
          </IconButton>
        </div>

        {/* Bottom half — what the rock sends back */}
        <div className="flex flex-col gap-3 p-5 pt-7">
          <span className="text-label uppercase text-ink-3">Send from the rock</span>
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              {quote.status === "real" ? (
                <>
                  <Amount
                    value={BigInt(quote.value.amountOut)}
                    decimals={decimalsOut}
                    size="lg"
                    className="truncate"
                  />
                  <span className="sr-only">{tokenOut}</span>
                </>
              ) : (
                <span
                  role={quote.status === "loading" ? "status" : undefined}
                  className={cn(
                    "text-num-lg font-bold tabular-nums text-ink-4",
                    quote.status === "loading" && "motion-safe:animate-pulse",
                  )}
                >
                  <span aria-hidden>—</span>
                  {quote.status === "loading" ? (
                    <span className="sr-only">Getting a quote…</span>
                  ) : null}
                </span>
              )}
            </div>
            <TokenChip symbol={tokenOut} side="out" onFlip={handleFlip} />
          </div>
          {rateShown && rate !== null ? (
            <p className="text-sm text-ink-3">
              <Amount value={1} symbol={tokenIn} size="sm" className="text-ink-2" />
              <span aria-hidden> → </span>
              <span className="sr-only"> gets </span>
              <Amount
                value={rate}
                symbol={tokenOut}
                maxFractionDigits={rateFractionDigits(rate)}
                size="sm"
                className="text-ink-2"
              />{" "}
              for this trade
            </p>
          ) : quote.status === "unavailable" ? (
            <p className="max-w-prose text-sm text-ink-2">{quote.reason}</p>
          ) : null}
        </div>

        {/* The deal, always in view; the rest of the quote behind "Details" */}
        <div className="flex flex-col border-t border-border px-5 py-3">
          <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
            <span className="text-ink-3">
              <HelpTerm term="How good a deal is this?">
                Big orders move the price against you: you end up with less than the headline rate
                suggests. The bar shows how far this order moves it — short and green is a good
                deal. It is measured from the quote that will execute, never guessed.
              </HelpTerm>
            </span>
            {quote.status === "real" && impact ? (
              <span className="flex items-center gap-2">
                <span aria-hidden className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
                  <span
                    className={cn("block h-full rounded-full motion-safe:transition-all", impact.bar)}
                    style={{
                      width: `${Math.min(
                        100,
                        Math.max(4, (quote.value.priceImpactBps / 250) * 100),
                      )}%`,
                    }}
                  />
                </span>
                <span
                  className={cn(
                    "rounded-full bg-muted px-2.5 py-0.5 text-caption font-semibold",
                    impact.text,
                  )}
                >
                  {impact.word}
                </span>
                <span className="font-medium tabular-nums text-ink">
                  {formatBps(quote.value.priceImpactBps)}
                </span>
              </span>
            ) : (
              <span className="text-ink-4">—</span>
            )}
          </div>

          <Collapsible.Root>
            <Collapsible.Trigger className="group/details flex h-11 w-full items-center justify-between rounded-lg text-sm text-ink-3 outline-none hover:text-ink">
              <span>Details</span>
              <ChevronDown
                aria-hidden
                className="size-4 motion-safe:transition-transform group-aria-expanded/details:rotate-180"
              />
            </Collapsible.Trigger>
            <Collapsible.Panel className="h-(--collapsible-panel-height) overflow-hidden motion-safe:transition-[height] motion-safe:duration-200 data-ending-style:h-0 data-starting-style:h-0">
              <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-3 pb-3 pt-1 text-sm">
                <dt className="text-ink-3">What the rock earns</dt>
                <dd className="justify-self-end text-right font-medium tabular-nums text-ink">
                  {quote.status === "real"
                    ? `${formatBps(quote.value.feeBps)} of what you put in`
                    : "—"}
                </dd>

                <dt className="text-ink-3">
                  <HelpTerm term="The least you will accept">
                    If the price moves between now and the moment the swap settles, the trade is
                    cancelled rather than filled at a worse rate. The allowance is 0.5%.
                  </HelpTerm>
                </dt>
                <dd className="justify-self-end text-right">
                  {minAmountOut !== null ? (
                    <Amount value={minAmountOut} decimals={decimalsOut} symbol={tokenOut} size="sm" />
                  ) : (
                    <span className="font-medium text-ink">—</span>
                  )}
                </dd>

                <dt className="text-ink-3">Where this price comes from</dt>
                <dd className="justify-self-end text-right font-medium text-ink">
                  {quote.status === "real" ? quote.value.source : "The rock's own strategy"}
                </dd>
              </dl>
            </Collapsible.Panel>
          </Collapsible.Root>
        </div>

        {/* Footer band: what stands in the way, then the one button */}
        <div className="flex flex-col gap-3 border-t border-border p-4">
          {swapError ? (
            <p role="alert" className="text-sm text-danger">
              {swapError}
            </p>
          ) : null}
          {exceedsStream && payableOut !== null ? (
            <p className="max-w-prose text-sm text-warning">
              This strategy can pay out at most{" "}
              <Amount value={payableOut} decimals={decimalsOut} symbol={tokenOut} size="sm" /> right
              now. Try a smaller amount{streams.length > 1 ? " or another strategy" : ""}.
            </p>
          ) : null}
          <Button
            type="button"
            size="lg"
            className="h-auto min-h-14 w-full whitespace-normal py-3 text-center"
            disabled={authenticated && !canSwap}
            aria-busy={primaryBusy || undefined}
            onClick={authenticated ? handleSwap : handleSignIn}
          >
            <span className="motion-safe:transition-opacity">{primaryLabel}</span>
            {primaryBusy ? <Loader2 aria-hidden className="motion-safe:animate-spin" /> : null}
          </Button>
          <p className="max-w-prose text-caption text-ink-3">
            A swap is never risk-free: the price can move between the quote you see and the trade
            that settles.
          </p>
        </div>
      </section>

      {/* The account the swap comes from (D-029: one personal Safe per visitor) */}
      <section className="flex flex-col gap-2 px-1">
        {!authenticated ? (
          <div className="flex flex-col gap-1">
            <span className="text-label uppercase text-ink-3">Paying from your account</span>
            <p className="max-w-prose text-sm text-ink-3">
              Your own account — one per person, not tied to any rock. Sign in to see it.
            </p>
          </div>
        ) : account.state === "UNAVAILABLE" ? (
          <div className="flex flex-col gap-1">
            <span className="text-label uppercase text-ink-3">Paying from your account</span>
            <p className="max-w-prose text-sm text-ink-2">{account.reason}</p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="flex flex-col gap-1">
                <span className="text-label uppercase text-ink-3">Paying from your account</span>
                {balances.state === "UNAVAILABLE" ? (
                  <p className="max-w-prose text-sm text-ink-2">{balances.reason}</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="inline-flex items-center gap-1.5">
                      <TokenIcon symbol="USDC" className="size-4 text-ink-3" />
                      <Amount
                        value={balances.value.usdc}
                        decimals={tokens.USDC.decimals}
                        symbol="USDC"
                        size="sm"
                      />
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <TokenIcon symbol="WETH" className="size-4 text-ink-3" />
                      <Amount
                        value={balances.value.weth}
                        decimals={tokens.WETH.decimals}
                        symbol="WETH"
                        size="sm"
                      />
                    </span>
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-expanded={addressShown}
                aria-controls={addressRegionId}
                onClick={() => setAddressShown((shown) => !shown)}
                className="-mx-3 text-ink-2"
              >
                {addressShown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                {addressShown ? "Hide address" : "Show address"}
              </Button>
            </div>
            {fundingMessage ? (
              <p className="max-w-prose text-sm text-warning">{fundingMessage}</p>
            ) : null}
            {addressShown ? (
              <div id={addressRegionId} className="flex flex-col gap-1">
                <AddressLine
                  value={account.value}
                  explorerHref={explorer.address(account.value)}
                />
                <p className="text-caption text-ink-3">
                  Send USDC or WETH on Sepolia here to trade with it. Gas is paid for you, but the
                  tokens you swap have to be in it.
                </p>
              </div>
            ) : (
              <p className="max-w-prose text-caption text-ink-3">
                Gas is paid for you, but the tokens you swap have to be in this account.
              </p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
