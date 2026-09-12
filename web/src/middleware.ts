import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const rateLimitMap = new Map<string, { count: number, timestamp: number }>();
const RATE_LIMIT_WINDOW_MS = 60000;
const MAX_REQUESTS_PER_WINDOW = 100;

export function middleware(request: NextRequest) {
  const url = request.nextUrl.pathname;
  
  if (url.startsWith('/api/rocks')) {
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const now = Date.now();
    const windowData = rateLimitMap.get(ip);
    
    if (windowData) {
      if (now - windowData.timestamp < RATE_LIMIT_WINDOW_MS) {
        if (windowData.count >= MAX_REQUESTS_PER_WINDOW) {
          return new NextResponse(JSON.stringify({ error: 'Too Many Requests' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        windowData.count++;
      } else {
        rateLimitMap.set(ip, { count: 1, timestamp: now });
      }
    } else {
      rateLimitMap.set(ip, { count: 1, timestamp: now });
    }
  }

  const response = NextResponse.next();
  
  if (url.startsWith('/api/')) {
    response.headers.set('Access-Control-Allow-Origin', process.env.NEXT_PUBLIC_APP_URL || 'https://bankrock.xyz');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-alchemy-signature');
  }
  
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
