"use client";

/**
 * Trade sheet (Flow D; spec 17 §4.4, §4.5, Part 5 "Trade sheet"; spec 15 Phase 3, SC-4).
 *
 * What this file used to be: a hand-rolled centred modal with its own Escape handler and
 * backdrop, hardcoded trader balances (`USDC: 500, WETH: 0.25` — N-4), an invented price-impact
 * formula (N-6), a hardcoded mainnet pair of token addresses, a receipt naming the wrong network,
 * a synthesized hash in the success state (D-014) and a swipe-to-swap gesture whose knob
 * disappeared under the clip before its 200 px threshold on a 360 px phone (L-6).
 *
 * What it is now: a `Sheet`. Every number on screen comes from
 * `GET /api/rocks/[id]/quote` — the amount out, the fee in basis points and the price impact in
 * basis points, all from the same source that will execute the swap. Nothing is computed here
 * except the slippage floor, which is arithmetic on the quote. The confirmation is a single
 * 56 px button in the sticky footer (L-6, §4.5) that calls `useTakerActions().swap`, and the
 * receipt is whatever that returns — a real hash, or an honest reason.
 */

import * as React from "react";
import { formatUnits, parseUnits, type Address } from "viem";
import { ArrowUpDown, Loader2 } from "lucide-react";
import { Sheet, SheetBody } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Amount } from "@/components/ui/amount";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { HelpTerm } from "@/components/ui/popover";
import { CapabilityResult } from "@/components/sheets/capability-result";
import { cn } from "@/lib/ui/cn";
import { tokens, type TokenSymbol } from "@/lib/chain";
import type { Capability } from "@/lib/demo";
import { useAuth } from "@/context/auth-context";
import { useTakerActions } from "@/hooks/useTakerActions";

const QUOTE_DEBOUNCE_MS = 350;

/** The deal the user is promised cannot get worse than this before it reverts. */
const SLIPPAGE_TOLERANCE_BPS = 50; // 0.50 %
const BPS_DENOMINATOR = 10_000;

/** Accepts "12", "12.", ".5", "0.0091" — anything a decimal keypad can produce. */
const DECIMAL_INPUT = /^(\d+(\.\d*)?|\.\d+)$/;

const NO_MAKER_REASON =
  "This rock has no account yet, so there is nothing to trade against.";

/** Kept for callers that render a receipt. A hash may only come from a real receipt (D-014). */
export interface TradeDetails {
  inAmount: string;
  inSymbol: string;
  outAmount: string;
  outSymbol: string;
  txHash: `0x${string}`;
}

export interface TradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  rockId: string;
  /** The rock's account — the maker the quote and the swap are aimed at. */
  maker?: Address;
  /** Which of the maker's streams to trade against. @default 0 */
  streamIndex?: number;
  /**
   * The rock's USDC reserve, when the page has read one. Accepted for compatibility; nothing is
   * derived from it here, because a locally computed fill or price impact would be a fabricated
   * number (N-6).
   */
  currentReserve?: number;
  /** Called once a swap has really executed, with the values from that execution. */
  onTradeSuccess?: (
    deltaLiquidity: number,
    earnedFee: number,
    details?: TradeDetails,
  ) => void;
  /** Opens the onboarding sheet. Falls back to `login()` when the page does not supply one. */
  onRequestSignIn?: () => void;
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

/** Deal quality, in the user's words (STEERING.md). Colours are tokens only (§3.5). */
function impactTone(bps: number): { text: string; bar: string } {
  if (bps < 50) return { text: "text-positive", bar: "bg-positive" };
  if (bps < 200) return { text: "text-warning", bar: "bg-warning" };
  return { text: "text-danger", bar: "bg-danger" };
}

function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

function TokenChip({
  symbol,
  selected,
  onSelect,
}: {
  symbol: TokenSymbol;
  selected: boolean;
  onSelect: (symbol: TokenSymbol) => void;
}) {
  return (
    <Button
      type="button"
      variant={selected ? "default" : "outline"}
      aria-pressed={selected}
      onClick={() => onSelect(symbol)}
      className="h-11 rounded-full px-4 text-sm font-semibold"
    >
      {symbol}
    </Button>
  );
}

export function TradeModal({
  isOpen,
  onClose,
  rockId,
  maker,
  streamIndex = 0,
  onTradeSuccess,
  onRequestSignIn,
}: TradeModalProps) {
  const { authenticated, login } = useAuth();
  const { account, swap, isPending } = useTakerActions();

  const [tokenIn, setTokenIn] = React.useState<TokenSymbol>("USDC");
  const [amountIn, setAmountIn] = React.useState("");
  /**
   * The last answer, tagged with the request it answers. Tagging is what keeps a stale quote
   * off the screen without a setState in the effect body: an answer for a different pair or
   * amount is simply not the current answer.
   */
  const [answer, setAnswer] = React.useState<{ key: string; quote: QuoteState } | null>(null);
  const [result, setResult] = React.useState<SwapResult | null>(null);
  const [swapError, setSwapError] = React.useState<string | null>(null);

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
    if (!isOpen || !hasAmount || !maker) return;

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
  }, [isOpen, rockId, maker, streamIndex, tokenIn, trimmedAmount, hasAmount]);

  const handleFlip = React.useCallback(() => {
    setTokenIn((current) => otherToken(current));
    setSwapError(null);
  }, []);

  const handleSelectTokenIn = React.useCallback((symbol: TokenSymbol) => {
    setTokenIn(symbol);
    setSwapError(null);
  }, []);

  /** The floor the swap will not go below: the quote, less the 0.5 % tolerance. */
  const minAmountOut =
    quote.status === "real"
      ? (BigInt(quote.value.amountOut) *
          BigInt(BPS_DENOMINATOR - SLIPPAGE_TOLERANCE_BPS)) /
        BigInt(BPS_DENOMINATOR)
      : null;

  const handleSwap = React.useCallback(async () => {
    if (!maker || quote.status !== "real" || minAmountOut === null) return;
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

      if (capability.state === "REAL") {
        const receivedFormatted = formatUnits(capability.value.amountOut, decimalsOut);
        const paid = Number(trimmedAmount);
        const received = Number(receivedFormatted);
        // The rock's USDC reserve grows by what the taker paid in, or shrinks by what it paid
        // out. Both figures are the executed ones: the amount signed for, and the amount the
        // receipt reports.
        const deltaLiquidity = tokenIn === "USDC" ? paid : -received;
        const earnedFee = (paid * quote.value.feeBps) / BPS_DENOMINATOR;
        onTradeSuccess?.(deltaLiquidity, earnedFee, {
          inAmount: trimmedAmount,
          inSymbol: tokenIn,
          outAmount: receivedFormatted,
          outSymbol: tokenOut,
          txHash: capability.value.txHash,
        });
      }
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
    swap,
    rockId,
    streamIndex,
    tokenIn,
    tokenOut,
    trimmedAmount,
    decimalsIn,
    decimalsOut,
    onTradeSuccess,
  ]);

  const handleSignIn = React.useCallback(() => {
    if (onRequestSignIn) {
      onRequestSignIn();
      return;
    }
    void login();
  }, [onRequestSignIn, login]);

  const impact = quote.status === "real" ? impactTone(quote.value.priceImpactBps) : null;
  const canSwap =
    quote.status === "real" &&
    authenticated &&
    account.state !== "UNAVAILABLE" &&
    !isPending;

  const swapLabel = !hasAmount
    ? "Enter an amount"
    : quote.status === "real"
      ? `Swap ${trimmedAmount} ${tokenIn} → ${quote.value.amountOutFormatted} ${tokenOut}`
      : `Swap ${trimmedAmount} ${tokenIn} → ${tokenOut}`;

  let footer: React.ReactNode;
  if (result) {
    footer = (
      <Button type="button" size="lg" className="w-full" onClick={onClose}>
        Done
      </Button>
    );
  } else if (!authenticated) {
    footer = (
      <Button type="button" size="lg" className="w-full" onClick={handleSignIn}>
        Sign in to swap
      </Button>
    );
  } else {
    footer = (
      <div className="flex flex-col gap-2">
        {swapError ? (
          <p role="alert" className="text-sm text-danger">
            {swapError}
          </p>
        ) : null}
        {authenticated && account.state === "UNAVAILABLE" ? (
          <p className="text-sm text-ink-2">{account.reason}</p>
        ) : null}
        {quote.status === "unavailable" ? (
          <p className="text-sm text-ink-2">{quote.reason}</p>
        ) : null}
        <Button
          type="button"
          size="lg"
          className="w-full whitespace-normal text-center"
          disabled={!canSwap}
          onClick={handleSwap}
        >
          <span className="motion-safe:transition-opacity">
            {isPending ? "Swapping…" : swapLabel}
          </span>
          {isPending || quote.status === "loading" ? (
            <Loader2 aria-hidden className="motion-safe:animate-spin" />
          ) : null}
        </Button>
      </div>
    );
  }

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Trade with this rock"
      description={`You trade against rock #${rockId}'s own reserve.`}
      footer={footer}
    >
      <SheetBody className="flex flex-col gap-4">
        {result ? (
          <CapabilityResult
            result={result}
            title="Swap done"
            description="The rock's reserve and its earnings have moved with it."
            rows={
              result.state !== "UNAVAILABLE" ? (
                <>
                  <dt className="text-ink-3">You received</dt>
                  <dd className="justify-self-end">
                    <Amount
                      value={result.value.amountOut}
                      decimals={decimalsOut}
                      symbol={tokenOut}
                      size="sm"
                    />
                  </dd>
                </>
              ) : null
            }
          />
        ) : (
          <>
            {/* You pay */}
            <section className="rounded-2xl border border-border p-4">
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="trade-amount" className="text-label text-ink-3">
                  YOU PAY
                </label>
                <div className="flex gap-2">
                  <TokenChip
                    symbol="USDC"
                    selected={tokenIn === "USDC"}
                    onSelect={handleSelectTokenIn}
                  />
                  <TokenChip
                    symbol="WETH"
                    selected={tokenIn === "WETH"}
                    onSelect={handleSelectTokenIn}
                  />
                </div>
              </div>
              <input
                id="trade-amount"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                placeholder="0.0"
                value={amountIn}
                onChange={(event) => {
                  setAmountIn(event.target.value);
                  setSwapError(null);
                }}
                aria-describedby="trade-amount-hint"
                className="mt-2 w-full bg-transparent text-num-lg font-bold tabular-nums text-ink outline-none placeholder:text-ink-4"
              />
              <p id="trade-amount-hint" className="mt-1 text-sm text-ink-3">
                Type the amount of {tokenIn} you want to swap.
              </p>
            </section>

            <div className="flex justify-center">
              <IconButton
                aria-label={`Swap direction: pay ${tokenOut} instead`}
                variant="outline"
                onClick={handleFlip}
                className="rounded-full"
              >
                <ArrowUpDown />
              </IconButton>
            </div>

            {/* You receive */}
            <section className="rounded-2xl border border-border p-4">
              <span className="text-label text-ink-3">YOU RECEIVE</span>
              <div className="mt-2 min-h-12">
                {quote.status === "real" ? (
                  <Amount
                    value={BigInt(quote.value.amountOut)}
                    decimals={decimalsOut}
                    symbol={tokenOut}
                    size="lg"
                  />
                ) : quote.status === "loading" ? (
                  <span className="flex items-center gap-2 text-base text-ink-3">
                    <Loader2 aria-hidden className="size-5 motion-safe:animate-spin" />
                    Getting the price…
                  </span>
                ) : (
                  <span className="text-num-lg font-bold tabular-nums text-ink-4">—</span>
                )}
              </div>
            </section>

            {quote.status === "unavailable" ? (
              <UnavailableState reason={quote.reason} className="px-4 py-6" />
            ) : null}

            {/* Fee card — a two-column definition list at text-sm (Part 5) */}
            <section className="rounded-2xl border border-border p-4">
              <h3 className="text-h3 font-semibold text-ink">The details</h3>
              <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-3 text-sm">
                <dt className="text-ink-3">
                  <HelpTerm term="How good a deal is this?">
                    Big orders move the price against you: you end up with less than the headline
                    rate suggests. The bar shows how far this order moves it — short and green is
                    a good deal. It is measured from the quote that will execute, never guessed.
                  </HelpTerm>
                </dt>
                <dd className="justify-self-end">
                  {quote.status === "real" && impact ? (
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="h-1.5 w-16 overflow-hidden rounded-full bg-muted"
                      >
                        <span
                          className={cn(
                            "block h-full rounded-full motion-safe:transition-all",
                            impact.bar,
                          )}
                          style={{
                            width: `${Math.min(
                              100,
                              Math.max(4, (quote.value.priceImpactBps / 250) * 100),
                            )}%`,
                          }}
                        />
                      </span>
                      <span className={cn("font-medium tabular-nums", impact.text)}>
                        {formatBps(quote.value.priceImpactBps)}
                      </span>
                    </span>
                  ) : (
                    <span className="text-ink-3">Enter an amount to see</span>
                  )}
                </dd>

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
                <dd className="justify-self-end text-right font-medium tabular-nums text-ink">
                  {minAmountOut !== null
                    ? `${formatUnits(minAmountOut, decimalsOut)} ${tokenOut}`
                    : "—"}
                </dd>

                <dt className="text-ink-3">Where this price comes from</dt>
                <dd className="justify-self-end text-right font-medium text-ink">
                  {quote.status === "real" ? quote.value.source : "The rock's own strategy"}
                </dd>
              </dl>
              <p className="mt-3 max-w-prose text-sm text-ink-2">
                A swap is never risk-free: the price can move between the quote you see and the
                trade that settles.
              </p>
            </section>
          </>
        )}
      </SheetBody>
    </Sheet>
  );
}
