import * as crypto from "crypto";
import { NextResponse } from 'next/server';
import { logger } from "@/lib/telemetry";

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-alchemy-signature");
    const ALCHEMY_WEBHOOK_SECRET = process.env.ALCHEMY_WEBHOOK_SECRET;

    // Validate Alchemy Webhook Signature
    if (ALCHEMY_WEBHOOK_SECRET && signature) {
      const hmac = crypto.createHmac("sha256", ALCHEMY_WEBHOOK_SECRET);
      hmac.update(rawBody);
      if (signature !== hmac.digest("hex")) {
        logger.warn('Invalid Alchemy webhook signature', { action: "ALCHEMY_WEBHOOK_INVALID_SIG" });
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = JSON.parse(rawBody);
    
    // Telemetry logging
    logger.info('Received Alchemy webhook event', { 
      action: "ALCHEMY_WEBHOOK_RECEIVED",
      webhookId: body.webhookId || "unknown",
    });

    // Extract event data
    const { event } = body;
    
    // TODO: Insert into D1
    // const db = getRequestContext().env.DB;
    // await db.prepare('INSERT INTO events (data) VALUES (?)').bind(JSON.stringify(event)).run();

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error processing Alchemy webhook', error as Error, {
      action: "ALCHEMY_WEBHOOK_ERROR"
    });
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
