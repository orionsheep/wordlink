import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function getSafeNextPath(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/';
  }
  return value;
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const nextPath = getSafeNextPath(requestUrl.searchParams.get('next'));

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', request.url));
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(
        new URL('/login?error=callback_failed', request.url),
      );
    }

    return NextResponse.redirect(new URL(nextPath, request.url));
  } catch (error) {
    console.error('Supabase callback error:', error);
    return NextResponse.redirect(new URL('/login?error=callback_failed', request.url));
  }
}
