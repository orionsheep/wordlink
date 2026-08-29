'use client';

import { usePathname, useRouter } from 'next/navigation';
import { BookOpenText, Home, MoonStar, ScanText } from 'lucide-react';
import { useSettings } from '@/context/SettingsContext';

interface BottomTabBarProps { forceShow?: boolean; }
const tabs = [
  { key: 'home', label: '主页', path: '/home', icon: Home },
  { key: 'study', label: '星图', path: '/study', icon: BookOpenText },
  { key: 'read', label: '精读', path: '/read', icon: BookOpenText },
  { key: 'quiz', label: '测验', path: '/quiz', icon: ScanText },
  { key: 'ambient', label: '屏保', path: '/ambient', icon: MoonStar },
];

export default function BottomTabBar({ forceShow = false }: BottomTabBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { showBottomNav } = useSettings();
  const visible = forceShow || showBottomNav;
  return <nav className={`fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#080b0d]/95 backdrop-blur-xl ${visible ? 'translate-y-0' : 'translate-y-full'}`} style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} aria-hidden={!visible}>
    <div className="flex h-14 items-center justify-around overflow-x-auto px-1">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = pathname === tab.path || pathname.startsWith(`${tab.path}/`);
        return <button key={tab.key} onClick={() => router.push(tab.path)} className={`flex min-w-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-[10px] transition ${active ? 'text-cyan-300' : 'text-white/45 hover:text-white/80'}`} aria-label={tab.label} aria-current={active ? 'page' : undefined}><Icon size={18} strokeWidth={1.8} /><span>{tab.label}</span></button>;
      })}
    </div>
  </nav>;
}
