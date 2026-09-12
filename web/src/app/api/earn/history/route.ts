/**
 * GET /api/earn/history?walletId= — the caller's recent earn deposits and withdrawals, as Privy
 * recorded them. Nothing is stored by this app: the history is read back from the source.
 */

import { NextResponse } from "next/server";
import { listEarnActions } from "@/lib/earn/privy-api";
import {
  requireEarnCaller,
  requireOwnedWallet,
  unavailableJson,
  walletIdFromQuery,
} from "@/lib/earn/route.server";

export async function GET(req: Request) {
  const gate = await requireEarnCaller(req, false);
  if (!gate.ok) return gate.response;

  const owned = await requireOwnedWallet(gate.caller, walletIdFromQuery(req), false);
  if (!owned.ok) return owned.response;

  const actions = await listEarnActions(gate.caller.cfg, owned.wallet.walletId);
  if (actions.state === "UNAVAILABLE") return unavailableJson(actions.reason);

  return NextResponse.json({ state: "REAL", actions: actions.value });
}
