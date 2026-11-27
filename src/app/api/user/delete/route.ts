import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession, logout, invalidateAuthCaches } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteUserAgentCache } from '@/lib/ai/gateway';

export async function POST(request: Request) {
    void request;

    try {
        if (process.env.DEMO_MODE === 'true') {
            return NextResponse.json(
                { error: 'Account deletion is disabled in demo mode' },
                { status: 403 },
            );
        }

        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 1. 先清理全部本地业务数据与磁盘护照缓存（保留 User 主行以允许在 Supabase 删号失败时重试）。
        //    即使后续步骤出现瞬时故障，用户私有内容和缓存也已清空且仍可重试完成收尾。
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
            await tx.ambientArticle.deleteMany({ where: { userId: session.id } });
            await tx.usageLog.deleteMany({ where: { userId: session.id } });
            await tx.paymentOrder.deleteMany({ where: { userId: session.id } });
        });
        await deleteUserAgentCache('passport', session.id);

        // 2. 删除 Supabase 认证身份；若失败则返回 502，用户会话仍有效可安全重试
        const admin = createAdminClient();
        const { error: authDeleteError } = await admin.auth.admin.deleteUser(session.id);
        if (authDeleteError && !/not found|user.*does not exist/i.test(authDeleteError.message)) {
            console.error('Supabase user deletion failed:', authDeleteError);
            return NextResponse.json({ error: 'Failed to delete authentication account' }, { status: 502 });
        }

        // 3. 删除本地 User 壳记录（幂等 deleteMany，避免重复请求时报 P2025）
        await prisma.user.deleteMany({ where: { id: session.id } });

        invalidateAuthCaches(session.id);

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
