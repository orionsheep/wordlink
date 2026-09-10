'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BarChart3, BookOpenText, Compass, FileClock, Headphones, LibraryBig, LogOut, MoonStar, ScanText, Settings, ShieldCheck, Waypoints } from 'lucide-react';

const PRIMARY_NAV = [
  { href: '/study', icon: Waypoints, labelKey: 'study' },
  { href: '/read', icon: BookOpenText, labelKey: 'read' },
  { href: '/quiz', icon: ScanText, labelKey: 'quiz' },
  { href: '/ambient', icon: MoonStar, labelKey: 'ambient' },
  { href: '/my-libraries', icon: LibraryBig, labelKey: 'myLibraries' },
];

const INSIGHT_NAV = [
  { href: '/history', icon: FileClock, labelKey: 'history' },
  { href: '/dashboard', icon: BarChart3, labelKey: 'dashboard' },
  { href: '/navigator', icon: Compass, labelKey: 'navigator' },
  { href: '/passport', icon: ShieldCheck, labelKey: 'passport' },
];

const SYSTEM_NAV = [
  { href: '/settings', icon: Settings, labelKey: 'settings' },
  { href: '/', icon: Headphones, labelKey: 'productTour' },
];

export default function AppRail() {
  const pathname = usePathname();
  const t = useTranslations('appRail');
  const isActive = (href: string) => href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } finally {
      window.location.href = '/login';
    }
  };
  const renderItem = (item: (typeof PRIMARY_NAV)[number]) => {
    const Icon = item.icon;
    const active = isActive(item.href);
    const label = t(item.labelKey);
    return <Link key={item.href} href={item.href} title={label} className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all ${active ? 'bg-white/10 text-cyan-300' : 'text-white/40 hover:bg-white/5 hover:text-white/85'}`}>
      {active && <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-cyan-400" />}
      <Icon size={18} strokeWidth={1.8} />
      <span className="pointer-events-none absolute left-[52px] z-50 hidden whitespace-nowrap rounded-lg border border-white/10 bg-black/90 px-2.5 py-1 text-[11px] text-white/85 shadow-xl group-hover:block">{label}</span>
    </Link>;
  };
  return <aside className="fixed inset-y-0 left-0 z-40 flex w-[60px] flex-col items-center border-r border-white/[0.06] bg-[#0a0a0c] py-4">
    <Link href="/home" title={t('home')} className="mb-5 flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/5 font-serif italic text-base text-white transition-colors hover:border-white/40" style={{ fontFamily: "'Instrument Serif', serif" }}>L</Link>
    <nav className="flex flex-col items-center gap-1.5">{PRIMARY_NAV.map(renderItem)}</nav>
    <div className="my-4 h-px w-7 bg-white/10" />
    <nav className="flex flex-col items-center gap-1.5">{INSIGHT_NAV.map(renderItem)}</nav>
    <div className="mt-auto flex flex-col items-center gap-1.5">
      {SYSTEM_NAV.map(renderItem)}
      <div className="my-3 h-px w-7 bg-white/10" />
      <button type="button" onClick={handleLogout} title={t('logout')} className="group relative flex h-10 w-10 items-center justify-center rounded-xl text-white/40 transition-all hover:bg-rose-400/10 hover:text-rose-300">
        <LogOut size={18} strokeWidth={1.8} />
        <span className="pointer-events-none absolute left-[52px] z-50 hidden whitespace-nowrap rounded-lg border border-white/10 bg-black/90 px-2.5 py-1 text-[11px] text-white/85 shadow-xl group-hover:block">{t('logout')}</span>
      </button>
    </div>
  </aside>;
}
