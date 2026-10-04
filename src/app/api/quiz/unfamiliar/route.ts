import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureLocalUser, getSession } from '@/lib/auth';
import { getQuizDataForWords } from '@/lib/data';

export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await ensureLocalUser(session);

        const { searchParams } = new URL(request.url);
        const count = parseInt(searchParams.get('count') || '20');

        // Latest quiz score per word, resolved in Postgres via DISTINCT ON —
        // one row per quizzed word crosses the wire instead of full history.
        const latestScores = await prisma.$queryRaw<{ word: string; score: number }[]>`
            SELECT DISTINCT ON ("word") "word", "score"
            FROM "LPT_english"."QuizRecord"
            WHERE "userId" = ${session.id}
            ORDER BY "word", "timestamp" DESC, "id" DESC
        `;

        // Filter for score < 2 (assuming 2 is "Mastered/Easy")
        // We can also include words that have been visited but not quizzed?
        // For now, let's stick to words that have been quizzed and are not mastered.
        const unfamiliarWords = latestScores
            .filter((r) => r.score < 2)
            .map((r) => r.word);

        // Shuffle and slice
        const selectedWords = unfamiliarWords.sort(() => 0.5 - Math.random()).slice(0, count);

        // Fetch quiz data
        const quizData = await getQuizDataForWords(selectedWords);

        return NextResponse.json(quizData);
    } catch (error) {
        console.error('Unfamiliar words error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
