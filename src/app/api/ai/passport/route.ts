import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { getSession, ensureLocalUser, isPro } from '@/lib/auth';
import { SERVER_TZ, streakFromDays } from '@/lib/streak';
import { rateLimit, tooManyRequests } from '@/lib/rate-limit';
import { releaseQuotaReservation, reserveDailyQuota } from '@/lib/quota';
import {
    loadPrompt,
    completeDeepseek,
    readAgentCache,
    writeAgentCache,
    userAgentCacheKey,
} from '@/lib/ai/gateway';

/** 同 cacheKey 并发去重，避免多个标签页同时打开护照重复触发上游模型调用 */
const inflightNarratives = new Map<string, Promise<string>>();

/**
 * XAI Learning Passport Agent  (P0-2)
 * Aggregates the user's full learning telemetry into an explainable
 * CEFR-oriented assessment: six-dimension radar + AI narrative.
 * GET /api/ai/passport
 */

export interface PassportMetrics {
    uniqueWordsVisited: number;
    uniqueWordsTested: number;
    totalTests: number;
    accuracy: number;            // 0-100
    avgMemoryStrength: number;   // 0-10
    masteredWords: number;
    dueForReview: number;
    checkinDays: number;
    streakDays: number;
    totalDwellMinutes: number;
    audioPlays: number;
}

export interface PassportPayload {
    metrics: PassportMetrics;
    radar: { dimension: string; label: string; labelZh: string; score: number }[];
    cefr: string;
    narrative: string;
    generatedAt: string;
}

function estimateCefr(metrics: PassportMetrics): string {
    // Transparent, explainable heuristic calibrated to IN-APP tested vocabulary
    // (not total lifetime vocabulary — we can only measure what was tested here).
    const m = metrics.uniqueWordsTested;
    const acc = metrics.accuracy;
    if (m >= 800 && acc >= 85) return 'C1';
    if (m >= 450 && acc >= 80) return 'B2';
    if (m >= 220 && acc >= 75) return 'B1';
    if (m >= 100) return 'A2+';
    if (m >= 40) return 'A2';
    return 'A1';
}

export async function GET() {
    const session = await getSession();
    if (!session) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const gate = rateLimit(`passport:${session.id}`, 10, 60_000);
    if (!gate.ok) return tooManyRequests(gate.retryAfterSec);

    await ensureLocalUser(session);
    const userId = session.id;

    // AI 叙事语言跟随界面语言（NEXT_LOCALE cookie），session 偏好兜底
    const cookieLang = (await cookies()).get('NEXT_LOCALE')?.value;
    const lang = cookieLang === 'zh' || cookieLang === 'en'
        ? cookieLang
        : (session.preferredLanguage === 'zh' ? 'zh' : 'en');

    try {
        const now = new Date();
        // Aggregates pushed down to Postgres — only scalar counters and the
        // ≤(days active) date strings cross the wire instead of full history.
        const [visitAggRows, quizAggRows, stateAggRows, activityDayRows] = await Promise.all([
            prisma.$queryRaw<{ uniqueWords: number; totalVisits: number; dwellMs: number; audioPlays: number }[]>`
                SELECT
                    COUNT(DISTINCT lower("word"))::int      AS "uniqueWords",
                    COUNT(*)::int                           AS "totalVisits",
                    COALESCE(SUM("dwellTimeMs"), 0)::float8 AS "dwellMs",
                    COALESCE(SUM("audioPlays"), 0)::float8  AS "audioPlays"
                FROM "LPT_english"."WordVisit"
                WHERE "userId" = ${userId}
            `,
            prisma.$queryRaw<{ uniqueWords: number; totalTests: number; correct: number; graded: number }[]>`
                SELECT
                    COUNT(DISTINCT lower("word"))::int                        AS "uniqueWords",
                    COUNT(*)::int                                             AS "totalTests",
                    COUNT(*) FILTER (WHERE "isCorrect" IS TRUE)::int          AS "correct",
                    COUNT(*) FILTER (WHERE "isCorrect" IS NOT NULL)::int      AS "graded"
                FROM "LPT_english"."QuizRecord"
                WHERE "userId" = ${userId}
            `,
            prisma.$queryRaw<{ total: number; avgStrength: number; mastered: number; due: number }[]>`
                SELECT
                    COUNT(*)::int                                                  AS "total",
                    COALESCE(AVG("memoryStrength"), 0)::float8                     AS "avgStrength",
                    COUNT(*) FILTER (WHERE "stage" IN ('MASTERED', 'LEARNED'))::int AS "mastered",
                    COUNT(*) FILTER (WHERE "nextReviewAt" <= ${now})::int          AS "due"
                FROM "LPT_english"."UserWordState"
                WHERE "userId" = ${userId}
            `,
            // timestamp columns are TIMESTAMP(3) holding UTC wall time: bucket
            // into server-local days, the same days home and check-in count.
            prisma.$queryRaw<{ day: string }[]>`
                SELECT to_char("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE ${SERVER_TZ}, 'YYYY-MM-DD') AS day
                FROM "LPT_english"."QuizRecord" WHERE "userId" = ${userId}
                UNION
                SELECT to_char("timestamp" AT TIME ZONE 'UTC' AT TIME ZONE ${SERVER_TZ}, 'YYYY-MM-DD')
                FROM "LPT_english"."WordVisit" WHERE "userId" = ${userId}
            `,
        ]);

        const visitAgg = visitAggRows[0] ?? { uniqueWords: 0, totalVisits: 0, dwellMs: 0, audioPlays: 0 };
        const quizAgg = quizAggRows[0] ?? { uniqueWords: 0, totalTests: 0, correct: 0, graded: 0 };
        const stateAgg = stateAggRows[0] ?? { total: 0, avgStrength: 0, mastered: 0, due: 0 };

        // ---- New-user guard: never issue an "A1 certificate" to empty data --
        if (quizAgg.totalTests === 0 && visitAgg.totalVisits === 0) {
            return NextResponse.json({ empty: true });
        }

        // Streak derived from real activity dates (same source of truth as the
        // dashboard check-in calendar: any quiz or visit counts as a day).
        // FIX: previously read CheckinLog — a table nothing in the codebase writes.
        const activityDays = new Set<string>(activityDayRows.map((r) => r.day));
        const metrics: PassportMetrics = {
            uniqueWordsVisited: visitAgg.uniqueWords,
            uniqueWordsTested: quizAgg.uniqueWords,
            totalTests: quizAgg.totalTests,
            accuracy: quizAgg.graded ? Math.round((quizAgg.correct / quizAgg.graded) * 100) : 0,
            avgMemoryStrength: stateAgg.total ? Math.round(stateAgg.avgStrength * 10) / 10 : 0,
            masteredWords: stateAgg.mastered,
            dueForReview: stateAgg.due,
            checkinDays: activityDays.size,
            streakDays: streakFromDays(activityDays, now),
            totalDwellMinutes: Math.round(visitAgg.dwellMs / 60000),
            audioPlays: visitAgg.audioPlays,
        };

        // ---- Six explainable dimensions (0-100), each with its formula ------
        const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
        const radar = [
            { dimension: 'vocabulary', label: 'Vocabulary Size', labelZh: '词汇规模', score: clamp((metrics.uniqueWordsTested / 2000) * 100) },
            { dimension: 'accuracy', label: 'Spelling Accuracy', labelZh: '拼写精准', score: clamp(metrics.accuracy) },
            { dimension: 'listening', label: 'Listening Exposure', labelZh: '听辨暴露', score: clamp((metrics.audioPlays / 300) * 100) },
            { dimension: 'stability', label: 'Memory Stability', labelZh: '记忆稳定', score: clamp((metrics.avgMemoryStrength / 8) * 100) },
            { dimension: 'consistency', label: 'Learning Consistency', labelZh: '学习坚持', score: clamp((metrics.streakDays / 30) * 100) },
            { dimension: 'engagement', label: 'Deep Engagement', labelZh: '深度投入', score: clamp((metrics.totalDwellMinutes / 600) * 100) },
        ];
        const cefr = estimateCefr(metrics);

        // ---- AI narrative (cached per user + stats signature; cefr included so a
        // recalibration invalidates stale narratives; bounded by daily quota & in-flight dedup) ---
        const cacheKey = userAgentCacheKey('passport', userId, { cefr, lang, ...metrics });
        let narrative = await readAgentCache<string>('passport', cacheKey);
        if (!narrative) {
            let task = inflightNarratives.get(cacheKey);
            if (!task) {
                // 在首个 await 前同步登记 in-flight Promise，确保并发请求共享同一次额度预占与模型调用
                task = (async () => {
                    let reservedQuotaId: string | null = null;
                    try {
                        if (!isPro(session)) {
                            const reservation = await reserveDailyQuota(userId, 'passport');
                            if (!reservation.allowed) {
                                return '';
                            }
                            reservedQuotaId = reservation.usageLogId;
                        }

                        const template = await loadPrompt('passport.txt');
                        const filled = template
                            .replace(/\{\{cefr\}\}/g, cefr)
                            .replace(/\{\{metricsJson\}\}/g, JSON.stringify(metrics))
                            .replace(/\{\{radarJson\}\}/g, JSON.stringify(radar))
                            + (lang === 'zh' ? '\n\nWrite the narrative in Simplified Chinese (简体中文).' : '');
                        const generated = await completeDeepseek(
                            [
                                { role: 'system', content: filled },
                                { role: 'user', content: 'Generate my UN SDG 4 Learning Passport narrative now.' },
                            ],
                            { temperature: 0.7, maxTokens: 700 }
                        );
                        if (generated) {
                            await writeAgentCache('passport', cacheKey, generated);
                        }
                        return generated;
                    } catch (e) {
                        await releaseQuotaReservation(reservedQuotaId);
                        console.error('[passport] narrative generation failed:', e);
                        return '';
                    } finally {
                        inflightNarratives.delete(cacheKey);
                    }
                })();
                inflightNarratives.set(cacheKey, task);
            }
            narrative = await task;
        }

        const payload: PassportPayload = {
            metrics,
            radar,
            cefr,
            narrative,
            generatedAt: new Date().toISOString(),
        };
        return NextResponse.json(payload);
    } catch (error: any) {
        console.error('[passport] aggregation failed:', error);
        return NextResponse.json({ error: "Passport aggregation failed" }, { status: 500 });
    }
}
