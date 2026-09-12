import { NextResponse } from 'next/server';
import { logger } from "@/lib/telemetry";

export const runtime = "edge";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const srcToken = searchParams.get('src');
    const dstToken = searchParams.get('dst');
    const amount = searchParams.get('amount');

    if (!srcToken || !dstToken || !amount) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const apiKey = process.env["1INCH_API_KEY"];
    if (!apiKey) {
      logger.error('1INCH_API_KEY is missing from environment');
      return NextResponse.json({ error: 'Configuration Error' }, { status: 500 });
    }

    const response = await fetch(`https://api.1inch.dev/swap/v6.0/8453/quote?src=${srcToken}&dst=${dstToken}&amount=${amount}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json'
      },
    });

    if (!response.ok) {
      const text = await response.text();
      logger.error('1inch API error', new Error(text));
      return NextResponse.json({ error: 'Upstream API Error' }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    logger.error('Error in 1inch proxy', error as Error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
