/**
 * GET /api/rocks/[id]/quote?maker=0x…&streamIndex=0&tokenIn=USDC|WETH&amountIn=1.5
 *
 * What a visitor would receive for a swap against one of a rock's Aqua strategies.
 *
 * Two sources, in order of authority:
 *
 *  1. `XYCSwap.quoteExactIn(strategy, zeroForOne, amountIn)` - a view on the app itself, running
 *     the identical code path `swapExactIn` executes against the same block's balances. This is
 *     the guarantee spec 04's "Quoting" section asks for, with XYCSwap in the place of the
 *     SwapVM router (`contracts/aqua/NOTES.md` §8.3);
 *  2. the same constant-product arithmetic in `lib/aqua/quote.ts`, applied to the virtual balances
 *     `readStrategy` returns. Mirrored from the contract, integer-for-integer, and used when the
 *     app address is configured but the view call cannot be made.
 *
 * There is no third source. The 1inch Swap API serves mainnets only (E-5), `/api/quote` and
 * `1INCH_API_KEY` are deleted, and nothing here falls back to a price feed, a hardcoded rate, or
 * an estimate: an unshipped strategy, an unconfigured app or an unreachable RPC all answer
 * UNAVAILABLE with the reason (D-013).
 *
 * `priceImpactBps` is a property of the curve and the trade size, computed from the same reserves
 * the swap will use - not the invented formula the old trade modal carried (N-6). Nothing here is
 * annualised, and no APY is derived from it (D-004).
 */

import { NextResponse } from "next/server";
import { formatUnits, getAddress, isAddress, parseUnits, type Address } from "viem";
import {
  decodeStrategy,
  getAquaAddresses,
  quoteExactIn,
  readRockStreams,
  type CurveState,
} from "@/lib/aqua";
import { getPublicClient, isTokenSymbol, tokens, type TokenSymbol } from "@/lib/chain";
import { XYC_SWAP_ABI } from "@/lib/chain/abi/aqua-app";
import { consumeIpRateLimit } from "@/lib/rate-limit";
import { parseRockId } from "@/lib/rock-account";
import { publicReasonWith } from "@/lib/errors";
import { logger } from "@/lib/telemetry";
import { isDemoRockId } from "@/demo/rock-420/constants";
import { demoQuote } from "@/demo/rock-420/quote";

function unavailableBody(reason: string) {
  return { state: "UNAVAILABLE" as const, reason, value: null };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const limit = await consumeIpRateLimit(req, "quote", 60, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const makerParam = (searchParams.get("maker") || "").trim();
  const tokenInParam = (searchParams.get("tokenIn") || "").toUpperCase();
  const amountInParam = (searchParams.get("amountIn") || "").trim();
  const streamIndexParam = (searchParams.get("streamIndex") || "0").trim();

  if (parseRockId(id) === null) {
    return NextResponse.json(unavailableBody("Invalid rock id"), { status: 400 });
  }
  if (!isAddress(makerParam)) {
    return NextResponse.json(
      unavailableBody("maker must be the rock's Rock Account address"),
      { status: 400 },
    );
  }
  if (!isTokenSymbol(tokenInParam)) {
    return NextResponse.json(unavailableBody("tokenIn must be USDC or WETH"), { status: 400 });
  }
  if (!/^\d+(\.\d+)?$/.test(amountInParam) || Number(amountInParam) <= 0) {
    return NextResponse.json(
      unavailableBody("amountIn must be a positive decimal amount in token units"),
      { status: 400 },
    );
  }
  if (!/^\d+$/.test(streamIndexParam)) {
    return NextResponse.json(unavailableBody("streamIndex must be an unsigned integer"), {
      status: 400,
    });
  }

  const maker = getAddress(makerParam);
  const tokenIn = tokens[tokenInParam as TokenSymbol];
  const tokenOutSymbol: TokenSymbol = tokenInParam === "USDC" ? "WETH" : "USDC";
  const tokenOut = tokens[tokenOutSymbol];

  /*
   * Rock #420 is the stage demo (`web/src/demo/rock-420`, DEMO-STATE.md S-5). It has no strategy
   * on chain, so nothing below could answer for it; its quote is the same `quoteExactIn` over the
   * demo's seeded streams, and it says where it came from: `source: "demo"`. No RPC is touched.
   */
  if (isDemoRockId(id)) {
    const quote = demoQuote({
      streamIndex: Number(streamIndexParam),
      tokenIn: tokenInParam as TokenSymbol,
      amountIn: amountInParam,
    });
    if (quote.state === "UNAVAILABLE") {
      return NextResponse.json(unavailableBody(quote.reason));
    }
    return NextResponse.json({
      state: "DEMO",
      value: quote.value,
      rockId: id,
      maker,
      streamIndex: Number(streamIndexParam),
      tokenIn: tokenIn.symbol,
      tokenOut: tokenOut.symbol,
      amountIn: amountInParam,
    });
  }

  const aquaAddresses = getAquaAddresses();
  if (aquaAddresses.state === "UNAVAILABLE") {
    return NextResponse.json(unavailableBody(aquaAddresses.reason));
  }
  const { app } = aquaAddresses.value;

  const amountIn = parseUnits(amountInParam, tokenIn.decimals);
  const zeroForOne = tokenInParam === "USDC";

  // The strategy is recomputable from the rock id and the maker - no indexer, no stored hash
  // (NOTES.md §3). Its fee is part of its identity, so it is read back from the chain rather than
  // taken from the query: a different fee is a different strategy with no balances.
  const stream = await findLiveStream(id, maker, app, BigInt(streamIndexParam));
  if (stream.state === "UNAVAILABLE") {
    return NextResponse.json(unavailableBody(stream.reason));
  }

  const { feeBps, virtual, strategy } = stream.value;

  const balanceIn = zeroForOne ? virtual.usdc : virtual.weth;
  const balanceOut = zeroForOne ? virtual.weth : virtual.usdc;
  if (balanceIn <= BigInt(0) || balanceOut <= BigInt(0)) {
    return NextResponse.json(
      unavailableBody("This strategy has no balance on one side, so it cannot quote a trade"),
    );
  }

  const curve: CurveState = { balanceIn, balanceOut, feeBps };

  let preview;
  try {
    preview = quoteExactIn(curve, amountIn);
  } catch (err) {
    return NextResponse.json(
      unavailableBody(
        publicReasonWith("This trade cannot be priced against the strategy’s balances", err),
      ),
    );
  }

  // Prefer the app's own view - the identical code path the swap takes.
  let amountOut = preview.amountOut;
  let source: "XYCSwap.quoteExactIn" | "lib/aqua/quote" = "lib/aqua/quote";

  try {
    if (!strategy.strategy) {
      throw new Error("the strategy bytes were not returned by the probe");
    }
    // The app re-derives the hash from these five fields on every call, so they must be exactly
    // the shipped ones - decoded from the bytes, never reassembled from the query.
    const fields = decodeStrategy(strategy.strategy);

    const onChain = (await getPublicClient().readContract({
      address: app,
      abi: XYC_SWAP_ABI,
      functionName: "quoteExactIn",
      args: [
        {
          maker: fields.maker,
          token0: fields.token0,
          token1: fields.token1,
          feeBps: fields.feeBps,
          salt: fields.salt,
        },
        zeroForOne,
        amountIn,
      ],
    })) as bigint;

    amountOut = onChain;
    source = "XYCSwap.quoteExactIn";
  } catch (err) {
    // The mirrored arithmetic stands in. It is the same formula on the same balances, so this is
    // a fallback in provenance, not in accuracy - and the response says which one answered.
    logger.warn("XYCSwap.quoteExactIn unavailable; using the mirrored curve", {
      action: "QUOTE_VIEW_UNAVAILABLE",
      rockId: id,
      reason: err instanceof Error ? err.message : String(err),
    });
  }

  if (amountOut <= BigInt(0)) {
    return NextResponse.json(
      unavailableBody("This amount is too small to receive anything back at this strategy's size"),
    );
  }

  return NextResponse.json({
    state: "REAL",
    value: {
      /** Base units of the output token. */
      amountOut: amountOut.toString(),
      amountOutFormatted: formatUnits(amountOut, tokenOut.decimals),
      /** The strategy's immutable fee. The fee stays in the maker's reserve (NOTES.md §6). */
      feeBps: Number(feeBps),
      priceImpactBps: Number(preview.priceImpactBps),
      source,
    },
    rockId: id,
    maker,
    streamIndex: Number(streamIndexParam),
    tokenIn: tokenIn.symbol,
    tokenOut: tokenOut.symbol,
    amountIn: amountInParam,
  });
}

/**
 * Finds the shipped strategy for `(rock, maker, streamIndex)`.
 *
 * The fee is not supplied by the caller and cannot be: a strategy's fee is part of the bytes that
 * hash to its identity, so a wrong fee is simply a different strategy with no balances. The probe
 * recomputes each candidate's hash and asks Aqua - `safeBalances` reverting is the ordinary "not
 * shipped" answer, not an error (NOTES.md §3, §4).
 */
async function findLiveStream(
  rockId: string,
  maker: Address,
  app: Address,
  streamIndex: bigint,
) {
  const view = await readRockStreams({ rockId, maker, app });
  if (view.state === "UNAVAILABLE") {
    return { state: "UNAVAILABLE" as const, reason: view.reason };
  }

  const stream = view.value.streams.find((candidate) => candidate.streamIndex === streamIndex);
  if (!stream) {
    return {
      state: "UNAVAILABLE" as const,
      reason: `Rock ${rockId} has no live Aqua strategy at stream ${streamIndex}`,
    };
  }

  return {
    state: "REAL" as const,
    value: {
      feeBps: stream.feeBps,
      virtual: stream.virtual,
      strategy: { strategyHash: stream.strategyHash, strategy: stream.strategy },
    },
  };
}
