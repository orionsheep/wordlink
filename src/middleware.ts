import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
    let response = NextResponse.next({ request });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !anonKey) {
        return response;
    }

    const supabase = createServerClient(url, anonKey, {
        cookies: {
            getAll() {
                return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
                cookiesToSet.forEach(({ name, value }) => {
                    request.cookies.set(name, value);
                });
                response = NextResponse.next({ request });
                cookiesToSet.forEach(({ name, value, options }) => {
                    response.cookies.set(name, value, options);
                });
            },
        },
    });

    try {
        // Refresh the SSR session cookie. Authorization remains enforced by
        // individual Route Handlers so public pages keep their current flow.
        await supabase.auth.getUser();
    } catch (error) {
        console.warn('Supabase middleware session refresh failed:', error);
    }

    return response;
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes) -> actually we WANT to protect API routes too, except auth ones
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};
