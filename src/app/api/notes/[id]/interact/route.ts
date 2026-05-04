import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureLocalUser, getSession } from '@/lib/auth';

// POST /api/notes/[id]/interact - Like, favorite, or comment on a note
export async function POST(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await ensureLocalUser(session);

        const noteExists = await prisma.word_notes.findUnique({
            where: { id },
            select: { id: true },
        });
        if (!noteExists) {
            return NextResponse.json({ error: 'Note not found' }, { status: 404 });
        }

        const body = await request.json().catch(() => ({}));
        const type = typeof body.type === 'string' ? body.type : '';
        const content = typeof body.content === 'string' ? body.content.trim() : '';

        if (!type || !['like', 'favorite', 'comment'].includes(type)) {
            return NextResponse.json({ error: 'Invalid interaction type' }, { status: 400 });
        }

        if (type === 'comment' && !content) {
            return NextResponse.json({ error: 'Comment content required' }, { status: 400 });
        }

        // For like/favorite, use upsert to toggle
        if (type === 'like' || type === 'favorite') {
            // Check if interaction already exists
            const existing = await prisma.note_interactions.findUnique({
                where: {
                    userId_noteId_type: {
                        userId: session.id,
                        noteId: id,
                        type,
                    },
                },
            });

            if (existing) {
                // Unlike/unfavorite
                await prisma.note_interactions.delete({
                    where: {
                        id: existing.id,
                    },
                });
                return NextResponse.json({ action: 'removed', type });
            } else {
                // Like/favorite
                await prisma.note_interactions.create({
                    data: {
                        id: crypto.randomUUID(),
                        userId: session.id,
                        noteId: id,
                        type,
                    },
                });
                return NextResponse.json({ action: 'added', type });
            }
        }

        // For comments, always create new
        if (type === 'comment') {
            const existingComment = await prisma.note_interactions.findUnique({
                where: {
                    userId_noteId_type: {
                        userId: session.id,
                        noteId: id,
                        type: 'comment',
                    },
                },
                include: {
                    User: {
                        select: {
                            email: true,
                        },
                    },
                },
            });

            if (existingComment) {
                const updated = await prisma.note_interactions.update({
                    where: { id: existingComment.id },
                    data: { content },
                    include: {
                        User: {
                            select: { email: true },
                        },
                    },
                });
                return NextResponse.json({
                    ...updated,
                    username: updated.User.email,
                });
            }

            const comment = await prisma.note_interactions.create({
                data: {
                    id: crypto.randomUUID(),
                    userId: session.id,
                    noteId: id,
                    type: 'comment',
                    content,
                },
                include: {
                    User: {
                        select: {
                            email: true,
                        },
                    },
                },
            });
            return NextResponse.json({
                ...comment,
                username: comment.User.email,
            });
        }

        return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    } catch (error) {
        console.error('Error interacting with note:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
