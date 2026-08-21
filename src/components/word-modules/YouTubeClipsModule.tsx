'use client';

import { useEffect, useRef, useState } from 'react';
import { MODULE_REGISTRY, type WordModuleProps } from '@/types/modules';
import { ExternalLink, RefreshCw, Youtube, Play, AlertCircle } from 'lucide-react';
import ModuleAccordion from './ModuleAccordion';

interface YouTubeClipsModuleProps extends WordModuleProps {
  collapsed: boolean;
  onToggle: () => void;
}

type Accent = 'all' | 'us' | 'uk' | 'aus';

declare global {
  interface Window {
    YG?: {
      Widget: new (
        elementOrId: string | HTMLElement,
        options: {
          width?: number | string;
          components?: number;
          auto_start?: number;
          scroll?: number;
          backgroundColor?: string;
          accent?: string;
          events?: {
            onFetchDone?: (event: { totalResult: number }) => void;
            onVideoChange?: (event: { currentResult: number; totalResult: number }) => void;
            onCaptionChange?: (event: any) => void;
            onError?: (event: { code: number }) => void;
          };
        }
      ) => {
        fetch: (query: string, language: string, accent?: string) => void;
        close: () => void;
        replay: () => void;
        next: () => void;
        previous: () => void;
      };
    };
  }
}

export default function YouTubeClipsModule({ word, collapsed, onToggle }: YouTubeClipsModuleProps) {
  const [accent, setAccent] = useState<Accent>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalClips, setTotalClips] = useState<number | null>(null);
  const [currentClipIndex, setCurrentClipIndex] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetInstanceRef = useRef<any>(null);
  const containerId = 'youglish-widget-player-container';

  const externalUrl = `https://youglish.com/pronounce/${encodeURIComponent(word || '')}/english/${accent === 'all' ? '' : accent}`;

  useEffect(() => {
    if (collapsed || !word) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    const initWidget = () => {
      if (!isMounted || !window.YG || !containerRef.current) return;

      try {
        // Clean up previous instance if any
        if (widgetInstanceRef.current && typeof widgetInstanceRef.current.close === 'function') {
          try {
            widgetInstanceRef.current.close();
          } catch {}
        }

        const widget = new window.YG.Widget(containerRef.current, {
          width: '100%',
          components: 92, // Search title + player + controls
          auto_start: 0,
          backgroundColor: '#0a0a0a',
          events: {
            onFetchDone: (event) => {
              if (!isMounted) return;
              setLoading(false);
              if (event && typeof event.totalResult === 'number') {
                setTotalClips(event.totalResult);
                if (event.totalResult === 0) {
                  setError(`未找到 “${word}” 的 YouTube 语境视频切片`);
                }
              }
            },
            onVideoChange: (event) => {
              if (!isMounted) return;
              setLoading(false);
              if (event && typeof event.currentResult === 'number') {
                setCurrentClipIndex(event.currentResult);
              }
            },
            onError: (err) => {
              if (!isMounted) return;
              setLoading(false);
              setError('视频切片加载失败，可能是网络策略或无视频匹配');
            },
          },
        });

        widgetInstanceRef.current = widget;
        const targetAccent = accent === 'all' ? undefined : accent;
        widget.fetch(word, 'english', targetAccent);
      } catch (err) {
        if (!isMounted) return;
        setLoading(false);
        setError('YouGlish 播放器初始化异常');
      }
    };

    if (window.YG) {
      initWidget();
    } else {
      const existingScript = document.getElementById('youglish-widget-script');
      if (existingScript) {
        existingScript.addEventListener('load', initWidget, { once: true });
      } else {
        const script = document.createElement('script');
        script.id = 'youglish-widget-script';
        script.src = 'https://youglish.com/public/emb/widget.js';
        script.async = true;
        script.onload = initWidget;
        script.onerror = () => {
          if (!isMounted) return;
          setLoading(false);
          setError('无法加载 YouGlish 官方播放器组件 (可能需要梯子/VPN)');
        };
        document.body.appendChild(script);
      }
    }

    return () => {
      isMounted = false;
    };
  }, [word, accent, collapsed]);

  if (!word) return null;

  return (
    <ModuleAccordion meta={MODULE_REGISTRY.youtube_clips} collapsed={collapsed} onToggle={onToggle}>
      <div className="space-y-3">
        {/* Header: Accent switcher & external link */}
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
                onClick={() => {
                  setAccent(value);
                }}
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
            {totalClips !== null && totalClips > 0 && (
              <span className="text-xs text-neutral-400">
                例句切片: <span className="font-mono text-white">{currentClipIndex}</span> / {totalClips}
              </span>
            )}
            <a
              href={externalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-400 hover:text-white hover:border-neutral-700 transition-colors"
              title="在 YouGlish / YouTube 网页版打开"
            >
              <span>网页版</span>
              <ExternalLink size={11} />
            </a>
          </div>
        </div>

        {/* Video Player Box */}
        <div
          className="relative min-h-[360px] overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 shadow-inner flex flex-col items-center justify-center p-2"
        >
          {loading && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-neutral-950 p-4 text-center">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 text-red-500 animate-pulse">
                <Youtube size={24} />
              </div>
              <p className="text-xs font-medium text-neutral-300">正在载入 “{word}” 的 YouTube 真实演讲例句切片...</p>
              <p className="text-[11px] text-neutral-500">自动同步英文字幕与时间轴</p>
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
              <AlertCircle size={28} className="text-amber-500/80" />
              <div className="space-y-1">
                <p className="text-xs font-medium text-neutral-300">{error}</p>
                <p className="text-[11px] text-neutral-500">播放器直连失败，可点击下方按钮直接跳转至 YouTube/YouGlish 网页端播放</p>
              </div>
              <a
                href={externalUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-medium text-white shadow-lg hover:bg-red-500 transition-all"
              >
                <Play size={13} className="fill-current" />
                <span>在 YouTube 网页版观看 “{word}” 例句</span>
              </a>
            </div>
          )}

          {/* YouGlish Widget Container */}
          <div
            id={containerId}
            ref={containerRef}
            className={`w-full flex justify-center ${loading || error ? 'invisible h-0' : 'visible min-h-[340px]'}`}
          />
        </div>
      </div>
    </ModuleAccordion>
  );
}
