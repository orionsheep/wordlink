import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureLocalUser, getSession } from '@/lib/auth';

export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await ensureLocalUser(session);

        const { word, testType, score } = await request.json();
        const normalizedWord = typeof word === 'string' ? word.trim().toLowerCase() : '';
        const normalizedTestType = Number(testType);
        const normalizedScore = Number(score);

        if (!normalizedWord || Number.isNaN(normalizedTestType) || Number.isNaN(normalizedScore)) {
            return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
        }

        await prisma.quizRecord.create({
            data: {
                id: crypto.randomUUID(),
                userId: session.id,
                word: normalizedWord,
                testType: normalizedTestType,
                score: normalizedScore,
            },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Quiz record error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
