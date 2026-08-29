import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function middleware(request: NextRequest) {
    let response = NextResponse.next({ request });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const { pathname } = request.nextUrl;

    // 刷新 SSR 会话（所有请求都走，保持原有行为）
    let user = null;
    if (url && anonKey) {
        const supabase = createServerClient(url, anonKey, {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value, options }) => {
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
            const { data } = await supabase.auth.getUser();
            user = data?.user ?? null;
        } catch (error) {
            console.warn('Supabase middleware session refresh failed:', error);
        }
    }

    // ---- 页面级路由守卫（API 与静态资源不拦截）----
    const lastSegment = pathname.split('/').pop() || '';
    if (pathname.startsWith('/api/') || lastSegment.includes('.')) {
        return response;
    }

    // 兼容旧链接：/welcome 已升级为首页 Landing Page（/）
    if (pathname === '/welcome' || pathname.startsWith('/welcome/')) {
        return NextResponse.redirect(new URL('/', request.url));
    }

    // / 为公开 Landing Page；/study, /immersive, /graph, /ambient, /read, /passport, /navigator, /quiz 为免登体验（展位演示与评审体验）；应用内数据操作按需校验
    const isPublicPath =
        pathname === '/' ||
        pathname === '/study' ||
        pathname === '/immersive' ||
        pathname.startsWith('/graph') ||
        pathname === '/ambient' ||
        pathname === '/read' ||
        pathname.startsWith('/read/') ||
        pathname === '/passport' ||
        pathname === '/navigator' ||
        pathname.startsWith('/quiz');

    const isAuthPage = ['/login', '/reset-password', '/auth'].some(
        (p) => pathname === p || pathname.startsWith(p + '/'),
    );

    if (url && anonKey && !user && !isPublicPath && !isAuthPage) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    return response;
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};
