'use client';

import { useState } from 'react';
import { MODULE_REGISTRY, type WordModuleProps } from '@/types/modules';
import { ExternalLink, RefreshCw, Youtube } from 'lucide-react';
import ModuleAccordion from './ModuleAccordion';

interface YouTubeClipsModuleProps extends WordModuleProps {
  collapsed: boolean;
  onToggle: () => void;
}

type Accent = 'all' | 'us' | 'uk' | 'aus';

export default function YouTubeClipsModule({ word, collapsed, onToggle }: YouTubeClipsModuleProps) {
  const [accent, setAccent] = useState<Accent>('all');
  const [iframeKey, setIframeKey] = useState(0);
  const [loading, setLoading] = useState(true);

  if (!word) return null;

  const accentParam = accent === 'all' ? '' : `&accent=${accent}`;
  const embedUrl = `https://youglish.com/embed/${encodeURIComponent(word)}?components=92&auto_start=0${accentParam}`;
  const externalUrl = `https://youglish.com/pronounce/${encodeURIComponent(word)}/english/${accent === 'all' ? '' : accent}`;

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
                  setLoading(true);
                  setIframeKey((prev) => prev + 1);
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
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setIframeKey((prev) => prev + 1);
              }}
              className="p-1.5 text-neutral-500 hover:text-white rounded-md hover:bg-neutral-800 transition-colors"
              title="重新加载视频"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
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

        {/* Video Player Box (Fixed 16:9 Aspect Ratio) */}
        <div
          className="relative overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 shadow-inner"
          style={{ aspectRatio: '16 / 9' }}
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

          {!collapsed && (
            <iframe
              key={`youglish-${word}-${accent}-${iframeKey}`}
              src={embedUrl}
              title={`YouTube Clips for ${word}`}
              className="w-full h-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              onLoad={() => setLoading(false)}
            />
          )}
        </div>
      </div>
    </ModuleAccordion>
  );
}
