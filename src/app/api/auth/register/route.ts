import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
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
        const keyCode = typeof body?.keyCode === 'string' ? body.keyCode.trim() : '';

        if (!email || !password || !keyCode) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Proxy register to Auth API and forward resulting cookies
        const authResponse = await fetch(`${AUTH_API_BASE}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Cookie': getRequestCookieHeader(request),
            },
            body: JSON.stringify({ email, password, keyCode }),
            cache: 'no-store',
        });
        const authData = await authResponse.json().catch(() => ({}));

        if (!authResponse.ok) {
            const errorResponse = NextResponse.json(
                { error: authData.error || authData.message || 'Registration failed' },
                { status: authResponse.status || 400 }
            );
            appendAuthSetCookies(errorResponse, authResponse, request);
            return errorResponse;
        }

        if (!authData.user?.id || !authData.user?.email || !authData.user?.role) {
            return NextResponse.json({ error: 'Invalid registration response' }, { status: 502 });
        }

        // Ensure local user record exists with Auth API user.id
        await prisma.user.upsert({
            where: { id: authData.user.id },
            update: {
                email: authData.user.email,
                role: authData.user.role,
            },
            create: {
                id: authData.user.id,
                email: authData.user.email,
                role: authData.user.role,
                preferredLanguage: 'zh',
            },
        });

        const response = NextResponse.json({
            success: true,
            message: authData.message || 'Registration successful',
            user: authData.user,
        });
        appendAuthSetCookies(response, authResponse, request);
        return response;
    } catch (error) {
        console.error('Registration error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Registration failed';

        // Determine appropriate status code
        let statusCode = 500;
        if (errorMessage.includes('already exists') || errorMessage.includes('already in use')) {
            statusCode = 409;
        } else if (errorMessage.includes('Invalid') || errorMessage.includes('invalid')) {
            statusCode = 400;
        }

        return NextResponse.json({ error: errorMessage }, { status: statusCode });
    }
}
