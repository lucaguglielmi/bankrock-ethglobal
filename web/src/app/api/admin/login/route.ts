import { NextResponse } from 'next/server';
import { createAdminSession } from '@/lib/auth';

export const runtime = "edge";

export async function POST(req: Request) {
  try {
    const { password } = await req.json() as any;
    const correctPassword = process.env.ADMIN_PASSWORD;
    const userAgent = req.headers.get('user-agent') || 'unknown';

    if (correctPassword && password === correctPassword) {
      await createAdminSession(userAgent);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  } catch (error) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
