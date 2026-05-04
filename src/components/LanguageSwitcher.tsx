'use client';

import { useTransition } from 'react';
import { useLocale } from 'next-intl';
import { Globe } from 'lucide-react';

export default function LanguageSwitcher() {
  const [isPending, startTransition] = useTransition();
  const locale = useLocale();

  const switchLanguage = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLocale = e.target.value;

    startTransition(async () => {
      try {
        // Update language preference in database
        await fetch('/api/user/language', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language: newLocale }),
          credentials: 'include'
        });

        // Reload page to apply new locale
        window.location.reload();
      } catch (error) {
        console.error('Failed to update language preference:', error);
        // Fallback: just set cookie and reload
        document.cookie = `NEXT_LOCALE=${newLocale}; path=/; max-age=31536000`;
        window.location.reload();
      }
    });
  };

  return (
    <div className="flex items-center justify-between w-full py-2">
      <div className="flex items-center gap-2">
        <Globe className="w-4 h-4 text-neutral-400" />
        <span className="text-sm font-medium text-neutral-300">
          Language / 语言
        </span>
      </div>
      <select
        value={locale}
        onChange={switchLanguage}
        disabled={isPending}
        className="bg-neutral-800 text-neutral-300 text-sm rounded-lg px-3 py-1.5 border border-neutral-700 focus:border-blue-500 focus:outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-750 transition-colors"
      >
        <option value="zh">中文</option>
        <option value="en">English</option>
      </select>
    </div>
  );
}
