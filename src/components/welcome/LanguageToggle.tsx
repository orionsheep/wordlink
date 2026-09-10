'use client';

import { useTransition } from 'react';
import { useLocale } from 'next-intl';
import { Globe } from 'lucide-react';

/**
 * Landing 页专用的紧凑语言切换胶囊(EN / 中)。
 * 与 Settings 页 LanguageSwitcher 同一机制:写 NEXT_LOCALE cookie 后刷新;
 * 已登录用户同步落库,游客仅写 cookie(接口失败静默兜底)。
 */
export default function LanguageToggle() {
    const [isPending, startTransition] = useTransition();
    const locale = useLocale();

    const switchTo = (next: 'en' | 'zh') => {
        if (next === locale) return;
        startTransition(async () => {
            try {
                await fetch('/api/user/language', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ language: next }),
                    credentials: 'include',
                });
            } catch {
                // 游客或网络异常时仅写 cookie
            }
            document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000`;
            window.location.reload();
        });
    };

    return (
        <div
            className={`flex items-center gap-1 rounded-full border border-white/15 bg-black/40 p-0.5 text-[11px] font-medium backdrop-blur-md transition-opacity ${
                isPending ? 'opacity-50' : ''
            }`}
            role="group"
            aria-label="Language / 语言"
        >
            <Globe size={12} className="ml-1.5 text-white/50" />
            <button
                onClick={() => switchTo('en')}
                className={`rounded-full px-2 py-1 transition-colors ${
                    locale === 'en' ? 'bg-white text-black' : 'text-white/60 hover:text-white'
                }`}
            >
                EN
            </button>
            <button
                onClick={() => switchTo('zh')}
                className={`rounded-full px-2 py-1 transition-colors ${
                    locale === 'zh' ? 'bg-white text-black' : 'text-white/60 hover:text-white'
                }`}
            >
                中
            </button>
        </div>
    );
}
