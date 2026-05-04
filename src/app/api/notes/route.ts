import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureLocalUser, getSession } from '@/lib/auth';

// GET /api/notes?word={word} - Get all notes for a word
export async function GET(request: Request) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await ensureLocalUser(session);

        const word = new URL(request.url).searchParams.get('word')?.trim();

        if (!word) {
            return NextResponse.json({ error: 'Word parameter required' }, { status: 400 });
        }

        // Get all notes for this word, with user info and interaction counts
        const notes = await prisma.word_notes.findMany({
            where: { word },
            include: {
                User: {
                    select: {
                        id: true,
                        email: true,
                    },
                },
                note_interactions: {
                    select: {
                        id: true,
                        userId: true,
                        type: true,
                        content: true,
                        createdAt: true,
                        User: {
                            select: {
                                email: true,
                            },
                        },
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        // Calculate interaction stats for each note
        const notesWithStats = notes.map(note => {
            const likeCount = note.note_interactions.filter(i => i.type === 'like').length;
            const favoriteCount = note.note_interactions.filter(i => i.type === 'favorite').length;
            const comments = note.note_interactions.filter(i => i.type === 'comment');
            const hasUserLiked = note.note_interactions.some(i => i.type === 'like' && i.userId === session.id);
            const hasUserFavorited = note.note_interactions.some(i => i.type === 'favorite' && i.userId === session.id);

            return {
                id: note.id,
                userId: note.userId,
                word: note.word,
                content: note.content,
                createdAt: note.createdAt,
                updatedAt: note.updatedAt,
                user: {
                    id: note.User.id,
                    username: note.User.email,
                },
                likeCount,
                favoriteCount,
                commentCount: comments.length,
                hasUserLiked,
                hasUserFavorited,
                comments: comments.map(c => ({
                    content: c.content,
                    username: c.User.email,
                    createdAt: c.createdAt,
                })),
            };
        });

        return NextResponse.json(notesWithStats);
    } catch (error) {
        console.error('Error fetching notes:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// POST /api/notes - Create a new note
export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await ensureLocalUser(session);

        const body = await request.json().catch(() => ({}));
        const word = typeof body.word === 'string' ? body.word.trim() : '';
        const content = typeof body.content === 'string' ? body.content.trim() : '';

        if (!word || !content) {
            return NextResponse.json({ error: 'Word and content required' }, { status: 400 });
        }

        const note = await prisma.word_notes.create({
            data: {
                id: crypto.randomUUID(),
                userId: session.id,
                word,
                content,
                updatedAt: new Date(),
            },
            include: {
                User: {
                    select: {
                        id: true,
                        email: true,
                    },
                },
            },
        });

        return NextResponse.json({
            id: note.id,
            userId: note.userId,
            word: note.word,
            content: note.content,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
            user: {
                id: note.User.id,
                username: note.User.email,
            },
        });
    } catch (error) {
        console.error('Error creating note:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
