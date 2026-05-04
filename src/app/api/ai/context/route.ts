'use server';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureLocalUser, getSession } from '@/lib/auth';

export async function GET() {
    try {
        const session = await getSession();

        if (!session) {
            return NextResponse.json({
                recentHistory: [],
                recentTests: [],
                currentWord: null
            });
        }

        await ensureLocalUser(session);

        // Fetch recent history (last 1000 records)
        const recentHistory = await prisma.wordVisit.findMany({
            where: { userId: session.id },
            orderBy: { timestamp: 'desc' },
            take: 1000,
            select: {
                word: true,
                timestamp: true,
            }
        });

        // Fetch recent test records (last 1000 records)
        const recentTests = await prisma.quizRecord.findMany({
            where: { userId: session.id },
            orderBy: { timestamp: 'desc' },
            take: 1000,
            select: {
                word: true,
                score: true,
                testType: true,
                timestamp: true,
            }
        });

        return NextResponse.json({
            recentHistory,
            recentTests,
            currentWord: null,
        });
    } catch (error) {
        console.error('AI context API error:', error);
        return NextResponse.json({
            recentHistory: [],
            recentTests: [],
            currentWord: null,
            error: 'Failed to fetch context'
        });
    }
}
