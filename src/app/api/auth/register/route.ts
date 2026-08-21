import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensureLocalUser, getSession } from '@/lib/auth';

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => null);
        const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
        const password = typeof body?.password === 'string' ? body.password : '';
        const keyCode = typeof body?.keyCode === 'string' ? body.keyCode.trim() : '';
        const expectedKey = process.env.SUPABASE_REGISTRATION_KEY?.trim();

        if (!email || !password) {
            return NextResponse.json({ error: 'Missing email or password' }, { status: 400 });
        }

        if (expectedKey && keyCode !== expectedKey) {
            return NextResponse.json({ error: 'Invalid registration key' }, { status: 403 });
        }

        if (!expectedKey && process.env.NODE_ENV === 'production') {
            return NextResponse.json(
                { error: 'Registration is not configured on this server' },
                { status: 503 },
            );
        }

        const nickname = email.split('@')[0] || 'WordLink learner';
        const supabase = await createClient();
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { nickname, preferredLanguage: 'zh' },
            },
        });

        if (error || !data.user) {
            return NextResponse.json(
                { error: error?.message || 'Registration failed' },
                { status: 400 },
            );
        }

        const session = await getSession();
        if (!session) {
            await ensureLocalUser({
                id: data.user.id,
                email,
                role: 'user',
                preferredLanguage: 'zh',
            });
        }

        const user = (await getSession()) || {
            id: data.user.id,
            email,
            role: 'user',
            preferredLanguage: 'zh',
        };

        return NextResponse.json({
            success: true,
            message: data.session ? 'Registration successful' : 'Registration successful; email confirmation may be required',
            needsEmailConfirmation: !data.session,
            user,
        });
    } catch (error) {
        console.error('Supabase registration error:', error);
        const message = error instanceof Error ? error.message : 'Registration failed';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
