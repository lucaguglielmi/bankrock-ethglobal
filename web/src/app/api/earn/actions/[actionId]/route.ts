/**
 * GET /api/earn/actions/[actionId]?walletId= — one earn action's status, with its transaction
 * hash once a step has been broadcast (D-014: the hash is Privy's, never invented here).
 */

import { NextResponse } from "next/server";
import { getAction } from "@/lib/earn/privy-api";
import {
  requireEarnCaller,
  requireOwnedWallet,
  unavailableJson,
  walletIdFromQuery,
} from "@/lib/earn/route.server";

const ACTION_ID = /^[A-Za-z0-9_-]{4,128}$/;

export async function GET(req: Request, { params }: { params: Promise<{ actionId: string }> }) {
  const { actionId } = await params;
  if (!ACTION_ID.test(actionId)) {
    return NextResponse.json({ error: "Malformed action id" }, { status: 400 });
  }

  const gate = await requireEarnCaller(req, false);
  if (!gate.ok) return gate.response;

  const owned = await requireOwnedWallet(gate.caller, walletIdFromQuery(req), false);
  if (!owned.ok) return owned.response;

  const action = await getAction(gate.caller.cfg, owned.wallet.walletId, actionId);
  if (action.state === "UNAVAILABLE") return unavailableJson(action.reason);

  return NextResponse.json({ state: "REAL", action: action.value });
}
