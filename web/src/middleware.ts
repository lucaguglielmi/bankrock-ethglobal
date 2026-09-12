import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const rateLimitMap = new Map<string, { count: number, timestamp: number }>();
const RATE_LIMIT_WINDOW_MS = 60000;
const MAX_REQUESTS_PER_WINDOW = 100;

const SECRET_KEY = new TextEncoder().encode(
  process.env.ADMIN_JWT_SECRET || 'fallback-secret-do-not-use-in-prod'
);

async function hashUserAgent(userAgent: string): Promise<string> {
  const data = new TextEncoder().encode(userAgent || 'unknown');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function middleware(request: NextRequest) {
  const url = request.nextUrl.pathname;
  
  // Protect /admin routes (except /admin/login)
  if (url.startsWith('/admin') && url !== '/admin/login') {
    const token = request.cookies.get('bankrock_sentinel_session')?.value;
    
    if (!token) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
    
    try {
      const { payload } = await jwtVerify(token, SECRET_KEY);
      if (payload.role !== 'admin') {
        throw new Error('Invalid role');
      }

      // User-Agent Fingerprinting verification against session hijacking
      const currentUserAgent = request.headers.get('user-agent') || 'unknown';
      const currentUah = await hashUserAgent(currentUserAgent);
      
      if (payload.uah && payload.uah !== currentUah) {
        console.warn(`[Security] Session hijacked or User-Agent changed! Expected UAH: ${payload.uah}, got: ${currentUah}`);
        throw new Error('User-Agent mismatch');
      }

    } catch (err) {
      // Token is invalid, expired, or failed fingerprinting
      const response = NextResponse.redirect(new URL('/admin/login', request.url));
      response.cookies.delete('bankrock_sentinel_session');
      return response;
    }
  }
  
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
  matcher: ['/api/:path*', '/admin/:path*'],
};
