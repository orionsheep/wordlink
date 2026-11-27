import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensureLocalUser, getSession } from '@/lib/auth';
import { clientIp, rateLimit, tooManyRequests } from '@/lib/rate-limit';

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => null);
        const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
        const password = typeof body?.password === 'string' ? body.password : '';
        const preferredLanguage = body?.preferredLanguage === 'en' ? 'en' : 'zh';

        if (!email || !password) {
            return NextResponse.json({ error: 'Missing email or password' }, { status: 400 });
        }

        // 每次注册都会发一封确认邮件：按 IP 限流，防止批量注册和刷邮件额度
        const gate = rateLimit(`register-ip:${clientIp(request)}`, 10, 10 * 60_000);
        if (!gate.ok) return tooManyRequests(gate.retryAfterSec);

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

        // 仅在注册立即产出有效会话（未开启邮箱确认）时同步建本地档案；
        // 开启邮箱确认时，对已存在邮箱 Supabase 会返回带随机伪 ID 的伪装 user（identities 为空），
        // 此时直接调 ensureLocalUser 会撞邮箱唯一约束报 500 从而暴露已注册邮箱。
        // 正常待确认用户会在点击邮件链接进入 /auth/callback 或首次登录时自动创建本地档案。
        let user: {
            id: string;
            email: string;
            role: string;
            preferredLanguage: string;
            plan: string;
            planExpiresAt: Date | null;
        } | null = null;

        if (data.session) {
            await ensureLocalUser({
                id: data.user.id,
                email,
                role: 'user',
                preferredLanguage,
                plan: 'free',
                planExpiresAt: null,
            });
            const resolved = await getSession();
            user = resolved
                ? {
                    id: resolved.id,
                    email: resolved.email,
                    role: resolved.role,
                    preferredLanguage: resolved.preferredLanguage || preferredLanguage,
                    plan: resolved.plan,
                    planExpiresAt: resolved.planExpiresAt,
                }
                : {
                    id: data.user.id,
                    email,
                    role: 'user',
                    preferredLanguage,
                    plan: 'free',
                    planExpiresAt: null,
                };
        }

        return NextResponse.json({
            success: true,
            message: data.session
                ? 'Registration successful'
                : 'Registration successful. A confirmation email has been sent to your inbox.',
            needsEmailConfirmation: !data.session,
            ...(user ? { user } : {}),
        });
    } catch (error) {
        console.error('Supabase registration error:', error);
        return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
    }
}
