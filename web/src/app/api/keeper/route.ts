/**
 * /api/keeper (SA-6, S-3, N-1, D-014)
 *
 *  - POST triggered a "rebalance" with no authentication at all. It now requires
 *    `x-cron-secret: <CRON_SECRET>`, and an unset secret is a 503, not a bypass (D-017);
 *  - the rebalance mutated an in-memory Map and returned a random 64-hex string as a transaction
 *    hash with `success: true`. No keeper exists, so POST answers UNAVAILABLE and produces no
 *    hash (D-014);
 *  - GET returned a fabricated position — 1,250 USDC, 0.45 WETH, ETH at 2,850, fees accruing from
 *    wall-clock time. It now returns the real position or UNAVAILABLE.
 *
 * Keeper rebalancing remains a DEMO capability in the UI (spec 15 Part 3 / Part 8). The badge is
 * the UI's; this endpoint's job is to never supply a fabricated number to badge.
 */

import { NextResponse } from "next/server";
import { evaluateAquaPosition, executeAquaRebalance } from "@/lib/aqua-keeper";
import { requireCronSecret } from "@/lib/secure";
import { logger } from "@/lib/telemetry";

function parseRockId(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  return /^\d+$/.test(value) && value !== "0" ? value : null;
}

export async function GET(request: Request) {
  const rockId = parseRockId(new URL(request.url).searchParams.get("rockId") ?? "1");
  if (!rockId) {
    return NextResponse.json({ error: "rockId must be a positive integer" }, { status: 400 });
  }

  const result = await evaluateAquaPosition(rockId);
  if (result.state === "UNAVAILABLE") {
    return NextResponse.json(
      { state: "UNAVAILABLE", reason: result.reason, rockId },
      { headers: { "X-Content-Type-Options": "nosniff" } },
    );
  }

  return NextResponse.json(
    { state: result.state, rockId, position: result.value },
    { headers: { "X-Content-Type-Options": "nosniff" } },
  );
}

export async function POST(request: Request) {
  const guard = requireCronSecret(request);
  if (!guard.ok) return guard.response;

  const body = (await request.json().catch(() => ({}))) as { rockId?: number | string };
  const rockId = parseRockId(body.rockId ?? "1");
  if (!rockId) {
    return NextResponse.json({ error: "rockId must be a positive integer" }, { status: 400 });
  }

  const result = await executeAquaRebalance(rockId);

  if (result.state === "UNAVAILABLE") {
    logger.warn("Keeper rebalance refused", {
      action: "KEEPER_REBALANCE_UNAVAILABLE",
      rockId,
      reason: result.reason,
    });
    return NextResponse.json(
      { state: "UNAVAILABLE", reason: result.reason, rockId },
      { status: 503, headers: { "X-Content-Type-Options": "nosniff" } },
    );
  }

  return NextResponse.json(
    { state: result.state, rockId, result: result.value },
    { headers: { "X-Content-Type-Options": "nosniff" } },
  );
}
