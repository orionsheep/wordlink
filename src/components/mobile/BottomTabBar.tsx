'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BookOpenText, Home, MoonStar, ScanText } from 'lucide-react';
import { useSettings } from '@/context/SettingsContext';

interface BottomTabBarProps { forceShow?: boolean; }
const tabs = [
  { key: 'home', path: '/home', icon: Home },
  { key: 'study', path: '/study', icon: BookOpenText },
  { key: 'read', path: '/read', icon: BookOpenText },
  { key: 'quiz', path: '/quiz', icon: ScanText },
  { key: 'ambient', path: '/ambient', icon: MoonStar },
];

export default function BottomTabBar({ forceShow = false }: BottomTabBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations('mobile.tabs');
  const { showBottomNav } = useSettings();
  const visible = forceShow || showBottomNav;
  return <nav className={`fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#080b0d]/95 backdrop-blur-xl ${visible ? 'translate-y-0' : 'translate-y-full'}`} style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} aria-hidden={!visible}>
    <div className="flex h-14 items-center justify-around overflow-x-auto px-1">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const label = t(tab.key);
        const active = pathname === tab.path || pathname.startsWith(`${tab.path}/`);
        return <button key={tab.key} onClick={() => router.push(tab.path)} className={`flex min-w-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] transition ${active ? 'text-cyan-300' : 'text-white/45 hover:text-white/80'}`} aria-label={label} aria-current={active ? 'page' : undefined}><Icon size={18} strokeWidth={1.8} /><span>{label}</span></button>;
      })}
    </div>
  </nav>;
}
