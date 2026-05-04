import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureLocalUser, getSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await ensureLocalUser(session);

        const { searchParams } = new URL(request.url);
        const word = searchParams.get('word');
        const wordsParam = searchParams.get('words');

        // Fetch all quiz records for the user
        const records = await prisma.quizRecord.findMany({
            where: {
                userId: session.id,
                ...(word && { word: { contains: word, mode: 'insensitive' } }),
                ...(wordsParam && { word: { in: wordsParam.split(',') } })
            },
            orderBy: { timestamp: 'asc' },
        });

        // Process records to calculate mastery
        const wordStats: Record<string, {
            spellingScore: number;
            recallScore: number;
            history: { date: string; score: number }[]
        }> = {};

        records.forEach((record) => {
            if (!wordStats[record.word]) {
                wordStats[record.word] = { spellingScore: 0, recallScore: 0, history: [] };
            }

            // Update latest score for the specific test type
            if (record.testType === 1) { // Spelling
                wordStats[record.word].spellingScore = record.score;
            } else if (record.testType === 2) { // Recall
                wordStats[record.word].recallScore = record.score;
            }

            // Calculate current mastery level
            const currentMastery = wordStats[record.word].spellingScore + wordStats[record.word].recallScore;

            // Add to history (simplified: one entry per quiz record, showing the mastery level at that time)
            // Ideally we aggregate by day, but raw history is fine for scatter plot
            wordStats[record.word].history.push({
                date: record.timestamp.toISOString(),
                score: currentMastery
            });
        });

        // Convert to array
        const stats = Object.entries(wordStats).map(([word, data]) => ({
            word,
            masteryLevel: data.spellingScore + data.recallScore,
            history: data.history
        }));

        return NextResponse.json({ stats });
    } catch (error) {
        console.error('Stats error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
