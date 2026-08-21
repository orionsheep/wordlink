'use client';

import { useSettings } from '@/context/SettingsContext';
import { Maximize, Minimize } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function FullscreenButton() {
  const { isFullscreen, toggleFullscreen } = useSettings();
  const t = useTranslations();

  const isApiFullscreen = typeof document !== 'undefined' && isFullscreen && !!(
    document.fullscreenElement ||
    (document as any).webkitFullscreenElement ||
    (document as any).mozFullScreenElement ||
    (document as any).msFullscreenElement
  );

  return (
    <button
      onClick={toggleFullscreen}
      className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-300 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors"
      aria-label={isApiFullscreen ? (t('settings.exitFullscreen') || 'Exit Fullscreen') : (t('settings.fullscreen') || 'Fullscreen')}
    >
      {isApiFullscreen ? (
        <>
          <Minimize className="w-4 h-4" />
          <span>{t('settings.exitFullscreen') || 'Exit Fullscreen'}</span>
        </>
      ) : (
        <>
          <Maximize className="w-4 h-4" />
          <span>{t('settings.fullscreen') || 'Fullscreen'}</span>
        </>
      )}
    </button>
  );
}
