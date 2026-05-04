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

        // Get latest quiz record for each word for this user
        // Prisma doesn't support "distinct on" with "order by" easily in findMany for this specific case without raw query or post-processing
        // But we can fetch all and process, or use groupBy.
        // Actually, we just want the *latest* status.

        // Let's fetch all records for the user
        const records = await prisma.quizRecord.findMany({
            where: { userId: session.id },
            orderBy: { timestamp: 'asc' }, // Oldest to newest
            select: { word: true, score: true }
        });

        // Map to store latest score
        const progress: Record<string, number> = {};
        records.forEach((r: { word: string; score: number }) => {
            progress[r.word] = r.score;
        });

        return NextResponse.json(progress);
    } catch (error) {
        console.error('Progress fetch error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
