/**
 * GET /api/earn/vault — the one vault this deployment offers (spec 20 Part 4).
 *
 * Public: a visitor may see where savings would go before signing in. What it returns is what
 * the client needs to describe the vault and to sign a request against it — the vault, the earn
 * API base the server itself uses, and the public app id — and not the vault's rate: Privy's
 * `user_apy` / `app_apy` never reach a bundle (D-004, D-033).
 */

import { NextResponse } from "next/server";
import { earnConfig } from "@/lib/earn/config";
import { getVaultDetails } from "@/lib/earn/privy-api";
import { unavailableJson } from "@/lib/earn/route.server";
import { consumeIpRateLimit } from "@/lib/rate-limit";

export async function GET(req: Request) {
  const limit = await consumeIpRateLimit(req, "earn-read", 60, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }

  const cfg = earnConfig();
  if (cfg.state === "UNAVAILABLE") return unavailableJson(cfg.reason);

  const vault = await getVaultDetails(cfg.value);
  if (vault.state === "UNAVAILABLE") return unavailableJson(vault.reason);

  return NextResponse.json({
    state: "REAL",
    vault: vault.value,
    apiBase: cfg.value.earnApiBase,
    appId: cfg.value.appId,
  });
}
