import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
    const cookieStore = await cookies();
    const token = cookieStore.get('token');

    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
        headers[key] = value;
    });

    return NextResponse.json({
        env: process.env.NODE_ENV,
        timestamp: new Date().toISOString(),
        cookies: {
            token: token ? 'Present' : 'Missing',
            all: cookieStore.getAll().map(c => c.name),
        },
        headers: headers,
    });
}
