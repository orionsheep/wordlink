import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/auth';

export async function POST(request: Request) {
    try {
        const body = await request.json().catch(() => null);
        const password = typeof body?.password === 'string' ? body.password : '';

        if (!password || password.length < 6) {
            return NextResponse.json(
                { error: 'Password must be at least 6 characters long' },
                { status: 400 },
            );
        }

        const supabase = await createClient();
        const { data, error } = await supabase.auth.updateUser({ password });

        if (error || !data.user) {
            return NextResponse.json(
                { error: error?.message || 'Failed to update password' },
                { status: 400 },
            );
        }

        const user = await getSession();

        return NextResponse.json({
            success: true,
            message: 'Password updated successfully',
            user,
        });
    } catch (error) {
        console.error('Update password error:', error);
        const message = error instanceof Error ? error.message : 'Failed to update password';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
