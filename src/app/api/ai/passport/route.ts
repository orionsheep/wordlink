import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, ensureLocalUser } from '@/lib/auth';
import {
    loadPrompt,
    completeDeepseek,
    readAgentCache,
    writeAgentCache,
    agentCacheKey,
} from '@/lib/ai/gateway';

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

function computeStreakFromDays(daySet: Set<string>): number {
    let streak = 0;
    const cursor = new Date();
    // allow "today not yet active" without breaking yesterday's streak
    if (!daySet.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1);
    while (daySet.has(cursor.toISOString().slice(0, 10))) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
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
    await ensureLocalUser(session);
    const userId = session.id;

    try {
        const [visits, quizRecords, wordStates] = await Promise.all([
            prisma.wordVisit.findMany({
                where: { userId },
                select: { word: true, dwellTimeMs: true, audioPlays: true, timestamp: true },
            }),
            prisma.quizRecord.findMany({
                where: { userId },
                select: { word: true, isCorrect: true, testType: true, timeSpentMs: true, timestamp: true },
            }),
            prisma.userWordState.findMany({
                where: { userId },
                select: { word: true, stage: true, memoryStrength: true, stability: true, nextReviewAt: true },
            }),
        ]);

        // ---- New-user guard: never issue an "A1 certificate" to empty data --
        if (quizRecords.length === 0 && visits.length === 0) {
            return NextResponse.json({ empty: true });
        }

        const visitedWords = new Set(visits.map((v) => v.word.toLowerCase()));
        const testedWords = new Set(quizRecords.map((q) => q.word.toLowerCase()));
        const correct = quizRecords.filter((q) => q.isCorrect === true).length;
        const graded = quizRecords.filter((q) => q.isCorrect !== null && q.isCorrect !== undefined).length;

        // Streak derived from real activity dates (same source of truth as the
        // dashboard check-in calendar: any quiz or visit counts as a day).
        // FIX: previously read CheckinLog — a table nothing in the codebase writes.
        const activityDays = new Set<string>([
            ...quizRecords.map((q) => new Date(q.timestamp).toISOString().slice(0, 10)),
            ...visits.map((v) => new Date(v.timestamp).toISOString().slice(0, 10)),
        ]);
        const metrics: PassportMetrics = {
            uniqueWordsVisited: visitedWords.size,
            uniqueWordsTested: testedWords.size,
            totalTests: quizRecords.length,
            accuracy: graded ? Math.round((correct / graded) * 100) : 0,
            avgMemoryStrength: wordStates.length
                ? Math.round((wordStates.reduce((s, w) => s + w.memoryStrength, 0) / wordStates.length) * 10) / 10
                : 0,
            masteredWords: wordStates.filter((w) => w.stage === 'MASTERED' || w.stage === 'LEARNED').length,
            dueForReview: wordStates.filter((w) => new Date(w.nextReviewAt) <= new Date()).length,
            checkinDays: activityDays.size,
            streakDays: computeStreakFromDays(activityDays),
            totalDwellMinutes: Math.round(visits.reduce((s, v) => s + (v.dwellTimeMs || 0), 0) / 60000),
            audioPlays: visits.reduce((s, v) => s + (v.audioPlays || 0), 0),
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

        // ---- AI narrative (cached per stats signature; cefr included so a
        // recalibration invalidates stale narratives) -------------------------
        const cacheKey = agentCacheKey('passport', { u: userId, cefr, ...metrics });
        let narrative = await readAgentCache<string>('passport', cacheKey);
        if (!narrative) {
            try {
                const template = await loadPrompt('passport.txt');
                const filled = template
                    .replace(/\{\{cefr\}\}/g, cefr)
                    .replace(/\{\{metricsJson\}\}/g, JSON.stringify(metrics))
                    .replace(/\{\{radarJson\}\}/g, JSON.stringify(radar));
                narrative = await completeDeepseek(
                    [
                        { role: 'system', content: filled },
                        { role: 'user', content: 'Generate my UN SDG 4 Learning Passport narrative now.' },
                    ],
                    { temperature: 0.7, maxTokens: 700 }
                );
                await writeAgentCache('passport', cacheKey, narrative);
            } catch (e) {
                console.error('[passport] narrative generation failed:', e);
                narrative = '';
            }
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
        return NextResponse.json({ error: 'Passport aggregation failed', details: error.message }, { status: 500 });
    }
}
