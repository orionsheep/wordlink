import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { clientIp, rateLimit, tooManyRequests } from '@/lib/rate-limit';

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => null);
        const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';

        if (!email) {
            return NextResponse.json({ error: 'Missing email address' }, { status: 400 });
        }

        // 与找回密码共用发信额度：先查 IP 再查邮箱，防止随机邮箱撑爆桶空间
        const perIp = rateLimit(`mail-ip:${clientIp(request)}`, 5, 10 * 60_000);
        if (!perIp.ok) return tooManyRequests(perIp.retryAfterSec);
        const perEmail = rateLimit(`mail-email:${email}`, 3, 10 * 60_000);
        if (!perEmail.ok) return tooManyRequests(perEmail.retryAfterSec);

        const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
        const supabase = await createClient();
        const { error } = await supabase.auth.resend({
            type: 'signup',
            email,
            options: {
                emailRedirectTo: `${origin}/auth/callback?next=/home`,
            },
        });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        return NextResponse.json({
            success: true,
            message: 'Verification email has been resent.',
        });
    } catch (error) {
        console.error('Resend confirmation error:', error);
        const message = error instanceof Error ? error.message : 'Failed to resend email';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
