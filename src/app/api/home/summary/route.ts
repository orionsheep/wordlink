import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureLocalUser, getSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/home/summary —— 主界面 (Mission Control) 聚合数据接口
 *
 * 一次请求返回主界面所需的全部状态：
 * 1. streak          连续学习天数
 * 2. dueWords        今日到期复习词队列（FSRS/UserWordState 调度）
 * 3. stageCounts     词汇掌握阶段分布 (UNFAMILIAR/FAMILIAR/LEARNED/MASTERED)
 * 4. totalWords      学习中的总词数
 * 5. todayQuiz       今日测验数与正确率
 * 6. recent          最近动态（最近测验/浏览的词）
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

        const [dueStates, allStates, todayQuiz, recentQuiz] = await Promise.all([
            // 到期复习队列：按 nextReviewAt 升序，取前 12 个
            prisma.userWordState.findMany({
                where: { userId, nextReviewAt: { lte: now } },
                orderBy: { nextReviewAt: 'asc' },
                take: 12,
                select: { word: true, stage: true, memoryStrength: true, nextReviewAt: true },
            }),
            // 全量阶段统计（只取 stage 字段，量小）
            prisma.userWordState.findMany({
                where: { userId },
                select: { stage: true },
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
        ]);

        // ---- streak 计算（与 /api/user/checkin 同口径）----
        const toDateStr = (d: Date) => {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            return `${y}-${m}-${String(d.getDate()).padStart(2, '0')}`;
        };
        const [quizDates, visitDates] = await Promise.all([
            prisma.quizRecord.findMany({
                where: { userId, timestamp: { gte: new Date(now.getFullYear(), 0, 1) } },
                select: { timestamp: true },
            }),
            prisma.wordVisit.findMany({
                where: { userId, timestamp: { gte: new Date(now.getFullYear(), 0, 1) } },
                select: { timestamp: true },
            }),
        ]);
        const activeDays = new Set<string>([
            ...quizDates.map((r) => toDateStr(new Date(r.timestamp))),
            ...visitDates.map((r) => toDateStr(new Date(r.timestamp))),
        ]);
        let streak = 0;
        const cursor = new Date(now);
        while (activeDays.has(toDateStr(cursor))) {
            streak += 1;
            cursor.setDate(cursor.getDate() - 1);
        }

        // ---- 阶段分布 ----
        const stageCounts: Record<string, number> = {};
        for (const s of allStates) {
            stageCounts[s.stage] = (stageCounts[s.stage] || 0) + 1;
        }

        const todayCorrect = todayQuiz.filter((r) => r.score > 0).length;

        return NextResponse.json({
            streak,
            totalWords: allStates.length,
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
