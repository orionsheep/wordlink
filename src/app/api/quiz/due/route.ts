import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureLocalUser, getSession } from '@/lib/auth';
import { getQuizDataForWords } from '@/lib/data';

export const dynamic = 'force-dynamic';

/**
 * GET /api/quiz/due?count=20
 *
 * Returns words scheduled for review from UserWordState:
 * 1. Due words (`nextReviewAt <= now`), earliest due first.
 * 2. If fewer than `count`, supplement with `UNFAMILIAR` / `FAMILIAR` words
 *    ordered by soonest `nextReviewAt` then lowest `memoryStrength`.
 */
export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await ensureLocalUser(session);

        const { searchParams } = new URL(request.url);
        const requested = parseInt(searchParams.get('count') || '20', 10);
        const count = Math.min(Math.max(Number.isFinite(requested) ? requested : 20, 1), 200);

        const now = new Date();

        const dueStates = await prisma.userWordState.findMany({
            where: {
                userId: session.id,
                nextReviewAt: { lte: now },
            },
            orderBy: { nextReviewAt: 'asc' },
            take: count,
            select: { word: true },
        });

        const selectedWords: string[] = dueStates.map((s) => s.word);

        if (selectedWords.length < count) {
            const remaining = count - selectedWords.length;
            const supplementStates = await prisma.userWordState.findMany({
                where: {
                    userId: session.id,
                    stage: { in: ['UNFAMILIAR', 'FAMILIAR'] },
                    ...(selectedWords.length > 0 ? { word: { notIn: selectedWords } } : {}),
                },
                orderBy: [
                    { nextReviewAt: 'asc' },
                    { memoryStrength: 'asc' },
                ],
                take: remaining,
                select: { word: true },
            });

            for (const s of supplementStates) {
                selectedWords.push(s.word);
            }
        }

        const quizData = await getQuizDataForWords(selectedWords);
        return NextResponse.json(quizData);
    } catch (error) {
        console.error('Due quiz words error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
