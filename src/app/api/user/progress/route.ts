import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureLocalUser, getSession } from '@/lib/auth';

export async function GET() {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await ensureLocalUser(session);

        // Latest quiz record per word, resolved in Postgres via DISTINCT ON —
        // one row per word crosses the wire instead of the full history.
        // ("id" DESC only breaks timestamp ties; the old in-memory last-write
        // wins on arbitrary tie order, so this is strictly more deterministic.)
        const records = await prisma.$queryRaw<{ word: string; score: number }[]>`
            SELECT DISTINCT ON ("word") "word", "score"
            FROM "LPT_english"."QuizRecord"
            WHERE "userId" = ${session.id}
            ORDER BY "word", "timestamp" DESC, "id" DESC
        `;

        const progress: Record<string, number> = {};
        records.forEach((r) => {
            progress[r.word] = r.score;
        });

        return NextResponse.json(progress);
    } catch (error) {
        console.error('Progress fetch error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
