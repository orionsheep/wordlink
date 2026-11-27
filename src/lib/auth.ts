import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { LRUCache } from 'lru-cache';
import { prisma } from '@/lib/prisma';
import { createClient as createSupabaseServerClient } from '@/lib/supabase/server';
import { extractAccessToken, getJwtExpiry } from '@/lib/supabase/token';

type CachedSession = { user: SessionUser | null; expiresAtMs?: number };

const POSITIVE_SESSION_TTL_MS = 1000 * 30;

// getUser() costs a Supabase network round-trip on every call. Cache the
// resolved session per access token so a page load with several API calls
// (or rapid navigations) only pays for one remote verification. Positive
// results live at most 30s and never past the JWT's exp; negative results 5s.
const sessionCache = new LRUCache<string, CachedSession>({
    max: 5000,
    ttl: POSITIVE_SESSION_TTL_MS,
});

// ensureLocalUser only needs to run once in a while per user — after the
// profile + studyPlan exist it degenerates to a redundant read plus a
// no-op upsert on every request.
const ensuredUsers = new LRUCache<string, true>({
    max: 10000,
    ttl: 1000 * 60 * 10,
});

async function readAuthToken(): Promise<{ cacheKey: string; expMs: number | null } | null> {
    try {
        const cookieStore = await cookies();
        const token = extractAccessToken(cookieStore.getAll());
        if (!token) return null;
        const exp = getJwtExpiry(token);
        return {
            cacheKey: createHash('sha256').update(token).digest('hex'),
            expMs: exp !== null ? exp * 1000 : null,
        };
    } catch {
        return null;
    }
}

export interface SessionUser {
    id: string;
    email: string;
    role: string;
    preferredLanguage?: string;
    plan: string;
    planExpiresAt: Date | null;
}

/** Pro 判定：plan==='pro' 且未过期；planExpiresAt 为 null 视为永久（演示账号） */
export function isPro(user: Pick<SessionUser, 'plan' | 'planExpiresAt'> | null | undefined): boolean {
    return !!user && user.plan === 'pro' && (user.planExpiresAt == null || user.planExpiresAt > new Date());
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
        plan: 'free',
        planExpiresAt: null,
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
    // 演示账号直接给 Pro 且永不过期，展会/评审环境不受付费墙影响
    plan: 'pro',
    planExpiresAt: null,
};

let demoSession: SessionUser | null = null;

// 和 inject-demo-data.ts 一样按邮箱复用已有档案：demo 邮箱在 Supabase 注册过时，
// 演示数据挂在那个账号的 id 上，用固定 id 会撞邮箱唯一约束、整站 401。
async function demoAccount(): Promise<SessionUser> {
    if (!demoSession) {
        const existing = await prisma.user.findUnique({
            where: { email: DEMO_ACCOUNT.email },
            select: { id: true },
        });
        demoSession = existing ? { ...DEMO_ACCOUNT, id: existing.id } : DEMO_ACCOUNT;
    }
    await ensureLocalUser(demoSession);
    return demoSession;
}

export async function getSession(): Promise<SessionUser | null> {
    try {
        if (process.env.DEMO_MODE === 'true') {
            return await demoAccount();
        }

        const authToken = await readAuthToken();
        const cacheKey = authToken?.cacheKey ?? null;
        if (cacheKey) {
            const cached = sessionCache.get(cacheKey);
            if (cached !== undefined) {
                if (cached.user === null) return null;
                if (cached.expiresAtMs === undefined || cached.expiresAtMs > Date.now()) {
                    return cached.user;
                }
                sessionCache.delete(cacheKey);
            }
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
            select: { id: true, email: true, role: true, preferredLanguage: true, plan: true, planExpiresAt: true, dailyGoal: true },
        });

        if (!profile) {
            await ensureLocalUser(session);
            profile = await prisma.user.findUnique({
                where: { id: session.id },
                select: { id: true, email: true, role: true, preferredLanguage: true, plan: true, planExpiresAt: true, dailyGoal: true },
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
            plan: profile.plan,
            planExpiresAt: profile.planExpiresAt,
        };

        if (cacheKey) {
            const now = Date.now();
            const remainingMs = authToken?.expMs != null ? authToken.expMs - now : POSITIVE_SESSION_TTL_MS;
            if (remainingMs > 0) {
                const ttl = Math.min(POSITIVE_SESSION_TTL_MS, remainingMs);
                sessionCache.set(
                    cacheKey,
                    { user: result, expiresAtMs: authToken?.expMs ?? now + ttl },
                    { ttl },
                );
            }
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

/** Drop cached session/profile bookkeeping for a user (after deletion, or a plan change such as a paid upgrade). */
export function invalidateAuthCaches(userId: string) {
    for (const key of ensuredUsers.keys()) {
        if (key.startsWith(`${userId}:`)) ensuredUsers.delete(key);
    }
    // 会话按 token 缓存 30 秒且带着 plan：付款升级后不清掉，这段时间里仍按免费版限额
    const staleSessions: string[] = [];
    for (const [key, value] of sessionCache.entries()) {
        if (value.user?.id === userId) staleSessions.push(key);
    }
    for (const key of staleSessions) sessionCache.delete(key);
    if (demoSession?.id === userId) demoSession = null;
}

export async function logout() {
    const authToken = await readAuthToken();
    if (authToken) {
        sessionCache.delete(authToken.cacheKey);
    }
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}
