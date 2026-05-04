import { NextResponse } from 'next/server';
import {
    appendAuthSetCookies,
    AUTH_API_BASE,
    getRequestCookieHeader,
} from '@/lib/auth-proxy';

export async function GET(request: Request) {
    try {
        const authResponse = await fetch(`${AUTH_API_BASE}/auth/me`, {
            method: 'GET',
            headers: {
                'Cookie': getRequestCookieHeader(request),
            },
            cache: 'no-store',
        });
        const data = await authResponse.json().catch(() => ({ user: null }));

        const response = NextResponse.json({
            user: authResponse.ok ? data.user || null : null,
        });
        appendAuthSetCookies(response, authResponse, request);

        return response;
    } catch {
        return NextResponse.json({ user: null });
    }
}
