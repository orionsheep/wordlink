'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MODULE_REGISTRY, type WordModuleProps } from '@/types/modules';
import ModuleAccordion from './ModuleAccordion';

interface YouTubeClipsModuleProps extends WordModuleProps {
  collapsed: boolean;
  onToggle: () => void;
}

type Accent = 'all' | 'us' | 'uk';
type Status = 'idle' | 'loading' | 'ready' | 'error';

type YouGlishWidget = { destroy?: () => void };
type YouGlishApi = { Widget?: new (elementId: string, options: Record<string, unknown>) => YouGlishWidget };

declare global {
  interface Window {
    YG?: YouGlishApi;
  }
}

const SCRIPT_SELECTOR = 'script[data-wordlink-youglish]';

export default function YouTubeClipsModule({ word, collapsed, onToggle }: YouTubeClipsModuleProps) {
  const t = useTranslations('modules');
  const [accent, setAccent] = useState<Accent>('all');
  const [status, setStatus] = useState<Status>('idle');
  const widgetRef = useRef<YouGlishWidget | null>(null);
  const mountId = `youglish-${useId().replace(/:/g, '')}`;

  useEffect(() => {
    // A word/accent change gets a fresh widget, while a closed accordion does
    // not load any third-party code.
    widgetRef.current?.destroy?.();
    widgetRef.current = null;
    const resetTimer = window.setTimeout(() => setStatus(collapsed ? 'idle' : 'loading'), 0);
    if (collapsed) return () => window.clearTimeout(resetTimer);

    let disposed = false;
    const script = document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR) || document.createElement('script');
    const timeoutId = { value: 0 };
    const onLoad = () => {
      if (disposed) return;
      window.clearTimeout(timeoutId.value);
      const Widget = window.YG?.Widget;
      if (!Widget) {
        setStatus('error');
        return;
      }
      try {
        widgetRef.current = new Widget(mountId, {
          word,
          accent: accent === 'all' ? 'all' : accent,
          events: { onFetchDone: () => undefined },
        });
      } catch {
        setStatus('error');
        return;
      }
      setStatus('ready');
    };
    const onError = () => {
      window.clearTimeout(timeoutId.value);
      if (!disposed) setStatus('error');
    };
    timeoutId.value = window.setTimeout(onError, 10000);

    const alreadyLoaded = script.dataset.wordlinkLoaded === 'true';
    script.addEventListener('load', onLoad, { once: true });
    script.addEventListener('error', onError, { once: true });
    if (!script.src) {
      script.src = 'https://youglish.com/public/emb/widget.js';
      script.async = true;
      script.dataset.wordlinkYouglish = 'true';
      script.addEventListener('load', () => { script.dataset.wordlinkLoaded = 'true'; }, { once: true });
      document.head.appendChild(script);
    } else if (alreadyLoaded || window.YG?.Widget) {
      window.setTimeout(onLoad, 0);
    }

    return () => {
      disposed = true;
      window.clearTimeout(timeoutId.value);
      window.clearTimeout(resetTimer);
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
      widgetRef.current?.destroy?.();
      widgetRef.current = null;
    };
  }, [word, accent, collapsed, mountId]);

  const externalUrl = `https://youglish.com/pronounce/${encodeURIComponent(word)}/english`;
  return (
    <ModuleAccordion meta={MODULE_REGISTRY.youtube_clips} collapsed={collapsed} onToggle={onToggle}>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('youtube_clips.accent')}>
          {(['all', 'us', 'uk'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={accent === value}
              onClick={() => setAccent(value)}
              className={`rounded-md px-3 py-1.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${accent === value ? 'bg-blue-600 text-white' : 'bg-neutral-900 text-neutral-400 hover:text-white'}`}
            >
              {value === 'all' ? t('youtube_clips.all') : value.toUpperCase()}
            </button>
          ))}
        </div>
        <div
          id={mountId}
          className="relative overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950"
          style={{ aspectRatio: '16 / 9' }}
          aria-live="polite"
        >
          {status === 'loading' && <div className="absolute inset-0 animate-pulse bg-neutral-900" aria-label={t('youtube_clips.loading')} />}
          {status === 'idle' && <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-neutral-500">{t('youtube_clips.expandToLoad')}</div>}
          {status === 'ready' && !(typeof window !== 'undefined' && window.YG?.Widget) && <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-neutral-500">{t('youtube_clips.readyFallback')}</div>}
          {status === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-sm text-neutral-400">
              <p>{t('youtube_clips.error')}</p>
              <a className="text-blue-400 underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" href={externalUrl} target="_blank" rel="noreferrer">{t('youtube_clips.openExternal')}</a>
            </div>
          )}
        </div>
      </div>
    </ModuleAccordion>
  );
}
