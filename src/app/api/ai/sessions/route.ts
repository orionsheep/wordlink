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

        const sessions = await prisma.chat_sessions.findMany({
            where: { userId: session.id },
            include: {
                chat_messages: {
                    orderBy: { createdAt: 'asc' }
                }
            },
            orderBy: { updatedAt: 'desc' }
        });
        return NextResponse.json(sessions);
    } catch (error) {
        console.error('Failed to fetch sessions:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
