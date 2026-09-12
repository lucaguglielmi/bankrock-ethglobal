/**
 * The single NFC verifier endpoint (D-018, Phase 4 step 1).
 *
 * GET  /api/nfc/verify?rockId=…&e=…&c=…[&enc=…][&subject=0x…]
 * POST /api/nfc/verify   { rockId, e, c, enc?, subject? }
 *
 * `e` / `picc_data` is the 16-byte encrypted PICCData and `c` / `cmac` the
 * 8-byte truncated SDM CMAC, both hex, exactly as the NTAG 424 DNA mirrors them
 * into the tag URL.
 *
 * `subject` is the wallet the tap authorises. It is client-supplied on purpose:
 * the tap is the authorisation, and `subject` only names who the tapper is
 * giving the rock to. It never substitutes for the tap — no CMAC match, no
 * attestation. Binding it into the signed struct is what lets the transaction
 * be relayed or sent from a sponsored Safe without the relayer redirecting the
 * rock to itself.
 *
 * There is deliberately **no `smartAccount` parameter**. The Rock Account is
 * resolved server-side: a claim signs the account the registry already holds
 * for the rock, an awakening signs the account derived from `subject` and the
 * tag. Letting the client name it is the front-running hole the field exists to
 * close, so a `smartAccount` in the query string is ignored, not honoured.
 *
 * `rockId` is likewise a hint, not the answer. The id written on a tag at
 * provisioning time can be stale — the tag may have been moved to a replacement
 * rock, or its rock archived — so the response carries `effectiveRockId` and
 * `resolution`, resolved from the registry, and the page navigates to those.
 * The attestation is signed for the effective id, never for the URL id.
 *
 * Rate limited per IP, and fail closed (P-4, D-017). This is the most expensive
 * unauthenticated endpoint in the app — after a CMAC match it reads the
 * registry, the indexed events and D1, and derives a Safe address — so a
 * request that the limiter could not account for is refused rather than served.
 * That is the same stance the verifier already takes on the counter store: a
 * tap that cannot be checked for replay is not a tap that passed.
 *
 * No `export const runtime`: OpenNext runs route handlers on the Worker and the
 * declaration only confuses the adapter (D-016).
 */

import { NextResponse } from "next/server";

import { verifyTap, type VerifyTapInput, type VerifyTapResponse } from "@/lib/nfc/verify";
import { consumeIpRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

/** Per-IP budget. A genuine tap is one request; a scanner is thousands. */
const RATE_LIMIT = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;

function respond(status: number, body: VerifyTapResponse): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Returns a refusal, or `null` to proceed.
 *
 * `consumeIpRateLimit` fails *open* by design — it reports `enforced: false`
 * when there is no D1 binding and when the request carries no client IP header
 * — and leaves the stance to the caller. This caller refuses, because an
 * unlimited path to the crypto and the RPC is exactly what P-4 describes.
 */
async function refuseIfRateLimited(request: Request): Promise<NextResponse | null> {
  const decision = await consumeIpRateLimit(
    request,
    "nfc-verify",
    RATE_LIMIT,
    RATE_LIMIT_WINDOW_MS,
  );

  if (!decision.enforced) {
    logger.warn("NFC verifier refusing: no enforceable rate limit", {
      action: "NFC_VERIFY_RATE_LIMIT_UNAVAILABLE",
      reason: decision.reason,
    });
    return NextResponse.json(
      { state: "UNAVAILABLE", verified: false, reason: "rate_limit_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!decision.allowed) {
    logger.warn("NFC verifier rate limit exceeded", {
      action: "NFC_VERIFY_RATE_LIMITED",
    });
    return NextResponse.json(
      { verified: false, reason: "rate_limited" },
      {
        status: 429,
        headers: {
          "Cache-Control": "no-store",
          "Retry-After": String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)),
        },
      },
    );
  }

  return null;
}

function readParams(url: URL): VerifyTapInput {
  const q = url.searchParams;
  return {
    rockId: q.get("rockId") ?? q.get("rockid") ?? undefined,
    e: q.get("e") ?? q.get("picc_data") ?? undefined,
    c: q.get("c") ?? q.get("cmac") ?? undefined,
    enc: q.get("enc") ?? undefined,
    subject: q.get("subject") ?? undefined,
  };
}

/**
 * Log the outcome. The master key, the full UID and the raw parameters are
 * never logged: only the two-byte UID suffix the client already receives.
 */
function log(input: VerifyTapInput, body: VerifyTapResponse, latencyMs: number): void {
  const context = {
    action: body.verified ? "NFC_VERIFIED" : "NFC_VERIFY_REJECTED",
    rockId: input.rockId,
    uidSuffix: body.uid,
    counter: body.counter,
    effectiveRockId: body.effectiveRockId,
    resolution: body.resolution,
    reason: body.reason,
    latencyMs,
  };
  if (body.verified) {
    logger.info("NTAG 424 DNA SDM verification succeeded", context);
  } else {
    logger.warn("NTAG 424 DNA SDM verification rejected", context);
  }
}

async function handle(input: VerifyTapInput): Promise<NextResponse> {
  const start = Date.now();
  try {
    const outcome = await verifyTap(input);
    log(input, outcome.body, Date.now() - start);
    return respond(outcome.status, outcome.body);
  } catch (error) {
    logger.error("NFC verifier failed", error as Error, {
      action: "NFC_VERIFY_ERROR",
      rockId: input.rockId,
      latencyMs: Date.now() - start,
    });
    return respond(500, { verified: false, reason: "verifier_error" });
  }
}

export async function GET(request: Request): Promise<NextResponse> {
  const refusal = await refuseIfRateLimited(request);
  if (refusal) return refusal;

  return handle(readParams(new URL(request.url)));
}

export async function POST(request: Request): Promise<NextResponse> {
  // Before the body is read, so an oversized body is not a way to spend work.
  const refusal = await refuseIfRateLimited(request);
  if (refusal) return refusal;

  const url = new URL(request.url);
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = await request.json();
    if (parsed && typeof parsed === "object") {
      body = parsed as Record<string, unknown>;
    }
  } catch {
    // An unparseable body is treated as empty; the query string may still
    // carry the parameters, and `verifyTap` rejects the request as malformed
    // if it does not.
  }

  const fromQuery = readParams(url);
  const pick = (key: string, fallback: string | undefined): string | undefined => {
    const value = body[key];
    return typeof value === "string" ? value : fallback;
  };

  return handle({
    rockId: pick("rockId", fromQuery.rockId),
    e: pick("e", pick("picc_data", fromQuery.e)),
    c: pick("c", pick("cmac", fromQuery.c)),
    enc: pick("enc", fromQuery.enc),
    subject: pick("subject", fromQuery.subject),
  });
}
