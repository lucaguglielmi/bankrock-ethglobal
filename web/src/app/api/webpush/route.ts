/**
 * POST /api/webpush - Web Push subscription management and delivery (spec 14 §4).
 *
 * What this replaced: a route on the old next-on-pages Cloudflare adapter (`getRequestContext`,
 * D-016), `export const runtime = "edge"`, a raw `PushSubscriptions` table it created no migration for,
 * and a client-supplied `userId` stored verbatim (SA-5) - anyone could subscribe, or unsubscribe,
 * on behalf of any other user's rock.
 *
 * Now: `subscribe` and `unsubscribe` require a verified Privy access token (D-017) and store the
 * DID the token names, never one the client asserts. `send` is a scheduled/operator action gated
 * on `x-cron-secret`. VAPID keys come from `requireEnv` with no defaults - unset means the
 * capability is `UNAVAILABLE` (503), never a silent no-op (D-013).
 *
 * Delivery is intentionally sandboxed until the project is on mainnet: `send` is an operator
 * action, no event ever fires a push on its own, and that is a decision rather than a gap
 * (DEMO-STATE N-2).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import webpush from "web-push";
import { and, eq } from "drizzle-orm";
import { requirePrivyIdentity } from "@/lib/auth/privy";
import { getDb, NO_DATABASE_REASON } from "@/lib/db";
import { pushSubscriptions } from "@/lib/db/schema";
import { requireCronSecret } from "@/lib/secure";
import { consumeIpRateLimit } from "@/lib/rate-limit";
import { MissingEnvError, requireEnv } from "@/lib/demo";
import { logger } from "@/lib/telemetry";

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const subscribeBodySchema = z.object({
  action: z.literal("subscribe"),
  subscription: pushSubscriptionSchema,
  rockId: z.string().trim().min(1).max(64).optional(),
});

const unsubscribeBodySchema = z.object({
  action: z.literal("unsubscribe"),
  endpoint: z.string().url(),
});

const sendBodySchema = z.object({
  action: z.literal("send"),
  rockId: z.string().trim().min(1).max(64).optional(),
  userDid: z.string().trim().min(1).optional(),
  payload: z.object({
    title: z.string().trim().min(1).max(200),
    body: z.string().trim().min(1).max(500),
    url: z.string().max(2048).optional(),
  }),
});

const bodySchema = z.discriminatedUnion("action", [
  subscribeBodySchema,
  unsubscribeBodySchema,
  sendBodySchema,
]);

function unavailable(reason: string): NextResponse {
  return NextResponse.json({ state: "UNAVAILABLE", reason }, { status: 503 });
}

interface VapidConfig {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/**
 * Reads the three VAPID env vars, converting a missing one into an UNAVAILABLE reason.
 *
 * The public key is `NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY` - the same name
 * `useNotifications.ts` reads client-side (P-7) - even though this route only ever runs
 * server-side; a public VAPID key is not a secret, and one shared name keeps client and server
 * from silently drifting onto two different key pairs.
 */
function readVapidConfig(): { ok: true; config: VapidConfig } | { ok: false; reason: string } {
  try {
    const publicKey = requireEnv("NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY");
    const privateKey = requireEnv("WEB_PUSH_VAPID_PRIVATE_KEY");
    const subject = requireEnv("WEB_PUSH_SUBJECT");
    return { ok: true, config: { publicKey, privateKey, subject } };
  } catch (err) {
    if (err instanceof MissingEnvError) {
      return { ok: false, reason: `${err.variable} is not configured` };
    }
    throw err;
  }
}

async function handleSubscribe(
  req: Request,
  body: z.infer<typeof subscribeBodySchema>,
): Promise<NextResponse> {
  const auth = await requirePrivyIdentity(req);
  if (!auth.ok) return auth.response;

  const limit = await consumeIpRateLimit(req, "webpush-subscribe", 20, 60 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: "Too Many Requests" }, { status: 429 });
  }

  const db = getDb();
  if (!db) return unavailable(NO_DATABASE_REASON);

  try {
    await db
      .insert(pushSubscriptions)
      .values({
        endpoint: body.subscription.endpoint,
        rockId: body.rockId ?? null,
        userDid: auth.identity.did,
        p256dh: body.subscription.keys.p256dh,
        auth: body.subscription.keys.auth,
        createdAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          rockId: body.rockId ?? null,
          userDid: auth.identity.did,
          p256dh: body.subscription.keys.p256dh,
          auth: body.subscription.keys.auth,
        },
      });

    logger.info("Push subscription stored", { action: "WEBPUSH_SUBSCRIBED" });
    return NextResponse.json({ state: "REAL", subscribed: true });
  } catch (error) {
    logger.error("Failed to store push subscription", error, { action: "WEBPUSH_SUBSCRIBE_FAILED" });
    return unavailable("The subscription could not be stored, so it was not saved.");
  }
}

async function handleUnsubscribe(
  req: Request,
  body: z.infer<typeof unsubscribeBodySchema>,
): Promise<NextResponse> {
  const auth = await requirePrivyIdentity(req);
  if (!auth.ok) return auth.response;

  const db = getDb();
  if (!db) return unavailable(NO_DATABASE_REASON);

  try {
    // Only the DID that registered the subscription may remove it (P-6): the row is matched on
    // endpoint *and* owner, so one caller can never delete another caller's subscription by
    // guessing or replaying its endpoint.
    const deleted = await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.endpoint, body.endpoint),
          eq(pushSubscriptions.userDid, auth.identity.did),
        ),
      )
      .returning({ endpoint: pushSubscriptions.endpoint });

    if (deleted.length === 0) {
      return NextResponse.json(
        { error: "No subscription with that endpoint belongs to this account." },
        { status: 404 },
      );
    }

    logger.info("Push subscription removed", { action: "WEBPUSH_UNSUBSCRIBED" });
    return NextResponse.json({ state: "REAL", unsubscribed: true });
  } catch (error) {
    logger.error("Failed to remove push subscription", error, {
      action: "WEBPUSH_UNSUBSCRIBE_FAILED",
    });
    return unavailable("The subscription could not be removed.");
  }
}

async function handleSend(
  req: Request,
  body: z.infer<typeof sendBodySchema>,
): Promise<NextResponse> {
  const cron = requireCronSecret(req);
  if (!cron.ok) return cron.response;

  const vapid = readVapidConfig();
  if (!vapid.ok) return unavailable(vapid.reason);

  const db = getDb();
  if (!db) return unavailable(NO_DATABASE_REASON);

  const rows = body.rockId
    ? await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.rockId, body.rockId))
    : body.userDid
      ? await db
          .select()
          .from(pushSubscriptions)
          .where(eq(pushSubscriptions.userDid, body.userDid))
      : await db.select().from(pushSubscriptions);

  if (rows.length === 0) {
    return NextResponse.json({ state: "REAL", sent: 0, failed: 0 });
  }

  webpush.setVapidDetails(vapid.config.subject, vapid.config.publicKey, vapid.config.privateKey);

  const payload = JSON.stringify(body.payload);
  let sent = 0;
  let failed = 0;

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: { p256dh: row.p256dh, auth: row.auth },
          },
          payload,
        );
        sent += 1;
      } catch (error) {
        failed += 1;
        logger.error("Push delivery failed", error, { action: "WEBPUSH_SEND_FAILED" });
        // A gone/expired subscription is the push service telling us to stop trying it.
        const statusCode = (error as { statusCode?: number } | null)?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, row.endpoint));
        }
      }
    }),
  );

  return NextResponse.json({ state: "REAL", sent, failed });
}

export async function POST(req: Request) {
  const rawBody: unknown = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  switch (parsed.data.action) {
    case "subscribe":
      return handleSubscribe(req, parsed.data);
    case "unsubscribe":
      return handleUnsubscribe(req, parsed.data);
    case "send":
      return handleSend(req, parsed.data);
  }
}
