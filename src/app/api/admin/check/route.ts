import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function GET() {
    const session = await getSession();

    if (session && (session.role === 'admin' || session.role === 'super_admin')) {
        return NextResponse.json({ authenticated: true });
    }

    return NextResponse.json({ authenticated: false }, { status: 401 });
}
