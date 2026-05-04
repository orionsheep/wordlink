import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureLocalUser, getSession } from '@/lib/auth';

type HistoryDateFilter = {
    gte?: Date;
    lte?: Date;
};

type HistoryWhereCondition =
    | { word: { contains: string; mode: 'insensitive' } }
    | { word: { in: string[] } }
    | { timestamp: HistoryDateFilter };

type HistoryWhereClause = {
    userId: string;
    AND?: HistoryWhereCondition[];
};

export async function GET(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await ensureLocalUser(session);

        const { searchParams } = new URL(request.url);
        const word = searchParams.get('word')?.trim() || undefined;
        const wordsParam = searchParams.get('words');
        const startDate = searchParams.get('startDate');
        const endDate = searchParams.get('endDate');
        const words = wordsParam
            ? wordsParam
                .split(',')
                .map(w => w.trim())
                .filter(Boolean)
            : [];

        const dateFilter: HistoryDateFilter = {};
        if (startDate) dateFilter.gte = new Date(startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            dateFilter.lte = end;
        }

        const andConditions: HistoryWhereCondition[] = [];
        if (word) {
            andConditions.push({ word: { contains: word, mode: 'insensitive' } });
        }
        if (words.length > 0) {
            andConditions.push({ word: { in: words } });
        }
        if (Object.keys(dateFilter).length > 0) {
            andConditions.push({ timestamp: dateFilter });
        }

        const whereClause: HistoryWhereClause = {
            userId: session.id,
            ...(andConditions.length > 0 && { AND: andConditions }),
        };

        // Fetch Word Visits
        const visits = await prisma.wordVisit.findMany({
            where: whereClause,
            orderBy: { timestamp: 'desc' },
            take: 100
        });

        // Fetch Quiz Records
        const quizzes = await prisma.quizRecord.findMany({
            where: whereClause,
            orderBy: { timestamp: 'desc' },
            take: 100
        });

        return NextResponse.json({ visits, quizzes });
    } catch (error) {
        console.error('Error fetching history:', error);
        const details =
            process.env.NODE_ENV !== 'production' && error instanceof Error
                ? error.message
                : undefined;
        return NextResponse.json({ error: 'Internal Server Error', details }, { status: 500 });
    }
}
