/**
 * GET /api/rocks/[id]/quote?tokenIn=USDC&amountIn=… (E-5)
 *
 * Replaces `/api/quote`, which proxied the 1inch Swap API on chain 8453 (Base **mainnet**) with
 * mainnet token addresses while execution targeted a testnet. The 1inch Swap API serves mainnets
 * only, so it could never work here; it and `1INCH_API_KEY` are deleted (spec 16 §1.4).
 *
 * The replacement quotes from the SwapVM router's own `quote()` view — the only source guaranteed
 * to equal what `swap()` executes (spec 04, "Quoting"). Two things are missing before that can
 * return a number:
 *
 *   1. no SwapVM router is deployed on any testnet; we deploy our own in Phase 3
 *      (NEXT_PUBLIC_SWAPVM_ROUTER_ADDRESS);
 *   2. the router's `quote` signature is an unverified hypothesis — see
 *      lib/chain/abi/swapvm.ts for the sources and what must be read to confirm it.
 *
 * Until both hold, this returns UNAVAILABLE. A revert or a decode failure also returns
 * UNAVAILABLE: that is what a wrong ABI looks like on the wire, and a guess is worse than nothing.
 */

import { NextResponse } from "next/server";
import { parseUnits, formatUnits } from "viem";
import { addresses, getPublicClient, isTokenSymbol, tokens } from "@/lib/chain";
import {
  SWAPVM_QUOTE_ABI_IS_HYPOTHESIS,
  SWAPVM_ROUTER_QUOTE_ABI,
} from "@/lib/chain/abi/swapvm";
import { logger } from "@/lib/telemetry";

function unavailableBody(reason: string) {
  return { state: "UNAVAILABLE" as const, reason, amountOut: null };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const tokenInParam = (searchParams.get("tokenIn") || "").toUpperCase();
  const amountInParam = searchParams.get("amountIn") || "";

  if (!isTokenSymbol(tokenInParam)) {
    return NextResponse.json(
      { error: "tokenIn must be USDC or WETH" },
      { status: 400 },
    );
  }
  if (!/^\d+(\.\d+)?$/.test(amountInParam) || Number(amountInParam) <= 0) {
    return NextResponse.json(
      { error: "amountIn must be a positive decimal amount" },
      { status: 400 },
    );
  }

  const tokenIn = tokens[tokenInParam];
  const tokenOut = tokenInParam === "USDC" ? tokens.WETH : tokens.USDC;

  const router = addresses.swapVmRouter;
  if (!router) {
    return NextResponse.json(
      unavailableBody(
        "NEXT_PUBLIC_SWAPVM_ROUTER_ADDRESS is not configured — no SwapVM router is deployed on Sepolia yet, so there is nothing to quote against",
      ),
    );
  }
  if (!tokenIn.address || !tokenOut.address) {
    return NextResponse.json(
      unavailableBody("The USDC and WETH addresses are not configured"),
    );
  }

  const amountIn = parseUnits(amountInParam, tokenIn.decimals);

  try {
    const amountOut = await getPublicClient().readContract({
      address: router,
      abi: SWAPVM_ROUTER_QUOTE_ABI,
      functionName: "quote",
      args: [tokenIn.address, tokenOut.address, amountIn],
    });

    return NextResponse.json({
      state: "REAL",
      rockId: id,
      tokenIn: tokenIn.symbol,
      tokenOut: tokenOut.symbol,
      amountIn: amountInParam,
      amountOut: formatUnits(amountOut, tokenOut.decimals),
      source: "SwapVMRouter.quote",
    });
  } catch (error) {
    logger.warn("SwapVM quote call failed", {
      action: "QUOTE_UNAVAILABLE",
      rockId: id,
      abiIsHypothesis: SWAPVM_QUOTE_ABI_IS_HYPOTHESIS,
    });
    return NextResponse.json(
      unavailableBody(
        SWAPVM_QUOTE_ABI_IS_HYPOTHESIS
          ? "The router did not answer the quote call. Its quote ABI has not been confirmed against a deployed router, so no amount can be shown."
          : `The router did not answer the quote call: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
}
