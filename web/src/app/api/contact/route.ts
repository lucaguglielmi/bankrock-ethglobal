/**
 * POST /api/contact — the shop's "Claim an OG Rock" and "Become a Sponsor" forms (S-6).
 *
 * Both forms used to submit nowhere: the handler was two `setTimeout`s that showed a success
 * state and closed the modal. This persists the request to D1 and returns 503 UNAVAILABLE when
 * there is no database. A success state is never shown for a request that was not stored.
 */

import { NextResponse } from "next/server";
import { getDb, NO_DATABASE_REASON } from "@/lib/db";
import { contactRequests } from "@/lib/db/schema";
import { requireIpRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/telemetry";

const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const KINDS = new Set(["og_rock", "sponsor"]);

export async function POST(req: Request) {
  const limit = await requireIpRateLimit(req, "contact", 10, 60 * 60 * 1000);
  if (!limit.ok) {
    // Fail closed: this route writes a row on an anonymous caller's behalf (audit P-11).
    return NextResponse.json(
      limit.status === 503
        ? { state: "UNAVAILABLE", reason: limit.reason }
        : { error: limit.reason },
      { status: limit.status },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    email?: string;
    message?: string;
    kind?: string;
  };

  const kind = String(body.kind ?? "").trim();
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const message = String(body.message ?? "").trim();

  if (!KINDS.has(kind)) {
    return NextResponse.json({ error: 'kind must be "og_rock" or "sponsor"' }, { status: 400 });
  }
  if (name.length < 1 || name.length > 120) {
    return NextResponse.json({ error: "A name is required." }, { status: 400 });
  }
  if (email.length > 254 || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }
  if (message.length < 1 || message.length > 4000) {
    return NextResponse.json(
      { error: "A message of up to 4000 characters is required." },
      { status: 400 },
    );
  }

  const db = getDb();
  if (!db) {
    return NextResponse.json({ state: "UNAVAILABLE", reason: NO_DATABASE_REASON }, { status: 503 });
  }

  try {
    const id = crypto.randomUUID();
    await db.insert(contactRequests).values({
      id,
      kind,
      name,
      email,
      message,
      createdAt: Date.now(),
    });

    logger.info("Contact request stored", { action: "CONTACT_REQUEST_STORED", kind, email });

    return NextResponse.json({ state: "REAL", id, persisted: true });
  } catch (error) {
    logger.error("Failed to store contact request", error, { action: "CONTACT_REQUEST_FAILED" });
    return NextResponse.json(
      {
        state: "UNAVAILABLE",
        reason: "Your message could not be stored, so it was not received.",
      },
      { status: 503 },
    );
  }
}
