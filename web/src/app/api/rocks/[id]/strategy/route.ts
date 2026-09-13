/**
 * GET /api/rocks/[id]/strategy — a rock's live Aqua streams.
 *
 *   ?maker=0x…     the Rock Account. Optional: without it the registry is asked which account
 *                  this rock has, so the public rock page needs nothing but the id.
 *   ?stream=&feeBps=  probe one specific stream instead of the catalogue (`DEFAULT_STREAMS`). When
 *                  only `stream` is given, the fee is the catalogue's fee for that index.
 *   ?fees=0        skip the fee scan (it costs an eth_getLogs round trip).
 *
 * The response is capability-shaped (D-013), and every branch that cannot produce a real number
 * says so instead of producing one:
 *
 *   REAL         at least one strategy is shipped; virtual, actual and executable balances
 *                come from `Aqua.safeBalances` and `ERC20.balanceOf` on Sepolia. `value.stopped`
 *                lists the catalogue streams that were docked (`Aqua.rawBalances`), which can
 *                never be shipped again.
 *   UNAVAILABLE  the app address is unset, the RPC is unreachable, the rock has no Rock Account,
 *                or nothing is shipped. `reason` names which.
 *
 * There is no DEMO branch here at all: this endpoint has no simulated mode to fall back to.
 *
 * The read itself — resolving the maker, probing the streams, scanning fees, serialising — is
 * `readRockStrategyView` in lib/aqua/strategy-view.ts, shared with the hosted MCP endpoint
 * (`/api/mcp`), which runs in the same Worker and cannot call this route over HTTP. This file
 * only parses the request and meters it.
 *
 * Amounts are decimal strings in base units — a `number` cannot hold 18-decimal WETH without
 * losing precision, and a rounded balance is a wrong balance.
 */

import { NextResponse } from "next/server";
import { isAddress, getAddress, type Address } from "viem";
import { DEFAULT_STREAMS, streamPresetFor } from "@/lib/aqua";
import { readRockStrategyView } from "@/lib/aqua/strategy-view";
import { consumeIpRateLimit } from "@/lib/rate-limit";
import { parseRockId } from "@/lib/rock-account";

function unavailable(rockId: string, reason: string) {
  return NextResponse.json({ state: "UNAVAILABLE", reason, rockId });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);

  // This route drives `eth_call` and, with `fees=1`, `eth_getLogs` against the operator's paid
  // RPC, so it is metered like the other public reads (audit P-10). A read route fails open: if
  // the ledger is unreachable the page still renders (P-11, documented in lib/rate-limit.ts).
  const limit = await consumeIpRateLimit(req, "rock-read", 60, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }

  if (parseRockId(id) === null) {
    return unavailable(id, `"${id}" is not a rock id: it must be a positive integer`);
  }

  // Who the maker is: the caller may say, or the registry can (inside the shared read).
  let maker: Address | undefined;
  const makerParam = url.searchParams.get("maker");
  if (makerParam) {
    if (!isAddress(makerParam, { strict: false })) {
      return unavailable(id, "The `maker` parameter is not a valid address");
    }
    maker = getAddress(makerParam);
  }

  // Which streams to probe. A rock's strategies are recomputable from its id, so this needs no
  // stored list — see lib/aqua/strategy.ts. By default every catalogue preset is probed: one
  // `safeBalances` call each, and only the live ones come back.
  const streamParam = url.searchParams.get("stream");
  const feeParam = url.searchParams.get("feeBps");
  let streams: ReadonlyArray<{ streamIndex: number; feeBps: number; label?: string }> =
    DEFAULT_STREAMS;
  if (streamParam !== null || feeParam !== null) {
    const streamIndex = Number(streamParam ?? 0);
    // A stream's fee is part of its hash, so `?stream=2` alone must mean "stream 2 at the fee the
    // catalogue gives stream 2" — defaulting to stream 0's fee would probe a hash nothing shipped.
    const feeBps = Number(
      feeParam ?? streamPresetFor(streamIndex)?.feeBps ?? DEFAULT_STREAMS[0].feeBps,
    );
    if (!Number.isInteger(streamIndex) || streamIndex < 0 || !Number.isInteger(feeBps) || feeBps < 0) {
      return unavailable(id, "`stream` and `feeBps` must be non-negative integers");
    }
    streams = [{ streamIndex, feeBps }];
  }

  const view = await readRockStrategyView({
    rockId: id,
    maker,
    streams,
    fees: url.searchParams.get("fees") !== "0",
  });
  if (view.state !== "REAL") {
    return unavailable(
      id,
      view.state === "UNAVAILABLE" ? view.reason : "This rock's strategy is not readable",
    );
  }

  return NextResponse.json({ state: "REAL", rockId: id, value: view.value });
}
