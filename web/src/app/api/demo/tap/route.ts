/**
 * ====================================================================================== *
 * Added 2026-09-13 for the recorded demo, before the prototype tag was programmed. It is not a
 * simulation of anything downstream: the route builds a genuine SDM pair (`e`, `c`) for a
 * SYNTHETIC tag with the same master key a real tag would carry, then redirects into the real
 * tap flow. Verification, the read-counter store, the signed attestation and the on-chain
 * awakening are all the production code path - the only thing faked is the piece of plastic.
 *
 * Gate: the route exists only when the Worker secret `DEMO_TAP_SECRET` is set, and every call
 * must carry it as `?key=`. Anything else is a 404, so the surface is invisible when unused.
 * Unset the secret after the demo and the route is gone. It is listed in DEMO-STATE (§1, S-4).
 *
 * Usage
 *   GET /api/demo/tap?key=<DEMO_TAP_SECRET>            → 302 to /rock/{id}?e=…&c=… for the demo tag
 *   GET /api/demo/tap?key=…&uid=04DE3057A11E80         → the same for another synthetic tag
 *
 * The read counter is `max(last accepted + 1, minutes since 2026-01-01)`: strictly increasing
 * per tag, like the chip's, and monotonic in wall-clock time even on a fresh counter store, so a
 * link can never replay. The rock id in the redirect is the one the tag is bound to when it is
 * already awake, else the first dormant id the registry reports - the same answer a real tap gets.
 */
import { NextResponse } from "next/server";

import { optionalEnv } from "@/lib/demo";
import { aesCbcEncrypt } from "@/lib/nfc/crypto";
import { hashUid } from "@/lib/nfc/attestation";
import { loadSdmKeyConfig } from "@/lib/nfc/config";
import { resolveCounterStore } from "@/lib/nfc/counter-store";
import { computeSdmMac, deriveSessionKeys } from "@/lib/nfc/sdm";
import { consumeIpRateLimit } from "@/lib/rate-limit";
import { findNextDormantRockId, readRock, resolveRockForTag } from "@/lib/rock-account";
import { timingSafeEqualString } from "@/lib/secure";
import { logger } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

/** The default synthetic UID: an NXP-style 7-byte UID that no physical tag carries. */
const DEMO_UID_HEX = "04DE3057A11E80";
/** Read counters count minutes since 2026-01-01 UTC; fits the chip's 24-bit counter for decades. */
const COUNTER_EPOCH_MS = Date.UTC(2026, 0, 1);
const MAX_COUNTER = 0xffffff;

function notFound(): NextResponse {
  return new NextResponse(null, { status: 404 });
}

/** Builds (e, c) exactly as a provisioned NTAG 424 DNA would for this UID and counter. */
function forgeTap(masterKey: Buffer, uid: Buffer, counter: number): { e: string; c: string } {
  const counterBytes = Buffer.from([counter & 0xff, (counter >> 8) & 0xff, (counter >> 16) & 0xff]);
  const padding = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]);
  // PICCDataTag 0xC7: UID mirrored, counter mirrored, 7-byte UID - spec 18 §4.2.
  const plain = Buffer.concat([Buffer.from([0xc7]), uid, counterBytes, padding]);
  const session = deriveSessionKeys(masterKey, uid, counterBytes);
  return {
    e: aesCbcEncrypt(masterKey, plain).toString("hex").toUpperCase(),
    // No SDMENCFileData is mirrored, so the MAC input is empty - the verifier's default.
    c: computeSdmMac(session.macKey, Buffer.alloc(0)).toString("hex").toUpperCase(),
  };
}

export async function GET(req: Request): Promise<NextResponse> {
  const secret = optionalEnv("DEMO_TAP_SECRET");
  if (!secret) return notFound();

  const url = new URL(req.url);
  const key = url.searchParams.get("key") ?? "";
  if (!timingSafeEqualString(key, secret)) return notFound();

  const limit = await consumeIpRateLimit(req, "demo-tap", 10, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }

  const keys = loadSdmKeyConfig();
  if (!keys.ok) {
    return NextResponse.json(
      { state: "UNAVAILABLE", reason: "NXP_MASTER_KEY is not configured, so no tap can be forged" },
      { status: 503 },
    );
  }

  const uidHex = (url.searchParams.get("uid") ?? DEMO_UID_HEX).toUpperCase();
  if (!/^[0-9A-F]{14}$/.test(uidHex)) {
    return NextResponse.json({ error: "uid must be 7 bytes of hex" }, { status: 400 });
  }
  const uid = Buffer.from(uidHex, "hex");

  const store = await resolveCounterStore();
  const last = store.available ? await store.store.getLast(uidHex) : null;
  const byClock = Math.floor((Date.now() - COUNTER_EPOCH_MS) / 60_000);
  const counter = Math.min(MAX_COUNTER, Math.max((last ?? 0) + 1, byClock));

  // Where the real tap would land: the bound rock if this tag already has one, else the first
  // dormant id the registry reports (never the mirror's guess - see lib/nfc/rock-resolution.ts).
  const uidHash = hashUid(uid);
  const bound = await resolveRockForTag(uidHash);
  let rockId: string | null = bound.state === "REAL" ? bound.value.rockId : null;
  if (rockId === null) rockId = await findNextDormantRockId("1", readRock);
  if (rockId === null) {
    return NextResponse.json(
      { state: "UNAVAILABLE", reason: "The registry could not be asked which rock this tap belongs to" },
      { status: 503 },
    );
  }

  const { e, c } = forgeTap(keys.config.masterKey, uid, counter);
  logger.warn("DEMO tap link used - a synthetic tag was forged for this request", {
    action: "DEMO_TAP_FORGED",
    rockId,
    counter,
  });

  const target = new URL(`/rock/${rockId}`, url.origin);
  target.searchParams.set("e", e);
  target.searchParams.set("c", c);
  return NextResponse.redirect(target, { status: 302, headers: { "cache-control": "no-store" } });
}
