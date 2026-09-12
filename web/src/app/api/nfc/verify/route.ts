/**
 * The single NFC verifier endpoint (D-018, Phase 4 step 1).
 *
 * GET  /api/nfc/verify?rockId=…&e=…&c=…[&enc=…][&subject=0x…][&smartAccount=0x…]
 * POST /api/nfc/verify   { rockId, e, c, enc?, subject?, smartAccount? }
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
 * `smartAccount` is the Rock Account the tap authorises. It is optional and
 * defaults to the zero address in the signed struct. **A claim does not need
 * one; an awakening must supply it** — without it in the signed struct a
 * front-runner who sees the attestation can bind the rock to a Safe they
 * deployed, so the registry must reject a zero `smartAccount` on the awaken
 * path rather than treat it as a wildcard.
 *
 * No `export const runtime`: OpenNext runs route handlers on the Worker and the
 * declaration only confuses the adapter (D-016).
 */

import { NextResponse } from "next/server";

import { verifyTap, type VerifyTapInput, type VerifyTapResponse } from "@/lib/nfc/verify";
import { logger } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

function respond(status: number, body: VerifyTapResponse): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function readParams(url: URL): VerifyTapInput {
  const q = url.searchParams;
  return {
    rockId: q.get("rockId") ?? q.get("rockid") ?? undefined,
    e: q.get("e") ?? q.get("picc_data") ?? undefined,
    c: q.get("c") ?? q.get("cmac") ?? undefined,
    enc: q.get("enc") ?? undefined,
    subject: q.get("subject") ?? undefined,
    smartAccount: q.get("smartAccount") ?? q.get("smart_account") ?? undefined,
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
  return handle(readParams(new URL(request.url)));
}

export async function POST(request: Request): Promise<NextResponse> {
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
    smartAccount: pick("smartAccount", pick("smart_account", fromQuery.smartAccount)),
  });
}
