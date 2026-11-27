import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { extractAccessToken, getJwtExpiry } from '@/lib/supabase/token';

// Refresh the session via Supabase when the access token is this close to
// expiry — otherwise navigation proceeds without an auth round-trip.
const REFRESH_WINDOW_MS = 60_000;

function base64UrlToBytes(input: string): Uint8Array | null {
    try {
        const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (input.length % 4)) % 4);
        const binary = atob(padded);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    } catch {
        return null;
    }
}

/**
 * Edge 兼容的本地 HS256 JWT 验签（仅当配置了 SUPABASE_JWT_SECRET 时启用），
 * 防止伪造未来 exp 的 JWT 绕过受保护页面守卫，同时避免额外网络往返。
 */
async function verifyHs256Jwt(token: string, secret: string): Promise<boolean> {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    try {
        const headerBytes = base64UrlToBytes(parts[0]);
        const sigBytes = base64UrlToBytes(parts[2]);
        if (!headerBytes || !sigBytes) return false;
        const header = JSON.parse(new TextDecoder().decode(headerBytes)) as { alg?: string };
        if (header?.alg !== 'HS256') return false;

        const key = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['verify'],
        );
        const signingInput = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
        return await crypto.subtle.verify('HMAC', key, sigBytes as BufferSource, signingInput);
    } catch {
        return false;
    }
}

// 跳转地址按浏览器实际访问的域名拼：`next start -H 127.0.0.1` 时 request.url 的主机是
// 监听地址（localhost:3011），直接用会把用户带到 localhost。nginx 会传 Host / X-Forwarded-Proto。
function redirectTo(request: NextRequest, pathname: string) {
    const host = request.headers.get('host');
    const proto = request.headers.get('x-forwarded-proto') || request.nextUrl.protocol.replace(/:$/, '');
    return NextResponse.redirect(new URL(pathname, host ? `${proto}://${host}` : request.url));
}

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
        return redirectTo(request, '/');
    }

    // 兼容旧链接：认知导航已下线，转到星图工作台（查词在左侧词表）
    if (pathname === '/navigator') {
        return redirectTo(request, '/study');
    }

    // / 为公开 Landing Page；/study, /immersive, /graph, /ambient, /read, /passport, /quiz, /model 为免登体验（展位演示与评审体验）；应用内数据操作按需校验
    const isPublicPath =
        pathname === '/' ||
        pathname === '/study' ||
        pathname === '/immersive' ||
        pathname.startsWith('/graph') ||
        pathname === '/ambient' ||
        pathname === '/read' ||
        pathname.startsWith('/read/') ||
        pathname === '/passport' ||
        pathname === '/model' ||
        pathname === '/pricing' ||
        pathname.startsWith('/pay/return') ||
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
        return redirectTo(request, '/login');
    }

    // token 远未过期且已通过本地 HS256 签名校验时直接放行，免去 Supabase 往返；
    // 未配置 SUPABASE_JWT_SECRET 或临近过期/验签失败时，交由 Supabase getUser() 做真实校验。
    const exp = getJwtExpiry(accessToken);
    const jwtSecret = process.env.SUPABASE_JWT_SECRET;
    if (
        jwtSecret &&
        exp !== null &&
        exp * 1000 - Date.now() > REFRESH_WINDOW_MS &&
        (await verifyHs256Jwt(accessToken, jwtSecret))
    ) {
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
        return redirectTo(request, '/login');
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
