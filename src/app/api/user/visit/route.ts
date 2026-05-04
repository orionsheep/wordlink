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

        const { word } = await request.json();
        const normalizedWord = typeof word === 'string' ? word.trim().toLowerCase() : '';
        if (!normalizedWord) {
            return NextResponse.json({ error: 'Missing word' }, { status: 400 });
        }

        await prisma.wordVisit.create({
            data: {
                id: crypto.randomUUID(),
                userId: session.id,
                word: normalizedWord,
            },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Visit record error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
