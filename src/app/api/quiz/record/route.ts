import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ensureLocalUser, getSession } from '@/lib/auth';
import { nextMemoryState } from '@/lib/memory';

const CLIENT_SUBMISSION_ID_RE = /^[a-zA-Z0-9_-]{16,64}$/;

function buildIdempotentRecordId(userId: string, clientSubmissionId: string): string {
    const digest = createHash('sha256')
        .update(`${userId}:${clientSubmissionId}`)
        .digest('hex')
        .slice(0, 32);
    return `sub_${digest}`;
}

export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await ensureLocalUser(session);

        const body = await request.json().catch(() => null);
        const normalizedWord = typeof body?.word === 'string' ? body.word.trim().toLowerCase().slice(0, 200) : '';
        const normalizedTestType = Number(body?.testType);
        const rawScore = Number(body?.score);

        if (!normalizedWord || !Number.isInteger(normalizedTestType) || !Number.isFinite(rawScore)) {
            return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
        }
        if (normalizedTestType < 0 || normalizedTestType > 100) {
            return NextResponse.json({ error: 'Invalid testType' }, { status: 400 });
        }
        // 0 = 不会，1 = 模糊 / 看了提示，2 = 掌握。超出范围的分数会让记忆模型和护照统计失真
        const normalizedScore = Math.min(2, Math.max(0, Math.round(rawScore)));
        const userInput = typeof body?.userInput === 'string' ? body.userInput.slice(0, 200) : null;
        const timeSpentMs = Number.isFinite(body?.timeSpentMs)
            ? Math.min(60 * 60 * 1000, Math.max(0, Math.floor(body.timeSpentMs)))
            : null;
        const rawClientSubmissionId =
            typeof body?.clientSubmissionId === 'string' ? body.clientSubmissionId.trim() : '';
        const clientSubmissionId = CLIENT_SUBMISSION_ID_RE.test(rawClientSubmissionId)
            ? rawClientSubmissionId
            : null;

        // FIX: isCorrect was never written before (schema default `true` made
        // every record look correct). Derive it from the score instead.
        const isCorrect = normalizedScore > 0;

        const now = new Date();
        const lockKey = `wordstate:${session.id}:${normalizedWord}`;
        const recordId = clientSubmissionId
            ? buildIdempotentRecordId(session.id, clientSubmissionId)
            : crypto.randomUUID();

        // Serialize concurrent quiz submissions for the same (user, word) and
        // keep QuizRecord + UserWordState atomically consistent & idempotent on retry.
        let deduplicated = false;
        try {
            await prisma.$transaction(async (tx) => {
                await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

                if (clientSubmissionId) {
                    const alreadyApplied = await tx.quizRecord.findUnique({
                        where: { id: recordId },
                        select: { id: true },
                    });
                    if (alreadyApplied) {
                        deduplicated = true;
                        return;
                    }
                }

                await tx.quizRecord.create({
                    data: {
                        id: recordId,
                        userId: session.id,
                        word: normalizedWord,
                        testType: normalizedTestType,
                        score: normalizedScore,
                        isCorrect,
                        userInput,
                        timeSpentMs,
                    },
                });

                // Advance the per-word memory state machine (Ebbinghaus / SM-2 lite).
                // This keeps UserWordState alive for the Learning Passport and any
                // future memory-aware feature.
                const existing = await tx.userWordState.findUnique({
                    where: { userId_word: { userId: session.id, word: normalizedWord } },
                });
                const next = nextMemoryState(existing, normalizedScore);
                await tx.userWordState.upsert({
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
                        lastTestedAt: now,
                        nextReviewAt: next.nextReviewAt,
                        updatedAt: now,
                    },
                    update: {
                        stage: next.stage,
                        memoryStrength: next.memoryStrength,
                        stability: next.stability,
                        repetitionCount: next.repetitionCount,
                        consecutiveRight: next.consecutiveRight,
                        wrongCount: next.wrongCount,
                        lastTestedAt: now,
                        nextReviewAt: next.nextReviewAt,
                        updatedAt: now,
                    },
                });
            });
        } catch (txError) {
            // Concurrent duplicate retry with the same clientSubmissionId (e.g. racing
            // requests) can hit the PK unique constraint; treat as idempotent success.
            if (
                clientSubmissionId &&
                txError instanceof Prisma.PrismaClientKnownRequestError &&
                txError.code === 'P2002'
            ) {
                const alreadyExists = await prisma.quizRecord.findUnique({
                    where: { id: recordId },
                    select: { id: true },
                });
                if (alreadyExists) {
                    deduplicated = true;
                } else {
                    throw txError;
                }
            } else {
                throw txError;
            }
        }

        return NextResponse.json({ success: true, ...(deduplicated ? { deduplicated: true } : {}) });
    } catch (error) {
        console.error('Quiz record error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
