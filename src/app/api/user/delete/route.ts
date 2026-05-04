import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureLocalUser, getSession } from '@/lib/auth';
import {
    appendAuthSetCookies,
    AUTH_API_BASE,
    getRequestCookieHeader,
} from '@/lib/auth-proxy';

export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        await ensureLocalUser(session);

        // Delete all user-owned data then delete user row
        await prisma.$transaction(async (tx) => {
            await tx.note_interactions.deleteMany({ where: { userId: session.id } });
            await tx.word_notes.deleteMany({ where: { userId: session.id } });
            await tx.chat_sessions.deleteMany({ where: { userId: session.id } });
            await tx.quizRecord.deleteMany({ where: { userId: session.id } });
            await tx.wordVisit.deleteMany({ where: { userId: session.id } });
            await tx.studyPlan.deleteMany({ where: { userId: session.id } });
            await tx.user.delete({ where: { id: session.id } });
        });

        // Logout from centralized Auth API and forward cookie cleanup headers
        const authResponse = await fetch(`${AUTH_API_BASE}/auth/logout`, {
            method: 'POST',
            headers: {
                'Cookie': getRequestCookieHeader(request),
            },
            cache: 'no-store',
        });
        const authData = await authResponse.json().catch(() => ({}));

        const response = NextResponse.json({
            success: true,
            message: authResponse.ok
                ? authData.message || 'Account deleted'
                : 'Account deleted, but logout sync failed',
        });
        appendAuthSetCookies(response, authResponse, request);
        if (!authResponse.headers.get('set-cookie')) {
            response.cookies.set('lpt_session', '', {
                path: '/',
                maxAge: 0,
            });
        }
        return response;
    } catch (error) {
        console.error('Delete account error:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
