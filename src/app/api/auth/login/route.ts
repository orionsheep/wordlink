import { NextResponse } from 'next/server';
import {
    appendAuthSetCookies,
    AUTH_API_BASE,
    getRequestCookieHeader,
} from '@/lib/auth-proxy';

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => null);
        const email = typeof body?.email === 'string' ? body.email.trim() : '';
        const password = typeof body?.password === 'string' ? body.password : '';

        if (!email || !password) {
            return NextResponse.json({ error: 'Missing email or password' }, { status: 400 });
        }

        // Proxy login to Auth API and forward resulting cookies
        const authResponse = await fetch(`${AUTH_API_BASE}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': getRequestCookieHeader(request),
            },
            body: JSON.stringify({ email, password }),
            cache: 'no-store',
        });

        const authData = await authResponse.json().catch(() => ({}));

        if (!authResponse.ok) {
            const errorResponse = NextResponse.json(
                { error: authData.error || authData.message || 'Login failed' },
                { status: authResponse.status || 401 }
            );
            appendAuthSetCookies(errorResponse, authResponse, request);
            return errorResponse;
        }

        const response = NextResponse.json({
            success: true,
            message: authData.message || 'Login successful',
            user: authData.user,
        });

        appendAuthSetCookies(response, authResponse, request);
        return response;
    } catch (error) {
        console.error('Login error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Login failed';
        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
