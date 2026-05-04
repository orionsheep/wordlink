import { cookies } from 'next/headers';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { prisma } from '@/lib/prisma';

// JWKS endpoint for the centralized auth service
const JWKS_URL = 'https://auth.lifeplayertribe.com/api/v1/.well-known/jwks.json';
const JWKS = createRemoteJWKSet(new URL(JWKS_URL));

export interface SessionUser {
    id: string;
    email: string;
    role: string;
}

async function mergeUserRecords(sourceUserId: string, targetUserId: string) {
    if (sourceUserId === targetUserId) return;

    await prisma.$transaction(async (tx) => {
        const sourceUser = await tx.user.findUnique({
            where: { id: sourceUserId },
            select: { id: true },
        });
        const targetUser = await tx.user.findUnique({
            where: { id: targetUserId },
            select: { id: true },
        });

        if (!sourceUser || !targetUser) return;

        await tx.wordVisit.updateMany({
            where: { userId: sourceUserId },
            data: { userId: targetUserId },
        });
        await tx.quizRecord.updateMany({
            where: { userId: sourceUserId },
            data: { userId: targetUserId },
        });
        await tx.chat_sessions.updateMany({
            where: { userId: sourceUserId },
            data: { userId: targetUserId },
        });
        await tx.word_notes.updateMany({
            where: { userId: sourceUserId },
            data: { userId: targetUserId },
        });

        // Avoid unique constraint conflicts on (userId, noteId, type)
        const sourceInteractions = await tx.note_interactions.findMany({
            where: { userId: sourceUserId },
            select: {
                id: true,
                noteId: true,
                type: true,
            },
        });

        for (const interaction of sourceInteractions) {
            const conflict = await tx.note_interactions.findUnique({
                where: {
                    userId_noteId_type: {
                        userId: targetUserId,
                        noteId: interaction.noteId,
                        type: interaction.type,
                    },
                },
                select: { id: true },
            });

            if (conflict) {
                await tx.note_interactions.delete({ where: { id: interaction.id } });
            } else {
                await tx.note_interactions.update({
                    where: { id: interaction.id },
                    data: { userId: targetUserId },
                });
            }
        }

        // StudyPlan has unique userId
        const sourcePlan = await tx.studyPlan.findUnique({
            where: { userId: sourceUserId },
            select: { id: true },
        });
        if (sourcePlan) {
            const targetPlan = await tx.studyPlan.findUnique({
                where: { userId: targetUserId },
                select: { id: true },
            });
            if (targetPlan) {
                await tx.studyPlan.delete({ where: { userId: sourceUserId } });
            } else {
                await tx.studyPlan.update({
                    where: { userId: sourceUserId },
                    data: { userId: targetUserId },
                });
            }
        }

        await tx.user.delete({ where: { id: sourceUserId } });
    });
}

export async function getSession() {
    const cookieStore = await cookies();
    const token = cookieStore.get('lpt_session')?.value;

    if (!token) return null;

    try {
        // Verify JWT using JWKS
        const { payload } = await jwtVerify(token, JWKS, {
            issuer: 'lpt-auth',
            audience: 'lpt-web',
        });

        if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
            return null;
        }

        return {
            id: payload.sub,
            email: payload.email,
            role: typeof payload.role === 'string' ? payload.role : 'user',
        };
    } catch (error) {
        console.error('Session verification failed:', error);
        return null;
    }
}

export async function ensureLocalUser(session: SessionUser) {
    const existingById = await prisma.user.findUnique({
        where: { id: session.id },
        select: { id: true, email: true, role: true },
    });

    const existingByEmail = await prisma.user.findUnique({
        where: { email: session.email },
        select: { id: true, role: true },
    });

    if (existingById && existingByEmail && existingById.id !== existingByEmail.id) {
        await mergeUserRecords(existingByEmail.id, existingById.id);
        await prisma.user.update({
            where: { id: existingById.id },
            data: {
                email: session.email,
                role: session.role,
            },
        });
        return;
    }

    if (existingById) {
        if (existingById.email !== session.email || existingById.role !== session.role) {
            await prisma.user.update({
                where: { id: session.id },
                data: {
                    email: session.email,
                    role: session.role,
                },
            });
        }
        return;
    }

    if (existingByEmail) {
        // Align legacy/local user row with centralized auth user id.
        if (existingByEmail.id !== session.id) {
            await prisma.user.update({
                where: { email: session.email },
                data: {
                    id: session.id,
                    role: session.role,
                },
            });
        } else if (existingByEmail.role !== session.role) {
            await prisma.user.update({
                where: { id: session.id },
                data: { role: session.role },
            });
        }
        return;
    }

    await prisma.user.create({
        data: {
            id: session.id,
            email: session.email,
            role: session.role,
            preferredLanguage: 'zh',
        },
    });
}

export async function logout() {
    const cookieStore = await cookies();
    cookieStore.delete('lpt_session');
}
