import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensureLocalUser, getSession } from '@/lib/auth';

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => null);
        const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
        const password = typeof body?.password === 'string' ? body.password : '';
        const preferredLanguage = typeof body?.preferredLanguage === 'string' ? body.preferredLanguage : 'zh';

        if (!email || !password) {
            return NextResponse.json({ error: 'Missing email or password' }, { status: 400 });
        }

        const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
        const nickname = email.split('@')[0] || 'Lexiverse learner';
        const supabase = await createClient();
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { nickname, preferredLanguage },
                // New accounts should enter the authenticated workspace after
                // confirming their email, rather than landing on the marketing
                // page again.
                emailRedirectTo: `${origin}/auth/callback?next=/home`,
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
                preferredLanguage,
            });
        }

        const user = (await getSession()) || {
            id: data.user.id,
            email,
            role: 'user',
            preferredLanguage,
        };

        return NextResponse.json({
            success: true,
            message: data.session
                ? 'Registration successful'
                : 'Registration successful. A confirmation email has been sent to your inbox.',
            needsEmailConfirmation: !data.session,
            user,
        });
    } catch (error) {
        console.error('Supabase registration error:', error);
        const message = error instanceof Error ? error.message : 'Registration failed';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
