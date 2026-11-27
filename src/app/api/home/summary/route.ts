import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureLocalUser, getSession } from '@/lib/auth';
import { SERVER_TZ, streakFromDays } from '@/lib/streak';

export const dynamic = 'force-dynamic';

/**
 * GET /api/home/summary —— 主界面 (Mission Control) 聚合数据接口
 *
 * 一次请求返回主界面所需的全部状态：
 * 1. streak          连续学习天数
 * 2. dueWords        今日到期复习词队列（FSRS/UserWordState 调度，前 12 条预览）
 * 3. dueTotal        今日到期复习词真实总数
 * 4. stageCounts     词汇掌握阶段分布 (UNFAMILIAR/FAMILIAR/LEARNED/MASTERED)
 * 5. totalWords      学习中的总词数
 * 6. todayQuiz       今日测验数与正确率
 * 7. recent          最近动态（最近测验/浏览的词）
 */
export async function GET() {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        await ensureLocalUser(session);
        const userId = session.id;

        const now = new Date();
        const dayStart = new Date(now);
        dayStart.setHours(0, 0, 0, 0);
        // timestamp 列为 TIMESTAMP(3)（存 UTC 墙钟），本地日期分桶 = 先按 UTC
        // 还原成 instant 再转服务器本地时区。
        const tz = SERVER_TZ;

        const [dueStates, dueTotal, stageGroups, todayQuiz, recentQuiz, activityDayRows] = await Promise.all([
            // 到期复习队列：按 nextReviewAt 升序，取前 12 个用于卡片预览
            prisma.userWordState.findMany({
                where: { userId, nextReviewAt: { lte: now } },
                orderBy: { nextReviewAt: 'asc' },
                take: 12,
                select: { word: true, stage: true, memoryStrength: true, nextReviewAt: true },
            }),
            // 真实到期词总数（避免被 take: 12 截断）
            prisma.userWordState.count({
                where: { userId, nextReviewAt: { lte: now } },
            }),
            // 阶段分布下推为 GROUP BY，只回传每个 stage 的计数
            prisma.userWordState.groupBy({
                by: ['stage'],
                where: { userId },
                _count: { _all: true },
            }),
            // 今日测验
            prisma.quizRecord.findMany({
                where: { userId, timestamp: { gte: dayStart } },
                select: { score: true },
            }),
            // 最近动态
            prisma.quizRecord.findMany({
                where: { userId },
                orderBy: { timestamp: 'desc' },
                take: 6,
                select: { word: true, score: true, isCorrect: true, timestamp: true },
            }),
            // streak 用的全量去重活跃日期（与学习护照同源同口径，不按 400 天截断）
            prisma.$queryRaw<{ day: string }[]>`
                SELECT to_char("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day
                FROM "LPT_english"."QuizRecord"
                WHERE "userId" = ${userId}
                UNION
                SELECT to_char("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day
                FROM "LPT_english"."WordVisit"
                WHERE "userId" = ${userId}
            `,
        ]);

        // ---- streak 计算（与学习护照同口径）----
        const activeDays = new Set<string>(activityDayRows.map((r) => r.day));
        const streak = streakFromDays(activeDays, now);

        // ---- 阶段分布 ----
        const stageCounts: Record<string, number> = {};
        let totalWords = 0;
        for (const g of stageGroups) {
            stageCounts[g.stage] = g._count._all;
            totalWords += g._count._all;
        }

        const todayCorrect = todayQuiz.filter((r) => r.score > 0).length;

        return NextResponse.json({
            streak,
            totalWords,
            dueTotal,
            dueWords: dueStates.map((s) => ({
                word: s.word,
                stage: s.stage,
                memoryStrength: s.memoryStrength,
            })),
            stageCounts,
            todayQuiz: {
                count: todayQuiz.length,
                correctRate: todayQuiz.length ? Math.round((todayCorrect / todayQuiz.length) * 100) : null,
            },
            recent: recentQuiz.map((r) => ({
                word: r.word,
                isCorrect: r.isCorrect,
                timestamp: r.timestamp,
            })),
        });
    } catch (error) {
        console.error('home summary failed:', error);
        return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
}
