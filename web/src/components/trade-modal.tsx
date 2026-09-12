"use client";

/**
 * Trade sheet (Flow D; spec 17 §4.4, §4.5, Part 5 "Trade sheet"; spec 15 Phase 3).
 *
 * What this file used to be: a hand-rolled centred modal with its own Escape handler and
 * backdrop, hardcoded trader balances (`USDC: 500, WETH: 0.25` — N-4), an invented price-impact
 * formula (N-6), a hardcoded mainnet pair of token addresses, a receipt naming the wrong network,
 * a synthesized hash in the success state (D-014) and a swipe-to-swap gesture whose knob
 * disappeared under the clip before its 200 px threshold on a 360 px phone (L-6).
 *
 * What it is now: a `Sheet`. The quote is the only number on screen, and it comes from
 * `GET /api/rocks/[id]/quote`, debounced, rendered as UNAVAILABLE with the route's own reason
 * whenever it cannot answer. No balance is shown, because none is read. The confirmation is a
 * single 56 px button (L-6, §4.5) in the sticky footer.
 *
 * There is no swap path yet: the visitor swap executes from the Rock Account against Aqua and
 * that is Phase 3 of spec 15. Nothing here fakes one — the footer says so and the form stays
 * usable so the quote can still be read.
 */

import * as React from "react";
import { ArrowUpDown, Loader2 } from "lucide-react";
import { Sheet, SheetBody } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Amount } from "@/components/ui/amount";
import { UnavailableState } from "@/components/ui/unavailable-state";
import { HelpTerm } from "@/components/ui/popover";
import { cn } from "@/lib/ui/cn";
import { formatAmount, defaultMaxFractionDigits } from "@/lib/ui/format";
import type { TokenSymbol } from "@/lib/chain";

/** Swapping is Phase 3 of spec 15. Until then this is the whole truth about execution. */
const SWAP_UNAVAILABLE_REASON =
  "Swapping is not available until the Aqua strategy is live";

const QUOTE_DEBOUNCE_MS = 350;

/** Accepts "12", "12.", ".5", "0.0091" — anything a decimal keypad can produce. */
const DECIMAL_INPUT = /^(\d+(\.\d*)?|\.\d+)$/;

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
  /**
   * The rock's USDC reserve, when the page has read one. Accepted for compatibility; nothing is
   * derived from it here, because a locally computed fill or price impact would be a fabricated
   * number (N-6).
   */
  currentReserve?: number;
  /**
   * Fired after a real swap. Never called today: there is no swap path (spec 15 Phase 3), and
   * this sheet does not invent one.
   */
  onTradeSuccess?: (
    deltaLiquidity: number,
    earnedFee: number,
    details?: TradeDetails,
  ) => void;
}

/** The shape `GET /api/rocks/[id]/quote` answers with. Extra fields are optional by design. */
interface QuoteResponseBody {
  state?: "REAL" | "UNAVAILABLE";
  reason?: string;
  amountOut?: string | null;
  source?: string;
  /** Percent, when the quote source can report it. Never computed on the client (N-6). */
  priceImpact?: number;
  /** Maker fee taken by the strategy, in `tokenOut` units, when the source reports it. */
  fee?: string;
}

type QuoteState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "real";
      amountOut: string;
      source?: string;
      priceImpact?: number;
      fee?: string;
    }
  | { status: "unavailable"; reason: string };

function otherToken(symbol: TokenSymbol): TokenSymbol {
  return symbol === "USDC" ? "WETH" : "USDC";
}

/** Deal quality, in the user's words (STEERING.md). Colours are tokens only (§3.5). */
function impactTone(priceImpact: number): string {
  if (priceImpact < 0.5) return "text-positive";
  if (priceImpact < 2) return "text-warning";
  return "text-danger";
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

export function TradeModal({ isOpen, onClose, rockId }: TradeModalProps) {
  const [tokenIn, setTokenIn] = React.useState<TokenSymbol>("USDC");
  const [amountIn, setAmountIn] = React.useState("");
  /**
   * The last answer, tagged with the request it answers. Tagging is what keeps a stale quote
   * off the screen without a setState in the effect body: an answer for a different pair or
   * amount is simply not the current answer.
   */
  const [answer, setAnswer] = React.useState<{ key: string; quote: QuoteState } | null>(null);

  const tokenOut = otherToken(tokenIn);
  const trimmedAmount = amountIn.trim();
  const hasAmount = DECIMAL_INPUT.test(trimmedAmount) && Number(trimmedAmount) > 0;
  const quoteKey = `${tokenIn}:${trimmedAmount}`;

  const quote: QuoteState = !hasAmount
    ? { status: "idle" }
    : answer?.key === quoteKey
      ? answer.quote
      : { status: "loading" };

  React.useEffect(() => {
    if (!isOpen || !hasAmount) return;

    const controller = new AbortController();
    const key = `${tokenIn}:${trimmedAmount}`;
    const timer = setTimeout(() => {
      const url =
        `/api/rocks/${encodeURIComponent(rockId)}/quote` +
        `?tokenIn=${tokenIn}&amountIn=${encodeURIComponent(trimmedAmount)}`;

      fetch(url, { signal: controller.signal })
        .then(async (response) => {
          const body = (await response.json().catch(() => ({}))) as QuoteResponseBody;
          if (controller.signal.aborted) return;

          if (response.ok && body.state === "REAL" && typeof body.amountOut === "string") {
            setAnswer({
              key,
              quote: {
                status: "real",
                amountOut: body.amountOut,
                source: body.source,
                priceImpact:
                  typeof body.priceImpact === "number" ? body.priceImpact : undefined,
                fee: typeof body.fee === "string" ? body.fee : undefined,
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
  }, [isOpen, rockId, tokenIn, trimmedAmount, hasAmount]);

  const handleFlip = React.useCallback(() => {
    setTokenIn((current) => otherToken(current));
  }, []);

  const handleSelectTokenIn = React.useCallback((symbol: TokenSymbol) => {
    setTokenIn(symbol);
  }, []);

  const formattedOut =
    quote.status === "real"
      ? formatAmount(Number(quote.amountOut), {
          maxFractionDigits: defaultMaxFractionDigits(tokenOut),
        })
      : null;

  const swapLabel = !hasAmount
    ? "Enter an amount"
    : formattedOut
      ? `Swap ${trimmedAmount} ${tokenIn} → ${formattedOut} ${tokenOut}`
      : `Swap ${trimmedAmount} ${tokenIn} → ${tokenOut}`;

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Trade with this rock"
      description={`You trade against rock #${rockId}'s own reserve.`}
      footer={
        <div className="flex flex-col gap-3">
          <UnavailableState reason={SWAP_UNAVAILABLE_REASON} className="px-3 py-4" />
          <Button
            type="button"
            size="lg"
            disabled
            className="w-full whitespace-normal text-center"
          >
            <span className="motion-safe:transition-opacity">{swapLabel}</span>
            {quote.status === "loading" ? (
              <Loader2 aria-hidden className="motion-safe:animate-spin" />
            ) : null}
          </Button>
        </div>
      }
    >
      <SheetBody className="flex flex-col gap-4">
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
            onChange={(event) => setAmountIn(event.target.value)}
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
              <Amount value={Number(quote.amountOut)} symbol={tokenOut} size="lg" />
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
                Big orders move the price against you: you end up with less than the headline rate
                suggests. A small number here means the rock can fill your order close to the rate
                shown. It is measured from the quote, never guessed.
              </HelpTerm>
            </dt>
            <dd
              className={cn(
                "text-right font-medium tabular-nums",
                quote.status === "real" && quote.priceImpact !== undefined
                  ? impactTone(quote.priceImpact)
                  : "text-ink-3",
              )}
            >
              {quote.status === "real" && quote.priceImpact !== undefined
                ? `${quote.priceImpact.toFixed(2)}% worse than the rate`
                : "Known once the strategy is live"}
            </dd>

            <dt className="text-ink-3">What the rock earns</dt>
            <dd className="text-right font-medium tabular-nums text-ink">
              {quote.status === "real" && quote.fee !== undefined
                ? `${quote.fee} ${tokenOut}`
                : "Known once the strategy is live"}
            </dd>

            <dt className="text-ink-3">Where this price comes from</dt>
            <dd className="text-right font-medium text-ink">
              {quote.status === "real" && quote.source
                ? quote.source
                : "The rock's own strategy"}
            </dd>
          </dl>
          <p className="mt-3 max-w-prose text-sm text-ink-2">
            A swap is never risk-free: the price can move between the quote you see and the trade
            that settles.
          </p>
        </section>
      </SheetBody>
    </Sheet>
  );
}
