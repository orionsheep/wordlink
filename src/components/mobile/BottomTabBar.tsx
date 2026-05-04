'use client';

import React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useSettings } from '@/context/SettingsContext';

interface Tab {
  key: string;
  labelKey: string;
  path: string;
  icon: React.ReactNode;
}

interface BottomTabBarProps {
  forceShow?: boolean;
}

const tabs: Tab[] = [
  {
    key: 'home',
    labelKey: 'nav.home',
    path: '/',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
    ),
  },
  {
    key: 'quiz',
    labelKey: 'nav.quiz',
    path: '/quiz',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
  {
    key: 'history',
    labelKey: 'nav.history',
    path: '/history',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <polyline points="12 8 12 12 14 14" />
        <path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5" />
      </svg>
    ),
  },
  {
    key: 'dashboard',
    labelKey: 'nav.statistics',
    path: '/dashboard',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    key: 'settings',
    labelKey: 'nav.settings',
    path: '/settings',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

function isActiveTab(tabPath: string, currentPath: string): boolean {
  if (tabPath === '/') {
    return currentPath === '/' || currentPath.startsWith('/word/') || currentPath.startsWith('/graph/');
  }
  if (tabPath === '/history') {
    return currentPath === '/history';
  }
  return currentPath === tabPath || currentPath.startsWith(tabPath + '/');
}

export default function BottomTabBar({ forceShow = false }: BottomTabBarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations();
  const { showBottomNav } = useSettings();

  // If forceShow is true, ignore showBottomNav state
  const isVisible = forceShow || showBottomNav;

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 z-50 bg-[#0a0a0a] border-t border-neutral-800 transition-transform duration-300 ease-in-out ${
        isVisible ? 'translate-y-0' : 'translate-y-full'
      }`}
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-hidden={!isVisible}
    >
      <div className="flex items-center justify-around h-14">
        {tabs.map((tab) => {
          const active = isActiveTab(tab.path, pathname);
          return (
            <button
              key={tab.key}
              onClick={() => router.push(tab.path)}
              className={`flex flex-col items-center justify-center flex-1 h-full min-w-[48px] min-h-[48px] transition-colors duration-200 ${
                active ? 'text-blue-400' : 'text-neutral-500'
              }`}
              aria-label={t(tab.labelKey)}
              aria-current={active ? 'page' : undefined}
            >
              {tab.icon}
              <span className="text-[10px] mt-0.5 leading-tight">{t(tab.labelKey)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
