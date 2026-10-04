import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { extractAccessToken, getJwtExpiry } from '@/lib/supabase/token';

// Refresh the session via Supabase when the access token is this close to
// expiry — otherwise navigation proceeds without an auth round-trip.
const REFRESH_WINDOW_MS = 60_000;

export async function middleware(request: NextRequest) {
    let response = NextResponse.next({ request });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const { pathname } = request.nextUrl;

    // API 与静态资源不做会话刷新（API 路由各自调用 getSession 校验）
    const lastSegment = pathname.split('/').pop() || '';
    if (pathname.startsWith('/api/') || lastSegment.includes('.')) {
        return response;
    }

    // 兼容旧链接：/welcome 已升级为首页 Landing Page（/）
    if (pathname === '/welcome' || pathname.startsWith('/welcome/')) {
        return NextResponse.redirect(new URL('/', request.url));
    }

    // / 为公开 Landing Page；/study, /immersive, /graph, /ambient, /read, /passport, /navigator, /quiz, /model 为免登体验（展位演示与评审体验）；应用内数据操作按需校验
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
        pathname === '/model' ||
        pathname.startsWith('/quiz');

    const isAuthPage = ['/login', '/reset-password', '/auth'].some(
        (p) => pathname === p || pathname.startsWith(p + '/'),
    );

    // 公开页与认证页无需用户信息做跳转决策 —— 不再付出 Supabase 往返
    if (isPublicPath || isAuthPage) {
        return response;
    }

    // 离线演示模式：服务端会话统一回落到演示账号，页面守卫同步放行
    if (process.env.DEMO_MODE === 'true') {
        return response;
    }

    if (!url || !anonKey) {
        return response;
    }

    // 受保护路径：没有会话 cookie 直接跳登录，省掉一次远程校验
    const accessToken = extractAccessToken(request.cookies.getAll());
    if (!accessToken) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    // token 远未过期：跳过 getUser() 的 Supabase 网络往返，直接放行。
    // API 层仍会对每次数据操作做真实校验，这里只是页面级守卫。
    const exp = getJwtExpiry(accessToken);
    if (exp !== null && exp * 1000 - Date.now() > REFRESH_WINDOW_MS) {
        return response;
    }

    // token 临近过期/不可解析：交给 Supabase 刷新并写回新 cookie
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

    let user = null;
    try {
        const { data } = await supabase.auth.getUser();
        user = data?.user ?? null;
    } catch (error) {
        console.warn('Supabase middleware session refresh failed:', error);
    }

    if (!user) {
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
         * - public asset folders and common file extensions (videos, images, fonts)
         */
        '/((?!_next/static|_next/image|favicon.ico|videos/|images/|ambient/|templates/|fonts/|.*\\.(?:png|jpe?g|gif|webp|avif|svg|ico|mp4|webm|mov|json|txt|xml|webmanifest|woff2?|ttf|otf|css|js|map)).*)',
    ],
};
