import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { LRUCache } from 'lru-cache';
import { prisma } from '@/lib/prisma';
import { createClient as createSupabaseServerClient } from '@/lib/supabase/server';
import { extractAccessToken } from '@/lib/supabase/token';

type CachedSession = { user: SessionUser | null };

// getUser() costs a Supabase network round-trip on every call. Cache the
// resolved session per access token so a page load with several API calls
// (or rapid navigations) only pays for one remote verification. Positive
// results live 30s; negative results 5s. Token refresh changes the cookie
// value, which naturally produces a new cache key.
const sessionCache = new LRUCache<string, CachedSession>({
    max: 5000,
    ttl: 1000 * 30,
});

// ensureLocalUser only needs to run once in a while per user — after the
// profile + studyPlan exist it degenerates to a redundant read plus a
// no-op upsert on every request.
const ensuredUsers = new LRUCache<string, true>({
    max: 10000,
    ttl: 1000 * 60 * 10,
});

async function authTokenCacheKey(): Promise<string | null> {
    try {
        const cookieStore = await cookies();
        const token = extractAccessToken(cookieStore.getAll());
        if (!token) return null;
        return createHash('sha256').update(token).digest('hex');
    } catch {
        return null;
    }
}

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

        const cacheKey = await authTokenCacheKey();
        if (cacheKey) {
            const cached = sessionCache.get(cacheKey);
            if (cached !== undefined) return cached.user;
        }

        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.auth.getUser();

        if (error || !data.user) {
            if (cacheKey) {
                sessionCache.set(cacheKey, { user: null }, { ttl: 1000 * 5 });
            }
            return null;
        }

        const session = sessionFromSupabaseUser(data.user);
        if (!session) {
            if (cacheKey) {
                sessionCache.set(cacheKey, { user: null }, { ttl: 1000 * 5 });
            }
            return null;
        }

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

        if (!profile) {
            if (cacheKey) {
                sessionCache.set(cacheKey, { user: null }, { ttl: 1000 * 5 });
            }
            return null;
        }

        const result: SessionUser = {
            id: profile.id,
            email: profile.email,
            role: profile.role,
            preferredLanguage: profile.preferredLanguage,
        };

        if (cacheKey) {
            sessionCache.set(cacheKey, { user: result });
        }

        return result;
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

    const ensuredKey = `${session.id}:${normalizedEmail}`;
    if (ensuredUsers.has(ensuredKey)) {
        return;
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
        ensuredUsers.set(ensuredKey, true);
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

    ensuredUsers.set(ensuredKey, true);
}

/** Drop cached session/profile bookkeeping for a user (e.g. after deletion). */
export function invalidateAuthCaches(userId: string) {
    for (const key of ensuredUsers.keys()) {
        if (key.startsWith(`${userId}:`)) ensuredUsers.delete(key);
    }
}

export async function logout() {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}
