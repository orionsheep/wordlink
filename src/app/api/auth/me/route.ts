import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function GET() {
    try {
        const user = await getSession();
        return NextResponse.json({ user: user || null });
    } catch {
        return NextResponse.json({ user: null });
    }
}
