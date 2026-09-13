/**
 * GET /api/admin/contacts - the contact requests and newsletter sign-ups the database holds.
 *
 * `GET /api/admin/stats` counts these rows; the dashboard showed "Contact requests: 3" and an
 * operator had to open D1 to read what was actually asked. This returns the rows themselves - the
 * most recent hundred of each, newest first - and an empty array when there are none. There is
 * no POST and no filter: this endpoint answers one question, it does not accept or alter figures.
 *
 * Requires the admin session cookie (the same credential the /admin pages use), checked exactly
 * as `/api/admin/stats` checks it.
 */

import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { requireAdminSession } from "@/lib/auth";
import { getDb, NO_DATABASE_REASON } from "@/lib/db";
import { contactRequests, subscribers } from "@/lib/db/schema";
import { logger } from "@/lib/telemetry";

/**
 * How many rows of each kind one read returns. The response carries it as `limit`, so the page
 * can say "the most recent 100 of 132" instead of implying the list is everything.
 */
const ADMIN_CONTACTS_LIMIT = 100;

export async function GET(req: Request) {
  const admin = await requireAdminSession(req);
  if (!admin.ok) return admin.response;

  const db = getDb();
  if (!db) {
    return NextResponse.json({ state: "UNAVAILABLE", reason: NO_DATABASE_REASON }, { status: 503 });
  }

  try {
    const [contactRows, subscriberRows] = await Promise.all([
      db
        .select()
        .from(contactRequests)
        .orderBy(desc(contactRequests.createdAt))
        .limit(ADMIN_CONTACTS_LIMIT),
      db
        .select()
        .from(subscribers)
        .orderBy(desc(subscribers.createdAt))
        .limit(ADMIN_CONTACTS_LIMIT),
    ]);

    return NextResponse.json({
      state: "REAL",
      contacts: contactRows.map((row) => ({
        id: row.id,
        kind: row.kind,
        name: row.name,
        email: row.email,
        message: row.message,
        createdAt: new Date(row.createdAt).toISOString(),
      })),
      subscribers: subscriberRows.map((row) => {
        // `subscribers.topics` is where `POST /api/newsletter` keeps the form's `source` - the
        // landing page sends "landing_page", the alerts page the topics it ticked. It is exposed
        // as stored, and joined into `source` for a table that has one column for it.
        const topics = Array.isArray(row.topics) ? row.topics : [];
        return {
          email: row.email,
          topics,
          source: topics.length > 0 ? topics.join(", ") : null,
          createdAt: new Date(row.createdAt).toISOString(),
        };
      }),
      limit: ADMIN_CONTACTS_LIMIT,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("Admin contacts query failed", error, { action: "ADMIN_CONTACTS_FAILED" });
    return NextResponse.json(
      { state: "UNAVAILABLE", reason: "The contact requests could not be read from the database" },
      { status: 503 },
    );
  }
}
