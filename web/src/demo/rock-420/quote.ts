/**
 * A quote for rock #420's Trade tab, in the shape `GET /api/rocks/[id]/quote` answers with.
 *
 * The trade panel fetches its quote from the server, and the server cannot see the browser's demo
 * state, so the route prices against the **seed** streams. That is close enough for a preview: the
 * swap itself is settled in the browser (`actions.ts`, `swapDemo`) against the live demo state,
 * with the same `quoteExactIn`, and it honours the floor the preview set.
 *
 * `source` is `"demo"`, and the panel prints it under "Where this price comes from". The envelope
 * is `state: "DEMO"`, which the panel accepts and badges SIMULATED; the row
 * S-5 in DEMO-STATE.md records this as the single place the demo's honesty rests on a label rather
 * than a badge, and the panel's one-line fix.
 */

import { formatUnits, parseUnits } from "viem";
import { quoteExactIn } from "@/lib/aqua/quote";
import { tokens } from "@/lib/chain";
import type { DemoToken } from "./actions";
import { seedDemoRock, ZERO, type DemoRockState } from "./state";

export interface DemoQuoteValue {
  /** Base units of the output token. */
  amountOut: string;
  amountOutFormatted: string;
  feeBps: number;
  priceImpactBps: number;
  source: "demo";
}

export type DemoQuote =
  | { state: "DEMO"; value: DemoQuoteValue }
  | { state: "UNAVAILABLE"; reason: string; value: null };

export interface DemoQuoteParams {
  streamIndex: number;
  tokenIn: DemoToken;
  /** Decimal token units, as typed — "1.5". */
  amountIn: string;
}

let seedForQuotes: DemoRockState | null = null;

/** The seed, built once per isolate. The route prices against it because it cannot see the browser. */
function quoteSeed(): DemoRockState {
  if (!seedForQuotes) seedForQuotes = seedDemoRock();
  return seedForQuotes;
}

export function demoQuote(params: DemoQuoteParams, state: DemoRockState = quoteSeed()): DemoQuote {
  const stream = state.streams.find((candidate) => candidate.streamIndex === params.streamIndex);
  if (!stream) {
    return {
      state: "UNAVAILABLE",
      reason: `Rock 420 has no live Aqua strategy at stream ${params.streamIndex}`,
      value: null,
    };
  }

  const tokenIn = tokens[params.tokenIn];
  const tokenOutSymbol: DemoToken = params.tokenIn === "USDC" ? "WETH" : "USDC";
  const tokenOut = tokens[tokenOutSymbol];

  let amountIn: bigint;
  try {
    amountIn = parseUnits(params.amountIn, tokenIn.decimals);
  } catch {
    return { state: "UNAVAILABLE", reason: "amountIn must be a decimal amount in token units", value: null };
  }
  if (amountIn <= ZERO) {
    return { state: "UNAVAILABLE", reason: "amountIn must be positive", value: null };
  }

  const balanceIn = params.tokenIn === "USDC" ? stream.virtual.usdc : stream.virtual.weth;
  const balanceOut = params.tokenIn === "USDC" ? stream.virtual.weth : stream.virtual.usdc;
  if (balanceIn <= ZERO || balanceOut <= ZERO) {
    return {
      state: "UNAVAILABLE",
      reason: "This strategy has no balance on one side, so it cannot quote a trade",
      value: null,
    };
  }

  const preview = quoteExactIn({ balanceIn, balanceOut, feeBps: stream.feeBps }, amountIn);
  if (preview.amountOut <= ZERO) {
    return {
      state: "UNAVAILABLE",
      reason: "This amount is too small to receive anything back at this strategy's size",
      value: null,
    };
  }

  return {
    state: "DEMO",
    value: {
      amountOut: preview.amountOut.toString(),
      amountOutFormatted: formatUnits(preview.amountOut, tokenOut.decimals),
      feeBps: stream.feeBps,
      priceImpactBps: Number(preview.priceImpactBps),
      source: "demo",
    },
  };
}
