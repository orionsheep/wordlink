import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => null);
        const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
        const password = typeof body?.password === 'string' ? body.password : '';

        if (!email || !password) {
            return NextResponse.json({ error: 'Missing email or password' }, { status: 400 });
        }

        const supabase = await createClient();
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error || !data.user) {
            return NextResponse.json(
                { error: error?.message || 'Login failed' },
                { status: 401 },
            );
        }

        const user = await getSession();
        if (!user) {
            return NextResponse.json({ error: 'Authenticated profile is unavailable' }, { status: 502 });
        }

        return NextResponse.json({
            success: true,
            message: 'Login successful',
            user,
        });
    } catch (error) {
        console.error('Supabase login error:', error);
        return NextResponse.json({ error: 'Login failed' }, { status: 500 });
    }
}
