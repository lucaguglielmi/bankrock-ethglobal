import { NextResponse } from 'next/server';
import { Resend } from 'resend';
import { logger } from "@/lib/telemetry";

export const runtime = "edge";

export async function POST(req: Request) {
  try {
    const { message, source } = await req.json();

    if (source !== 'gelato_keeper') {
      return NextResponse.json({ error: 'Unauthorized source' }, { status: 401 });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    const alertEmail = process.env.ALERT_EMAIL_ADDRESS || 'security@bankrock.xyz';

    if (!resendApiKey) {
      logger.warn('RESEND_API_KEY not configured. Alert would have been: ' + message);
      // Fail gracefully if sandbox isn't set up yet
      return NextResponse.json({ success: true, mocked: true });
    }

    const resend = new Resend(resendApiKey);

    const data = await resend.emails.send({
      from: 'alerts@resend.dev', // Resend sandbox default
      to: alertEmail,
      subject: '⚠️ Bank Rock Alert: Gelato Automation Issue',
      html: `
        <h2>Gelato Web3 Function Alert</h2>
        <p>An autonomous rebalance operation failed or encountered an error.</p>
        <p><strong>Details:</strong> ${message}</p>
        <p><small>This is an automated alert from Bank Rock Sentinel.</small></p>
      `,
    });

    logger.info('Gelato Alert Email Sent', { data });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    logger.error('Error sending Gelato alert email', error as Error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
