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
                // 列表页只需预览：每条会话取最新 1 条消息 + 消息总数，
                // 避免会话一多就拉出全部消息正文
                chat_messages: {
                    orderBy: { createdAt: 'desc' },
                    take: 1
                },
                _count: { select: { chat_messages: true } }
            },
            orderBy: { updatedAt: 'desc' }
        });
        // messages 别名：AIChatWindow 读取 s.messages 作为会话消息数组
        return NextResponse.json(sessions.map((s) => ({ ...s, messages: s.chat_messages })));
    } catch (error) {
        console.error('Failed to fetch sessions:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
