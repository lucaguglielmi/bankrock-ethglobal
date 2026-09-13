/**
 * GET|POST /api/alerts - a rock's alert preferences (SA-5, N-9).
 *
 * Both verbs were anonymous: anyone could read back the owner's stored email address for any
 * rockId, or overwrite it. Both now require a verified Privy access token
 * (`Authorization: Bearer …`) and only ever touch the preferences owned by that DID.
 *
 * Scoping, verified for the perimeter audit (P-13): preferences are stored per rock and owned by
 * the Privy DID that first wrote them (`lib/alerts.ts`). A read by any other DID is refused, and so
 * is a write - an email address stored here is never returned to another account. The residual
 * weakness is squatting, not disclosure: because a Privy token proves an account rather than the
 * rock's owner, a stranger can claim a rock's row before its owner does and hold it. That is
 * recorded rather than fixed here; the fix is checking the DID against the registry's owner, which
 * needs the DID→wallet link the token does not carry.
 *
 * `topics` is `{ [topic]: { push: boolean, email: boolean } }`, every topic optional. A malformed
 * topic is a 400, an unknown topic key is ignored (`parseTopicsInput`).
 *
 * Preferences persist; delivery does not exist. Spec 15 Part 6 cuts the delivery pipeline, so the
 * response states plainly that no alert can currently be dispatched. That is intentional: alert
 * delivery stays sandboxed until the project is on mainnet - a decision, not a missing feature
 * (DEMO-STATE N-2).
 */

import { NextResponse } from "next/server";
import { requirePrivyIdentity } from "@/lib/auth/privy";
import {
  DEFAULT_ALERT_TOPICS,
  getAlertPreferences,
  parseTopicsInput,
  saveAlertPreferences,
} from "@/lib/alerts";
import { logger } from "@/lib/telemetry";

const DELIVERY_NOTE =
  "Alert delivery is sandboxed on purpose until Bank Rock is on mainnet: preferences are stored, but nothing dispatches them yet.";

function rockIdFrom(value: unknown): string | null {
  const raw = String(value ?? "").trim();
  return /^\d+$/.test(raw) ? raw : null;
}

export async function GET(req: Request) {
  const auth = await requirePrivyIdentity(req);
  if (!auth.ok) return auth.response;

  const rockId = rockIdFrom(new URL(req.url).searchParams.get("rockId"));
  if (!rockId) {
    return NextResponse.json({ error: "rockId must be an unsigned integer" }, { status: 400 });
  }

  const result = await getAlertPreferences(rockId, auth.identity.did);
  if (result.state === "UNAVAILABLE") {
    return NextResponse.json(
      { state: "UNAVAILABLE", reason: result.reason },
      { status: 503 },
    );
  }

  return NextResponse.json({
    state: "REAL",
    delivery: { state: "UNAVAILABLE", reason: DELIVERY_NOTE },
    preferences:
      result.value ??
      {
        rockId,
        email: "",
        pushEnabled: false,
        topics: DEFAULT_ALERT_TOPICS,
        updatedAt: null,
      },
  });
}

export async function POST(req: Request) {
  const auth = await requirePrivyIdentity(req);
  if (!auth.ok) return auth.response;

  const body = (await req.json().catch(() => ({}))) as {
    rockId?: string | number;
    email?: string;
    pushEnabled?: boolean;
    topics?: unknown;
  };

  const rockId = rockIdFrom(body.rockId);
  if (!rockId) {
    return NextResponse.json({ error: "rockId must be an unsigned integer" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.slice(0, 254) : "";
  if (email !== "" && !email.includes("@")) {
    return NextResponse.json({ error: "email must be an address or empty" }, { status: 400 });
  }

  const topics = parseTopicsInput(body.topics);
  if (!topics.ok) {
    return NextResponse.json({ error: topics.error }, { status: 400 });
  }

  const result = await saveAlertPreferences(
    rockId,
    auth.identity.did,
    email,
    Boolean(body.pushEnabled),
    topics.topics,
  );

  if (result.state === "UNAVAILABLE") {
    logger.warn("Alert preferences not saved", {
      action: "ALERT_PREFERENCES_UNAVAILABLE",
      rockId,
      reason: result.reason,
    });
    return NextResponse.json(
      { state: "UNAVAILABLE", reason: result.reason },
      { status: 503 },
    );
  }

  return NextResponse.json({
    state: "REAL",
    persisted: true,
    delivery: { state: "UNAVAILABLE", reason: DELIVERY_NOTE },
    preferences: result.value,
  });
}
