import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Simple JWT verification for Edge runtime
function verifyJWT(token: string, secret: string): boolean {
  try {
    // Split the JWT
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    // Decode the payload
    const payload = JSON.parse(atob(parts[1]));
    
    // Check expiration
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  // Only apply middleware to the main page
  if (request.nextUrl.pathname === '/') {
    const token = request.cookies.get('auth-token')?.value;

    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url));
    }

    try {
      const isValid = verifyJWT(token, process.env.JWT_SECRET!);
      if (!isValid) {
        throw new Error('Invalid token');
      }
      return NextResponse.next();
    } catch (error) {
      // Token is invalid or expired
      const response = NextResponse.redirect(new URL('/login', request.url));
      response.cookies.delete('auth-token');
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/']
} 