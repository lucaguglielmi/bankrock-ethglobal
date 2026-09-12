/**
 * The shared body of `POST /api/earn/deposit` and `POST /api/earn/withdraw` (spec 20 Part 4).
 *
 * The request carries a body the user's wallet has already signed. This handler checks that the
 * body is exactly the shape this deployment allows — the configured vault, a positive integer
 * amount, nothing else — and forwards it. It cannot substitute a vault, an amount or a wallet:
 * any change breaks the signature and Privy refuses the request. There is no unsigned path.
 */

import { NextResponse } from "next/server";
import { submitEarnAction } from "@/lib/earn/privy-api";
import { requireEarnCaller, requireOwnedWallet, unavailableJson } from "@/lib/earn/route.server";
import { isRawAmount, type EarnActionKind, type SignedEarnRequest } from "@/lib/earn/shared";
import { logger } from "@/lib/telemetry";

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const SIGNATURE = /^[A-Za-z0-9+/=_-]{16,4096}$/;
const MILLIS = /^[0-9]{13}$/;

/** The longest a signed request may claim to live. Longer than this is refused as suspicious. */
const MAX_EXPIRY_AHEAD_MS = 15 * 60 * 1000;

function bad(error: string): NextResponse {
  return NextResponse.json({ error }, { status: 400 });
}

export async function handleEarnWrite(req: Request, kind: EarnActionKind) {
  const gate = await requireEarnCaller(req, true);
  if (!gate.ok) return gate.response;
  const { cfg } = gate.caller;

  const raw = (await req.json().catch(() => null)) as Partial<SignedEarnRequest> | null;
  if (!raw || typeof raw !== "object") return bad("A JSON body is required");

  const body = raw.body;
  if (!body || typeof body !== "object") return bad("body is required");
  const keys = Object.keys(body).sort();
  if (keys.length !== 2 || keys[0] !== "raw_amount" || keys[1] !== "vault_id") {
    return bad("body must contain exactly vault_id and raw_amount");
  }
  if (body.vault_id !== cfg.vaultId) {
    return bad("body.vault_id is not the vault this deployment offers");
  }
  if (!isRawAmount(body.raw_amount)) {
    return bad("body.raw_amount must be a positive integer string in the asset's smallest unit");
  }
  if (typeof raw.signature !== "string" || !SIGNATURE.test(raw.signature)) {
    return bad("signature is required — the wallet must sign the request");
  }
  if (typeof raw.idempotencyKey !== "string" || !UUID.test(raw.idempotencyKey)) {
    return bad("idempotencyKey must be a UUID");
  }
  if (typeof raw.requestExpiry !== "string" || !MILLIS.test(raw.requestExpiry)) {
    return bad("requestExpiry must be Unix milliseconds");
  }
  const expiry = Number(raw.requestExpiry);
  const now = Date.now();
  if (expiry <= now) return bad("The signed request has expired; sign it again");
  if (expiry > now + MAX_EXPIRY_AHEAD_MS) return bad("requestExpiry is too far in the future");

  const owned = await requireOwnedWallet(gate.caller, raw.walletId, true);
  if (!owned.ok) return owned.response;

  const request: SignedEarnRequest = {
    walletId: owned.wallet.walletId,
    body: { vault_id: body.vault_id, raw_amount: body.raw_amount },
    signature: raw.signature,
    idempotencyKey: raw.idempotencyKey,
    requestExpiry: raw.requestExpiry,
  };

  const action = await submitEarnAction(cfg, kind, request);
  if (action.state === "UNAVAILABLE") {
    return unavailableJson(action.reason, 502);
  }

  logger.info(`Earn ${kind} submitted`, {
    action: kind === "deposit" ? "EARN_DEPOSIT_SUBMITTED" : "EARN_WITHDRAW_SUBMITTED",
    walletAddress: owned.wallet.address,
    actionId: action.value.id,
    status: action.value.status,
  });

  return NextResponse.json({ state: "REAL", action: action.value });
}
