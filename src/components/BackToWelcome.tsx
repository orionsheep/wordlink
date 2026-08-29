'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House } from 'lucide-react';

// 这些页面不显示全局返回按钮：主应用、欢迎层、认证页、管理后台、屏保模式
const HIDDEN_PREFIXES = ['/welcome', '/home', '/login', '/reset-password', '/auth', '/admin', '/ambient'];

/**
 * 全局「回欢迎页」悬浮按钮：
 * 挂在根 layout 上，除主应用 / 欢迎页 / 认证页外，
 * 所有功能页与子页面（dashboard、navigator、quiz、word、graph…）自动可见。
 */
export default function BackToWelcome() {
    const pathname = usePathname();

    if (pathname === '/') return null;
    if (HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
        return null;
    }

    return (
        <Link
            href="/welcome"
            aria-label="回到欢迎页"
            title="回到欢迎页"
            className="fixed bottom-5 right-5 z-[70] flex items-center gap-2 rounded-full border border-white/15 bg-black/60 px-4 py-2.5 text-sm text-white/80 shadow-lg backdrop-blur-md transition-all hover:scale-105 hover:bg-black/80 hover:text-white active:scale-95"
        >
            <House size={15} />
            欢迎页
        </Link>
    );
}
