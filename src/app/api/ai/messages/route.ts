// API route for chat messages

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureLocalUser, getSession } from '@/lib/auth';

// POST - Add message to session
export async function POST(request: NextRequest) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await ensureLocalUser(session);

        const { sessionId, role, content } = await request.json();

        if (!sessionId || !role || !content) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Verify session ownership
        const chatSession = await prisma.chat_sessions.findFirst({
            where: { id: sessionId, userId: session.id }
        });

        if (!chatSession) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        // Create message and update session timestamp
        const message = await prisma.chat_messages.create({
            data: {
                id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                sessionId,
                role,
                content,
            }
        });

        // Update session timestamp
        await prisma.chat_sessions.update({
            where: { id: sessionId },
            data: { updatedAt: new Date() }
        });

        return NextResponse.json(message);
    } catch (error) {
        console.error('Add message error:', error);
        return NextResponse.json({ error: 'Failed to add message' }, { status: 500 });
    }
}
