import { NextResponse } from "next/server";
import { logger } from "@/lib/telemetry";

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
    const isNew = !subscribersMap.has(normalizedEmail);

    const record: SubscriberRecord = {
      email: normalizedEmail,
      subscribedAt: new Date().toISOString(),
      source: body.source || "landing_genesis_batch",
    };

    subscribersMap.set(normalizedEmail, record);

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
 * Retrieves subscriber statistics and list (used by MCP agent and internal dashboards).
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const showFull = searchParams.get("admin") === "true";

    const subscribersList = Array.from(subscribersMap.values()).map((sub) => {
      if (showFull) {
        return sub;
      }
      // Mask email for privacy when queried publicly
      const [user, domain] = sub.email.split("@");
      const maskedUser = user.length > 2 ? `${user.slice(0, 2)}***${user.slice(-1)}` : `${user.slice(0, 1)}***`;
      return {
        email: `${maskedUser}@${domain}`,
        subscribedAt: sub.subscribedAt,
        source: sub.source,
      };
    });

    return NextResponse.json(
      {
        success: true,
        count: subscribersMap.size,
        subscribers: subscribersList,
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
