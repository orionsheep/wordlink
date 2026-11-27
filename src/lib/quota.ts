import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export type QuotaKind = 'aiChat' | 'ambientGenerate' | 'passport';

function envLimit(name: string, fallback: number): number {
    const raw = Number(process.env[name]);
    return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

// 免费用户每日额度，Pro 用户不受限
export const FREE_DAILY_LIMITS: Record<QuotaKind, number> = {
    aiChat: envLimit('AI_CHAT_FREE_DAILY_LIMIT', 20),
    ambientGenerate: envLimit('AMBIENT_FREE_DAILY_LIMIT', 3),
    passport: envLimit('PASSPORT_FREE_DAILY_LIMIT', 3),
};

function startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

export interface DailyQuota {
    allowed: boolean;
    used: number;
    limit: number;
}

export type QuotaReservation =
    | { allowed: true; usageLogId: string; used: number; limit: number }
    | { allowed: false; used: number; limit: number };

// 两种额度都数 UsageLog：由各自的路由在上游模型接受请求之前原子预占。
// aiChat 不能直接数 chat_messages——用户删掉会话，消息跟着级联删除，额度就被「退」回来了。
export async function checkDailyQuota(userId: string, kind: QuotaKind): Promise<DailyQuota> {
    const limit = FREE_DAILY_LIMITS[kind];
    const used = await prisma.usageLog.count({
        where: { userId, kind, createdAt: { gte: startOfToday() } },
    });
    return { allowed: used < limit, used, limit };
}

/**
 * 原子检查并预占 1 次每日免费额度：事务内按 (userId, kind) 获取 PostgreSQL 咨询锁，
 * 消除并发请求同时通过 count 检查突破每日限额的 TOCTOU 竞态。
 * 若上游调用明确未计费失败，调用方应通过 releaseQuotaReservation 回滚本次预占。
 */
export async function reserveDailyQuota(userId: string, kind: QuotaKind): Promise<QuotaReservation> {
    const limit = FREE_DAILY_LIMITS[kind];
    const dayStart = startOfToday();
    const lockKey = `quota:${userId}:${kind}`;

    return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
        const used = await tx.usageLog.count({
            where: { userId, kind, createdAt: { gte: dayStart } },
        });
        if (used >= limit) {
            return { allowed: false as const, used, limit };
        }
        const row = await tx.usageLog.create({
            data: { userId, kind },
            select: { id: true },
        });
        return { allowed: true as const, usageLogId: row.id, used: used + 1, limit };
    });
}

export async function releaseQuotaReservation(usageLogId: string | null | undefined): Promise<void> {
    if (!usageLogId) return;
    await prisma.usageLog.deleteMany({ where: { id: usageLogId } }).catch(() => {});
}

export async function recordUsage(userId: string, kind: QuotaKind): Promise<void> {
    await prisma.usageLog.create({ data: { userId, kind } });
}

export function quotaExceededResponse(quota: DailyQuota, kind: QuotaKind): NextResponse {
    return NextResponse.json(
        { code: 'QUOTA_EXCEEDED', kind, used: quota.used, limit: quota.limit },
        { status: 402 },
    );
}
