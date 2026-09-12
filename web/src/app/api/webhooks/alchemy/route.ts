import { NextResponse } from 'next/server';
import { logger } from "@/lib/telemetry";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Telemetry logging
    logger.info('Received Alchemy webhook event', { 
      action: "ALCHEMY_WEBHOOK_RECEIVED",
      body 
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
