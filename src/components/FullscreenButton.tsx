'use client';

import { useSettings } from '@/context/SettingsContext';
import { Maximize, Minimize } from 'lucide-react';

export default function FullscreenButton() {
  const { isFullscreen, toggleFullscreen } = useSettings();

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
      aria-label={isApiFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
    >
      {isApiFullscreen ? (
        <>
          <Minimize className="w-4 h-4" />
          <span>退出全屏</span>
        </>
      ) : (
        <>
          <Maximize className="w-4 h-4" />
          <span>全屏模式</span>
        </>
      )}
    </button>
  );
}
