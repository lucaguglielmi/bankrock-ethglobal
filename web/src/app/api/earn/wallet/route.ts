/**
 * GET /api/earn/wallet — the caller's primary embedded wallet, from Privy's own record.
 *
 * The client could read the wallet id off its user object, but the server never trusts a wallet
 * id it did not resolve itself, so this is the source both sides use (spec 20 Part 4).
 */

import { NextResponse } from "next/server";
import { getPrimaryEmbeddedWallet } from "@/lib/earn/privy-api";
import { requireEarnCaller, unavailableJson } from "@/lib/earn/route.server";

export async function GET(req: Request) {
  const gate = await requireEarnCaller(req, false);
  if (!gate.ok) return gate.response;

  const wallet = await getPrimaryEmbeddedWallet(gate.caller.cfg, gate.caller.identity.did);
  if (wallet.state === "UNAVAILABLE") return unavailableJson(wallet.reason);

  return NextResponse.json({ state: "REAL", wallet: wallet.value });
}
