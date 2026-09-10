import { prisma } from '@/lib/prisma';
import { createClient as createSupabaseServerClient } from '@/lib/supabase/server';

export interface SessionUser {
    id: string;
    email: string;
    role: string;
    preferredLanguage?: string;
}

type SupabaseUserLike = {
    id: string;
    email?: string | null;
    user_metadata?: Record<string, unknown> | null;
};

function sessionFromSupabaseUser(user: SupabaseUserLike): SessionUser | null {
    const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
    if (!email) return null;

    const metadata = user.user_metadata || {};
    return {
        id: user.id,
        email,
        role: typeof metadata.role === 'string' ? metadata.role : 'user',
        preferredLanguage: typeof metadata.preferredLanguage === 'string'
            ? metadata.preferredLanguage
            : 'zh',
    };
}

// 离线演示账号（DEMO_MODE=true 时启用）：无需 Supabase 认证即可体验
// 全部登录态功能，配合 scripts/inject-demo-data.ts 注入演示学习数据，
// 用于展会演示、评审环境与端到端联调。
export const DEMO_ACCOUNT: SessionUser = {
    id: '00000000-0000-4000-8000-00000000c0de',
    email: 'demo@wordlink.test',
    role: 'user',
    preferredLanguage: 'zh',
};

export async function getSession(): Promise<SessionUser | null> {
    try {
        if (process.env.DEMO_MODE === 'true') {
            await ensureLocalUser(DEMO_ACCOUNT);
            return DEMO_ACCOUNT;
        }

        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.auth.getUser();

        if (error || !data.user) return null;

        const session = sessionFromSupabaseUser(data.user);
        if (!session) return null;

        let profile = await prisma.user.findUnique({
            where: { id: session.id },
            select: { id: true, email: true, role: true, preferredLanguage: true, dailyGoal: true },
        });

        if (!profile) {
            await ensureLocalUser(session);
            profile = await prisma.user.findUnique({
                where: { id: session.id },
                select: { id: true, email: true, role: true, preferredLanguage: true, dailyGoal: true },
            });
        }

        if (!profile) return null;

        return {
            id: profile.id,
            email: profile.email,
            role: profile.role,
            preferredLanguage: profile.preferredLanguage,
        };
    } catch (error) {
        console.error('Supabase session lookup failed:', error);
        return null;
    }
}

export async function ensureLocalUser(session: SessionUser) {
    const normalizedEmail = session.email.trim().toLowerCase();
    if (!session.id || !normalizedEmail) {
        throw new Error('Authenticated Supabase user is missing id or email');
    }

    const existingById = await prisma.user.findUnique({
        where: { id: session.id },
        select: { id: true, email: true, role: true, preferredLanguage: true, dailyGoal: true },
    });

    if (existingById) {
        if (existingById.email !== normalizedEmail) {
            await prisma.user.update({
                where: { id: session.id },
                data: { email: normalizedEmail },
            });
        }

        await prisma.studyPlan.upsert({
            where: { userId: session.id },
            update: {},
            create: {
                id: crypto.randomUUID(),
                userId: session.id,
                dailyGoal: existingById.dailyGoal,
            },
        });
        return;
    }

    const existingByEmail = await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
    });

    if (existingByEmail && existingByEmail.id !== session.id) {
        throw new Error('A legacy profile already uses this email; explicit account mapping is required');
    }

    await prisma.user.create({
        data: {
            id: session.id,
            email: normalizedEmail,
            role: 'user',
            preferredLanguage: session.preferredLanguage || 'zh',
            dailyGoal: 50,
            streakDays: 0,
        },
    });

    await prisma.studyPlan.create({
        data: {
            id: crypto.randomUUID(),
            userId: session.id,
            dailyGoal: 50,
        },
    });
}

export async function logout() {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}
