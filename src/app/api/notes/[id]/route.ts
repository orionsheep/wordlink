import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureLocalUser, getSession } from '@/lib/auth';

// PUT /api/notes/[id] - Update a note
export async function PUT(
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

        const body = await request.json().catch(() => ({}));
        const content = typeof body.content === 'string' ? body.content.trim() : '';
        if (!content) {
            return NextResponse.json({ error: 'Content required' }, { status: 400 });
        }

        // Check if user owns the note
        const note = await prisma.word_notes.findUnique({
            where: { id },
            select: { id: true, userId: true },
        });

        if (!note) {
            return NextResponse.json({ error: 'Note not found' }, { status: 404 });
        }

        if (note.userId !== session.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const updatedNote = await prisma.word_notes.update({
            where: { id },
            data: {
                content,
                updatedAt: new Date(),
            },
        });

        return NextResponse.json(updatedNote);
    } catch (error) {
        console.error('Error updating note:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

// DELETE /api/notes/[id] - Delete a note
export async function DELETE(
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

        // Check if user owns the note
        const note = await prisma.word_notes.findUnique({
            where: { id },
            select: { id: true, userId: true },
        });

        if (!note) {
            return NextResponse.json({ error: 'Note not found' }, { status: 404 });
        }

        if (note.userId !== session.id) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        await prisma.word_notes.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting note:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
