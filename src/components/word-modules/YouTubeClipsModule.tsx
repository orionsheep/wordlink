'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MODULE_REGISTRY, type WordModuleProps } from '@/types/modules';
import { ExternalLink, Youtube } from 'lucide-react';
import ModuleAccordion from './ModuleAccordion';

interface YouTubeClipsModuleProps extends WordModuleProps {
  collapsed: boolean;
  onToggle: () => void;
}

type Accent = 'all' | 'us' | 'uk' | 'aus';
type Status = 'idle' | 'loading' | 'ready' | 'error';

type YouGlishWidget = {
  destroy?: () => void;
  fetch?: (query: string, language?: string, accent?: string) => void;
  replay?: () => void;
  next?: () => void;
  previous?: () => void;
};
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
  const [totalClips, setTotalClips] = useState<number | null>(null);
  const widgetRef = useRef<YouGlishWidget | null>(null);
  const mountId = `youglish-${useId().replace(/:/g, '')}`;

  useEffect(() => {
    widgetRef.current?.destroy?.();
    widgetRef.current = null;
    const resetTimer = window.setTimeout(() => {
      setStatus(collapsed ? 'idle' : 'loading');
      setTotalClips(null);
    }, 0);
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
          autoStart: 0,
          components: 92, // Video + Subtitles + Navigation controls
          events: {
            onFetchDone: (event: { totalResult?: number }) => {
              if (!disposed && event?.totalResult !== undefined) {
                setTotalClips(event.totalResult);
              }
            },
            onError: () => {
              if (!disposed) setStatus('error');
            },
          },
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

    // 8-second timeout for international network
    timeoutId.value = window.setTimeout(onError, 8000);

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

  const externalUrl = `https://youglish.com/pronounce/${encodeURIComponent(word)}/english/${accent === 'all' ? '' : accent}`;

  return (
    <ModuleAccordion meta={MODULE_REGISTRY.youtube_clips} collapsed={collapsed} onToggle={onToggle}>
      <div className="space-y-3">
        {/* Accent Selector & External Jump Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800/80 pb-2.5">
          <div className="flex items-center gap-1.5 rounded-lg bg-neutral-900/90 p-1 border border-neutral-800">
            <span className="flex items-center gap-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-red-500">
              <Youtube size={14} className="fill-current" />
              <span>YouTube</span>
            </span>
            {(['all', 'us', 'uk', 'aus'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={accent === value}
                onClick={() => setAccent(value)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                  accent === value
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                {value === 'all' ? '全部口音' : value === 'us' ? '美音 US' : value === 'uk' ? '英音 UK' : '澳音 AUS'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {totalClips !== null && (
              <span className="text-xs font-mono text-neutral-500">
                共 {totalClips.toLocaleString()} 个真实视频片段
              </span>
            )}
            <a
              href={externalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-neutral-400 hover:text-red-400 transition-colors"
              title="在 YouGlish 网页版打开"
            >
              <span>网页版</span>
              <ExternalLink size={12} />
            </a>
          </div>
        </div>

        {/* Video Player Box (Fixed 16:9 Aspect Ratio) */}
        <div
          id={mountId}
          className="relative overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 shadow-inner"
          style={{ aspectRatio: '16 / 9' }}
          aria-live="polite"
        >
          {status === 'loading' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-neutral-950 p-4 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 text-red-500 animate-pulse">
                <Youtube size={24} />
              </div>
              <p className="text-xs font-medium text-neutral-300">正在按需加载 YouTube 真人演讲与例句视频...</p>
              <p className="text-[11px] text-neutral-600">包含英美各界名家在 TED / 纪录片中的母语发音切片</p>
            </div>
          )}

          {status === 'idle' && (
            <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-neutral-500">
              {t('youtube_clips.expandToLoad')}
            </div>
          )}

          {status === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center bg-neutral-950/90 backdrop-blur-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                <Youtube size={20} />
              </div>
              <div>
                <p className="text-sm font-medium text-neutral-200">YouTube 视频切片连接受限</p>
                <p className="mt-1 text-xs text-neutral-500 max-w-sm">
                  海外或开启科学上网后可直接内嵌播放；您也可以直接在新标签页打开网页版：
                </p>
              </div>
              <a
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white hover:bg-red-500 transition-colors shadow-lg shadow-red-600/30"
                href={externalUrl}
                target="_blank"
                rel="noreferrer"
              >
                <span>在新标签页打开 YouGlish 视频</span>
                <ExternalLink size={13} />
              </a>
            </div>
          )}
        </div>
      </div>
    </ModuleAccordion>
  );
}
