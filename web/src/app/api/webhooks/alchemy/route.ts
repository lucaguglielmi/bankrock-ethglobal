/**
 * POST /api/webhooks/alchemy (SA-9, SA-10, D-016)
 *
 *  - the signature check only ran when the secret happened to be set: with the secret unset, or with the
 *    header simply omitted, every payload was accepted and written to the database. Both are now
 *    mandatory, and an unset secret answers 503 (D-017);
 *  - the HMAC comparison is constant-time (`crypto.timingSafeEqual`, SA-10);
 *  - D1 is reached through getCloudflareContext (D-016);
 *  - only well-formed transaction hashes are stored, so no placeholder can reach a UI that
 *    renders explorer links (D-014);
 *  - the row id is `${txHash}-alchemy[-<logIndex>]` and the conflict target is the primary key
 *    (security review 2026-09-13, R-17). The old target was `tx_hash`, whose unique index
 *    migration 0004 dropped, so SQLite refused every insert and every correctly signed payload
 *    answered 503. The `alchemy` segment keeps these rows out of the indexer's
 *    `${txHash}-${logIndex}` namespace, so a webhook row can never shadow a decoded registry
 *    event in the mirror.
 */

import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { getDb, NO_DATABASE_REASON } from "@/lib/db";
import { rockEvents } from "@/lib/db/schema";
import { MissingEnvError, requireEnv } from "@/lib/demo";
import { timingSafeEqualHex, unavailableResponse } from "@/lib/secure";
import { logger } from "@/lib/telemetry";

const TX_HASH_REGEX = /^0x[0-9a-fA-F]{64}$/;

/** A log index from the payload, as a non-negative integer, or null when it is absent or odd. */
function parseLogIndex(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    const parsed = /^\d+$/.test(trimmed)
      ? Number(trimmed)
      : /^0x[0-9a-fA-F]+$/.test(trimmed)
        ? Number.parseInt(trimmed, 16)
        : Number.NaN;
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
  }
  return null;
}

export async function POST(req: Request) {
  let secret: string;
  try {
    secret = requireEnv("ALCHEMY_WEBHOOK_SECRET");
  } catch (err) {
    if (err instanceof MissingEnvError) {
      return unavailableResponse(
        "ALCHEMY_WEBHOOK_SECRET is not configured, so webhook payloads cannot be authenticated",
      );
    }
    throw err;
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-alchemy-signature");

  if (!signature) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  if (!timingSafeEqualHex(signature, expected)) {
    logger.warn("Rejected Alchemy webhook with an invalid signature", {
      action: "ALCHEMY_WEBHOOK_INVALID_SIG",
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    webhookId?: string;
    event?: {
      activity?: { to?: string; hash?: string; log?: { index?: unknown; logIndex?: unknown } }[];
    };
  };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
  }

  const activity = body.event?.activity?.[0];
  const txHash = activity?.hash;

  if (!txHash || !TX_HASH_REGEX.test(txHash)) {
    logger.warn("Alchemy webhook carried no usable transaction hash", {
      action: "ALCHEMY_WEBHOOK_NO_TX",
    });
    return NextResponse.json({ state: "REAL", stored: false });
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ state: "UNAVAILABLE", reason: NO_DATABASE_REASON }, { status: 503 });
  }

  const logIndex = parseLogIndex(activity?.log?.index ?? activity?.log?.logIndex);
  const id = logIndex === null ? `${txHash}-alchemy` : `${txHash}-alchemy-${logIndex}`;

  try {
    await db
      .insert(rockEvents)
      .values({
        id,
        // The rock a transaction belongs to is resolved from the registry once it is deployed
        // (Phase 2). Until then the destination address is the only available key.
        rockId: activity?.to ?? "unknown",
        eventType: "ALCHEMY_WEBHOOK",
        txHash,
        logIndex: logIndex ?? 0,
        amountUsdc: null,
        amountWeth: null,
        timestamp: Date.now(),
      })
      .onConflictDoNothing({ target: rockEvents.id });

    logger.info("Stored Alchemy webhook event", { action: "ALCHEMY_WEBHOOK_STORED", txHash });
    return NextResponse.json({ state: "REAL", stored: true });
  } catch (error) {
    logger.error("Failed to store Alchemy webhook event", error, {
      action: "ALCHEMY_WEBHOOK_ERROR",
    });
    return NextResponse.json(
      { state: "UNAVAILABLE", reason: "The event could not be stored" },
      { status: 503 },
    );
  }
}
