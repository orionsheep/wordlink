import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify, createRemoteJWKSet } from 'jose';

// JWKS endpoint for the centralized auth service
const JWKS_URL = 'https://auth.lifeplayertribe.com/api/v1/.well-known/jwks.json';
const JWKS = createRemoteJWKSet(new URL(JWKS_URL));

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Define paths that are public (no login required)
    const publicPaths = [
        '/login',
        '/api/auth/login',
        '/api/auth/register',
        '/api/auth/logout',
        '/favicon.ico',
        '/icon.png',
    ];

    // Check if the current path is public
    const isPublicPath = publicPaths.some(path => pathname.startsWith(path));

    // Also allow static assets (_next)
    if (pathname.startsWith('/_next') || pathname.startsWith('/static')) {
        return NextResponse.next();
    }

    if (isPublicPath) {
        return NextResponse.next();
    }

    // For API routes (except auth), let them handle their own authentication
    // This prevents redirect loops and allows APIs to return proper 401 responses
    if (pathname.startsWith('/api/')) {
        return NextResponse.next();
    }

    // Check for lpt_session token
    const token = request.cookies.get('lpt_session')?.value;

    if (!token) {
        // Redirect to login page if no token
        const loginUrl = new URL('/login', request.url);
        return NextResponse.redirect(loginUrl);
    }

    try {
        // Verify token using JWKS
        await jwtVerify(token, JWKS, {
            issuer: 'lpt-auth',
            audience: 'lpt-web',
        });

        return NextResponse.next();
    } catch (error) {
        console.error('Token verification failed:', error);
        // Redirect to login page if token is invalid
        const loginUrl = new URL('/login', request.url);
        return NextResponse.redirect(loginUrl);
    }
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes) -> actually we WANT to protect API routes too, except auth ones
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};
