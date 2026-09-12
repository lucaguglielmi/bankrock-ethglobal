/**
 * What every `/api/earn/*` route does before it does anything (spec 20 Part 4).
 *
 * The order is fixed and the same everywhere: the caller must present a valid Privy access
 * token; the deployment must be configured for earn; the wallet named in the request must be
 * one of the caller's own embedded wallets. Each refusal says which gate refused, and none of
 * them is skipped when a secret is missing — a missing secret closes the route (D-017).
 *
 * Reads answer `200` with a `{ state, reason }` envelope so a client renders the reason as an
 * honest empty state (D-013). Writes answer with a status code as well, because a write that did
 * not happen must not look like one that did.
 */

import { NextResponse } from "next/server";
import { requirePrivyIdentity, type PrivyIdentity } from "@/lib/auth/privy";
import { earnConfig, type EarnConfig } from "@/lib/earn/config";
import { assertWalletBelongsTo, type EmbeddedWalletRef } from "@/lib/earn/privy-api";
import { consumeIpRateLimit, requireIpRateLimit } from "@/lib/rate-limit";

/** Privy wallet ids are short opaque tokens. Anything else is refused before it is looked up. */
export const WALLET_ID_PATTERN = /^[A-Za-z0-9_-]{4,128}$/;

export function isWalletId(value: unknown): value is string {
  return typeof value === "string" && WALLET_ID_PATTERN.test(value);
}

export function unavailableJson(reason: string, status = 200): NextResponse {
  return NextResponse.json({ state: "UNAVAILABLE", reason }, { status });
}

export interface EarnCaller {
  cfg: EarnConfig;
  identity: PrivyIdentity;
}

/**
 * Token, then configuration. `writing` decides the rate-limit posture: a write fails closed when
 * the limiter cannot be consulted (audit P-11); a read fails open and is logged.
 */
export async function requireEarnCaller(
  req: Request,
  writing: boolean,
): Promise<{ ok: true; caller: EarnCaller } | { ok: false; response: NextResponse }> {
  const auth = await requirePrivyIdentity(req);
  if (!auth.ok) return { ok: false, response: auth.response };

  const cfg = earnConfig();
  if (cfg.state === "UNAVAILABLE") {
    return { ok: false, response: unavailableJson(cfg.reason, writing ? 503 : 200) };
  }

  if (writing) {
    const limit = await requireIpRateLimit(req, "earn-write", 20, 60_000);
    if (!limit.ok) {
      return {
        ok: false,
        response: NextResponse.json(
          limit.status === 503
            ? { state: "UNAVAILABLE", reason: limit.reason }
            : { error: limit.reason },
          { status: limit.status },
        ),
      };
    }
  } else {
    const limit = await consumeIpRateLimit(req, "earn-read", 60, 60_000);
    if (!limit.allowed) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Too Many Requests" }, { status: 429 }),
      };
    }
  }

  return { ok: true, caller: { cfg: cfg.value, identity: auth.identity } };
}

/** The wallet a request names, checked against the caller's own embedded wallets. */
export async function requireOwnedWallet(
  caller: EarnCaller,
  walletId: unknown,
  writing: boolean,
): Promise<{ ok: true; wallet: EmbeddedWalletRef } | { ok: false; response: NextResponse }> {
  if (!isWalletId(walletId)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "walletId is required" }, { status: 400 }),
    };
  }
  const owned = await assertWalletBelongsTo(caller.cfg, caller.identity.did, walletId);
  if (owned.state === "UNAVAILABLE") {
    const foreign = owned.reason.startsWith("That wallet does not belong");
    return {
      ok: false,
      response: unavailableJson(owned.reason, foreign ? 403 : writing ? 503 : 200),
    };
  }
  return { ok: true, wallet: owned.value };
}

export function walletIdFromQuery(req: Request): string | null {
  try {
    return new URL(req.url).searchParams.get("walletId");
  } catch {
    return null;
  }
}
