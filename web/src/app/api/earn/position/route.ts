/**
 * GET /api/earn/position?walletId= — the caller's position in the vault (spec 20 Part 4).
 *
 * `earned` is the realised figure `assets_in_vault + total_withdrawn − total_deposited`, in
 * the asset's smallest unit. It is the only yield number this app shows, and it is computed
 * here from Privy's own position — never from a rate (D-004, D-033).
 */

import { NextResponse } from "next/server";
import { getPosition, getVaultDetails } from "@/lib/earn/privy-api";
import {
  requireEarnCaller,
  requireOwnedWallet,
  unavailableJson,
  walletIdFromQuery,
} from "@/lib/earn/route.server";
import { earnedSoFar } from "@/lib/earn/shared";

export async function GET(req: Request) {
  const gate = await requireEarnCaller(req, false);
  if (!gate.ok) return gate.response;

  const owned = await requireOwnedWallet(gate.caller, walletIdFromQuery(req), false);
  if (!owned.ok) return owned.response;

  const vault = await getVaultDetails(gate.caller.cfg);
  if (vault.state === "UNAVAILABLE") return unavailableJson(vault.reason);

  const position = await getPosition(gate.caller.cfg, owned.wallet.walletId, vault.value);
  if (position.state === "UNAVAILABLE") return unavailableJson(position.reason);

  return NextResponse.json({
    state: "REAL",
    walletId: owned.wallet.walletId,
    address: owned.wallet.address,
    position: position.value,
    earned: earnedSoFar(position.value).toString(),
  });
}
