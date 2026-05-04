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

        // Fetch all records
        const records = await prisma.quizRecord.findMany({
            where: { userId: session.id },
            orderBy: { timestamp: 'asc' },
            select: { word: true, score: true }
        });

        // Calculate latest score
        const latestScores: Record<string, number> = {};
        records.forEach((r: { word: string; score: number }) => {
            latestScores[r.word] = r.score;
        });

        // Filter for score < 2 (assuming 2 is "Mastered/Easy")
        // We can also include words that have been visited but not quizzed? 
        // For now, let's stick to words that have been quizzed and are not mastered.
        const unfamiliarWords = Object.entries(latestScores)
            .filter(([_, score]) => score < 2)
            .map(([word]) => word);

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
