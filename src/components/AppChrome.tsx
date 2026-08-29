'use client';

import { usePathname } from 'next/navigation';
import AppRail from '@/components/home/AppRail';
import BottomTabBar from '@/components/mobile/BottomTabBar';

const SHELL_PREFIXES = [
  '/home',
  '/dashboard',
  '/history',
  '/navigator',
  '/passport',
  '/my-libraries',
  '/settings',
];

function matches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** Shared application chrome for tool-like authenticated pages. */
export default function AppChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const enabled = SHELL_PREFIXES.some((prefix) => matches(pathname, prefix));
  if (!enabled) return <>{children}</>;

  const isHome = matches(pathname, '/home');
  const mobileBar = !matches(pathname, '/dashboard') && !matches(pathname, '/history') && !matches(pathname, '/settings');

  return (
    <>
      <div className={isHome ? '' : 'md:pl-[60px]'}>{children}</div>
      {!isHome && <div className="hidden md:block"><AppRail /></div>}
      {mobileBar && <div className="md:hidden"><BottomTabBar forceShow /></div>}
    </>
  );
}
