import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensureLocalUser } from '@/lib/auth';
import { safeReturnPath } from '@/lib/safe-path';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const nextPath = safeReturnPath(requestUrl.searchParams.get('next'));

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', request.url));
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(
        new URL('/login?error=callback_failed', request.url),
      );
    }

    if (data.user?.email) {
      await ensureLocalUser({
        id: data.user.id,
        email: data.user.email,
        role: 'user',
        preferredLanguage: data.user.user_metadata?.preferredLanguage || 'zh',
        plan: 'free',
        planExpiresAt: null,
      });
    }

    const redirectTarget = new URL(nextPath, request.url);
    if (redirectTarget.origin !== requestUrl.origin) {
      return NextResponse.redirect(new URL('/home', request.url));
    }
    return NextResponse.redirect(redirectTarget);
  } catch (error) {
    console.error('Supabase callback error:', error);
    return NextResponse.redirect(new URL('/login?error=callback_failed', request.url));
  }
}
