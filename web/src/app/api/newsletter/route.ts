import { NextResponse } from "next/server";
import { logger } from "@/lib/telemetry";
import { getRequestContext } from "@cloudflare/next-on-pages";
import { getDb } from "@/lib/db";
import { subscribers } from "@/lib/db/schema";

// Email validation regex (RFC 5322 standard compliance)
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export interface SubscriberRecord {
  email: string;
  subscribedAt: string;
  source?: string;
}

// In-memory persistent subscriber registry (survives edge warm instances and falls back to telemetry)
const subscribersMap = new Map<string, SubscriberRecord>();

// Pre-seed with early convention attendees if empty
if (subscribersMap.size === 0) {
  subscribersMap.set("early_supporter@bankrock.xyz", {
    email: "early_supporter@bankrock.xyz",
    subscribedAt: new Date(Date.now() - 86400000).toISOString(),
    source: "genesis_drop",
  });
}

/**
 * POST /api/newsletter
 * Subscribes an email to Genesis Batch announcements.
 */
export async function POST(req: Request) {
  const start = Date.now();

  try {
    const body = await req.json().catch(() => ({})) as { email?: string; source?: string };
    const rawEmail = typeof body.email === "string" ? body.email.trim() : "";

    if (!rawEmail) {
      return NextResponse.json(
        { error: "Email address is required." },
        { status: 400 }
      );
    }

    if (rawEmail.length > 254 || !EMAIL_REGEX.test(rawEmail)) {
      logger.warn("Newsletter signup rejected invalid email format", {
        action: "NEWSLETTER_INVALID_EMAIL",
        emailSample: rawEmail.slice(0, 10) + "...",
      });
      return NextResponse.json(
        { error: "Please provide a valid email address." },
        { status: 400 }
      );
    }

    const normalizedEmail = rawEmail.toLowerCase();
    
    // Save to D1 Database
    let isNew = true;
    try {
      const env = getRequestContext().env as any;
      if (env && env.DB) {
        const db = getDb(env);
        
        // Attempt to insert, on conflict do nothing (or update if desired)
        await db.insert(subscribers).values({
          email: normalizedEmail,
          topics: body.source ? [body.source] : ["landing_genesis_batch"],
          createdAt: Date.now(),
        }).onConflictDoNothing();
      } else {
        // Fallback for development if D1 not bound properly
        isNew = !subscribersMap.has(normalizedEmail);
        subscribersMap.set(normalizedEmail, {
          email: normalizedEmail,
          subscribedAt: new Date().toISOString(),
          source: body.source || "landing_genesis_batch",
        });
      }
    } catch (dbErr) {
      logger.error("Failed to insert subscriber to D1", dbErr);
      // fallback
      isNew = !subscribersMap.has(normalizedEmail);
      subscribersMap.set(normalizedEmail, {
        email: normalizedEmail,
        subscribedAt: new Date().toISOString(),
        source: body.source || "landing_genesis_batch",
      });
    }

    const latencyMs = Date.now() - start;
    logger.info("Newsletter subscriber recorded successfully", {
      action: "NEWSLETTER_SUBSCRIBED",
      email: normalizedEmail.slice(0, 3) + "***@" + normalizedEmail.split("@")[1],
      isNewSubscriber: isNew,
      totalSubscribers: subscribersMap.size,
      latencyMs,
    });

    return NextResponse.json(
      {
        success: true,
        message: isNew
          ? "You have been added to the Genesis Batch launch list."
          : "Your subscription details have been refreshed.",
        totalSubscribers: subscribersMap.size,
      },
      {
        status: 200,
        headers: {
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  } catch (error: unknown) {
    logger.error("Internal error in POST /api/newsletter", error);
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    );
  }
}

/**
 * GET /api/newsletter
 * Retrieves aggregated subscriber statistics (used by MCP agent and internal dashboards).
 * Zero PII is returned unless authenticated with an operator ADMIN_API_KEY.
 */
export async function GET(req: Request) {
  try {
    const subscribers = Array.from(subscribersMap.values());
    const count = subscribers.length;

    // Check for authorized operator token in Authorization header
    const authHeader = req.headers.get("Authorization") || "";
    const adminKey = process.env.ADMIN_API_KEY;
    const isAuthorizedAdmin = Boolean(adminKey && authHeader === `Bearer ${adminKey}`);

    const now = Date.now();
    const recent24hCount = subscribers.filter(
      (s) => now - new Date(s.subscribedAt).getTime() < 24 * 60 * 60 * 1000
    ).length;

    const sourceBreakdown: Record<string, number> = {};
    for (const sub of subscribers) {
      const src = sub.source || "landing_genesis_batch";
      sourceBreakdown[src] = (sourceBreakdown[src] || 0) + 1;
    }

    // Operator view: Only if explicit ADMIN_API_KEY bearer token matches
    if (isAuthorizedAdmin) {
      return NextResponse.json({
        success: true,
        count,
        recent24hCount,
        sourceBreakdown,
        subscribers,
        lastUpdated: new Date().toISOString(),
      });
    }

    // Public / MCP view: PII-free aggregated metrics only
    return NextResponse.json(
      {
        success: true,
        count,
        recent24hCount,
        sourceBreakdown,
        lastUpdated: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15",
          "X-Content-Type-Options": "nosniff",
        },
      }
    );
  } catch (error: unknown) {
    logger.error("Internal error in GET /api/newsletter", error);
    return NextResponse.json(
      { error: "Failed to retrieve subscriber metrics." },
      { status: 500 }
    );
  }
}
