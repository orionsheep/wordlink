import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureLocalUser, getSession } from '@/lib/auth';
import { nextMemoryState } from '@/lib/memory';

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

        // FIX: isCorrect was never written before (schema default `true` made
        // every record look correct). Derive it from the score instead.
        const isCorrect = normalizedScore > 0;

        await prisma.quizRecord.create({
            data: {
                id: crypto.randomUUID(),
                userId: session.id,
                word: normalizedWord,
                testType: normalizedTestType,
                score: normalizedScore,
                isCorrect,
            },
        });

        // Advance the per-word memory state machine (Ebbinghaus / SM-2 lite).
        // This keeps UserWordState alive for the Learning Passport, the
        // Cognitive Navigator and any future memory-aware feature.
        try {
            const existing = await prisma.userWordState.findUnique({
                where: { userId_word: { userId: session.id, word: normalizedWord } },
            });
            const next = nextMemoryState(existing, normalizedScore);
            await prisma.userWordState.upsert({
                where: { userId_word: { userId: session.id, word: normalizedWord } },
                create: {
                    id: crypto.randomUUID(),
                    userId: session.id,
                    word: normalizedWord,
                    stage: next.stage,
                    memoryStrength: next.memoryStrength,
                    stability: next.stability,
                    repetitionCount: next.repetitionCount,
                    consecutiveRight: next.consecutiveRight,
                    wrongCount: next.wrongCount,
                    lastTestedAt: new Date(),
                    nextReviewAt: next.nextReviewAt,
                },
                update: {
                    stage: next.stage,
                    memoryStrength: next.memoryStrength,
                    stability: next.stability,
                    repetitionCount: next.repetitionCount,
                    consecutiveRight: next.consecutiveRight,
                    wrongCount: next.wrongCount,
                    lastTestedAt: new Date(),
                    nextReviewAt: next.nextReviewAt,
                },
            });
        } catch (memErr) {
            // Memory-state failure must never fail the quiz submission itself.
            console.error('UserWordState update failed:', memErr);
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Quiz record error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
