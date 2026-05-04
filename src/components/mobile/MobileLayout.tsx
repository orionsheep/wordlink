'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import BottomTabBar from './BottomTabBar';
import { useSettings } from '@/context/SettingsContext';

interface MobileLayoutProps {
  children: React.ReactNode;
}

export default function MobileLayout({ children }: MobileLayoutProps) {
  const { showBottomNav, toggleBottomNav } = useSettings();
  const pathname = usePathname();

  // Determine if toggle button should be shown
  const isHomePage = pathname === '/' || pathname.startsWith('/word/') || pathname.startsWith('/graph/');
  const isQuizPage = pathname.startsWith('/quiz');
  const shouldShowToggleButton = isHomePage || isQuizPage;

  return (
    <div className="flex flex-col h-[100dvh] relative">
      {/* Toggle button - only show on home and quiz pages */}
      {shouldShowToggleButton && (
        <button
          onClick={toggleBottomNav}
          className="fixed top-2 left-1/2 -translate-x-1/2 z-50 bg-neutral-800/90 backdrop-blur-sm text-white px-3 py-1.5 rounded-full text-xs shadow-lg transition-all duration-200 hover:bg-neutral-700"
          aria-label={showBottomNav ? '隐藏导航栏' : '显示导航栏'}
        >
          {showBottomNav ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          )}
        </button>
      )}

      {/* Content area - adjust padding based on page type and nav visibility */}
      <div className={`flex-1 overflow-auto transition-all duration-300 ${
        shouldShowToggleButton
          ? (showBottomNav ? 'pb-14' : 'pb-0')  // Home/quiz pages: conditional padding
          : 'pb-14'  // Other pages: always show padding
      }`}>
        {children}
      </div>

      <BottomTabBar forceShow={!shouldShowToggleButton} />
    </div>
  );
}
