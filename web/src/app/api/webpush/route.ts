import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { getRequestContext } from "@cloudflare/next-on-pages";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as any;
    const { action, subscription, rockId, userId } = body as any;
    
    if (action === "subscribe") {
      const env = getRequestContext().env as any;
      if (!env || !env.DB) {
        return NextResponse.json({ success: false, error: "Database not available" }, { status: 500 });
      }

      await env.DB.prepare(`
        INSERT INTO PushSubscriptions (rockId, userId, endpoint, p256dh, auth)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(endpoint) DO UPDATE SET 
          rockId = excluded.rockId, 
          userId = excluded.userId,
          p256dh = excluded.p256dh,
          auth = excluded.auth
      `).bind(
        rockId || 'anonymous',
        userId || 'anonymous',
        subscription.endpoint,
        subscription.keys?.p256dh || '',
        subscription.keys?.auth || ''
      ).run();

      return NextResponse.json({ success: true, message: "Subscribed successfully." });
    }

    if (action === "notify") {
      // Initialize web-push with VAPID keys lazily on notify to avoid edge env errors if not used
      const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
      
      if (!vapidPublic || !vapidPrivate) {
         return NextResponse.json({ success: false, error: "VAPID keys not configured" }, { status: 500 });
      }
      
      webpush.setVapidDetails(
        "mailto:admin@bank-rock.com",
        vapidPublic,
        vapidPrivate
      );

      // Payload format: { title: "Hello", body: "World", url: "/" }
      try {
        await webpush.sendNotification(
          subscription,
          JSON.stringify(body.payload)
        );
        return NextResponse.json({ success: true, message: "Notification sent." });
      } catch (err: any) {
        console.error("WebPush Error:", err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
      }
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
