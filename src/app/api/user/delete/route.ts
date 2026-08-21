import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logout } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: Request) {
    void request;

    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Remove the Supabase identity first. This prevents a still-valid auth
        // identity from recreating a local profile if the database cleanup fails.
        const admin = createAdminClient();
        const { error: authDeleteError } = await admin.auth.admin.deleteUser(session.id);
        if (authDeleteError && !/not found|user.*does not exist/i.test(authDeleteError.message)) {
            console.error('Supabase user deletion failed:', authDeleteError);
            return NextResponse.json({ error: 'Failed to delete authentication account' }, { status: 502 });
        }

        // Delete all user-owned data. Direct deletes make the intent explicit;
        // remaining relation-level cascades cover nested library/chat rows.
        await prisma.$transaction(async (tx) => {
            await tx.note_interactions.deleteMany({ where: { userId: session.id } });
            await tx.word_notes.deleteMany({ where: { userId: session.id } });
            await tx.chat_sessions.deleteMany({ where: { userId: session.id } });
            await tx.quizRecord.deleteMany({ where: { userId: session.id } });
            await tx.wordVisit.deleteMany({ where: { userId: session.id } });
            await tx.checkinLog.deleteMany({ where: { userId: session.id } });
            await tx.userWordState.deleteMany({ where: { userId: session.id } });
            await tx.studyPlan.deleteMany({ where: { userId: session.id } });
            await tx.userLibrary.deleteMany({ where: { userId: session.id } });
            await tx.user.delete({ where: { id: session.id } });
        });

        // Clear the browser's Supabase session cookies. The identity has already
        // been deleted, so a missing-session error here should not fail deletion.
        try {
            await logout();
        } catch (logoutError) {
            console.warn('Supabase session cookie cleanup failed after deletion:', logoutError);
        }

        return NextResponse.json({
            success: true,
            message: 'Account deleted',
        });
    } catch (error) {
        console.error('Delete account error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
