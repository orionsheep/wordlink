'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MODULE_REGISTRY, type WordModuleProps } from '@/types/modules';
import { ExternalLink, Film, Globe, Play, Tv, Volume2, WifiOff } from 'lucide-react';
import ModuleAccordion from './ModuleAccordion';

interface YouTubeClipsModuleProps extends WordModuleProps {
  collapsed: boolean;
  onToggle: () => void;
}

type VideoSource = 'youglish' | 'bilibili' | 'native_audio';
type Accent = 'all' | 'us' | 'uk' | 'aus';
type Status = 'idle' | 'loading' | 'ready' | 'error';

type YouGlishWidget = { destroy?: () => void };
type YouGlishApi = { Widget?: new (elementId: string, options: Record<string, unknown>) => YouGlishWidget };

declare global {
  interface Window {
    YG?: YouGlishApi;
  }
}

const SCRIPT_SELECTOR = 'script[data-wordlink-youglish]';

export default function YouTubeClipsModule({ word, chineseData, collapsed, onToggle }: YouTubeClipsModuleProps) {
  const t = useTranslations('modules');
  const [source, setSource] = useState<VideoSource>('youglish');
  const [accent, setAccent] = useState<Accent>('all');
  const [status, setStatus] = useState<Status>('idle');
  const [playingNativeAudio, setPlayingNativeAudio] = useState(false);
  const widgetRef = useRef<YouGlishWidget | null>(null);
  const mountId = `youglish-${useId().replace(/:/g, '')}`;

  // YouGlish Lifecycle Management
  useEffect(() => {
    if (source !== 'youglish') {
      widgetRef.current?.destroy?.();
      widgetRef.current = null;
      return;
    }

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

    // 4.5 second timeout to quickly catch Mainland China GFW blocks
    timeoutId.value = window.setTimeout(onError, 4500);

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
  }, [word, accent, collapsed, mountId, source]);

  const playSentenceAudio = (sentence: string) => {
    if (!sentence || typeof window === 'undefined') return;
    setPlayingNativeAudio(true);
    const audioUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(sentence)}&type=2`;
    const audio = new Audio(audioUrl);
    audio.onended = () => setPlayingNativeAudio(false);
    audio.onerror = () => setPlayingNativeAudio(false);
    audio.play().catch(() => setPlayingNativeAudio(false));
  };

  const youglishUrl = `https://youglish.com/pronounce/${encodeURIComponent(word)}/english`;
  const bilibiliSearchUrl = `https://search.bilibili.com/all?keyword=${encodeURIComponent(word + ' 英语 例句 TED')}`;
  const youdaoSentenceUrl = `https://dict.youdao.com/result?word=${encodeURIComponent(word)}&lang=en`;

  const definitionsWithExamples = chineseData?.definitions?.filter(d => d.example_en) || [];

  return (
    <ModuleAccordion meta={MODULE_REGISTRY.youtube_clips} collapsed={collapsed} onToggle={onToggle}>
      <div className="space-y-3">
        {/* Source Selector Bar (Dual-Channel Multi-Source) */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-800/80 pb-2.5">
          <div className="flex items-center gap-1.5 rounded-lg bg-neutral-900/90 p-1 border border-neutral-800">
            <button
              type="button"
              onClick={() => setSource('youglish')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                source === 'youglish'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Globe size={13} />
              <span>YouGlish (YouTube)</span>
            </button>
            <button
              type="button"
              onClick={() => setSource('bilibili')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                source === 'bilibili'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Tv size={13} />
              <span>Bilibili (国内免翻)</span>
            </button>
            <button
              type="button"
              onClick={() => setSource('native_audio')}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                source === 'native_audio'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <Film size={13} />
              <span>影视真实例句</span>
            </button>
          </div>

          {/* Accent filters only active for YouGlish */}
          {source === 'youglish' && (
            <div className="flex items-center gap-1">
              {(['all', 'us', 'uk', 'aus'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={accent === value}
                  onClick={() => setAccent(value)}
                  className={`rounded px-2 py-0.5 text-[11px] font-mono transition-colors ${
                    accent === value
                      ? 'bg-neutral-700 text-white font-bold'
                      : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  {value.toUpperCase()}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* --- Source 1: YouGlish Channel --- */}
        {source === 'youglish' && (
          <div
            id={mountId}
            className="relative overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 shadow-inner"
            style={{ aspectRatio: '16 / 9' }}
            aria-live="polite"
          >
            {status === 'loading' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-neutral-950 p-4 text-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
                <p className="text-xs text-neutral-400">正在连接 YouTube / YouGlish 真实演讲切片...</p>
                <p className="text-[11px] text-neutral-600">国内网络若加载较慢，可随时切换上方「Bilibili」或「影视真实例句」源</p>
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
                  <WifiOff size={20} />
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-200">YouTube 节点连接受限（国内网络常规现象）</p>
                  <p className="mt-1 text-xs text-neutral-500 max-w-sm">
                    无需担心！已为你自动就绪国内高速替代源，点击下方按钮一键切换播放：
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  <button
                    type="button"
                    onClick={() => setSource('bilibili')}
                    className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 transition-colors shadow-md"
                  >
                    <Tv size={13} />
                    <span>切换 Bilibili 国内免翻原声</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSource('native_audio')}
                    className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-500 transition-colors shadow-md"
                  >
                    <Film size={13} />
                    <span>播放影视原声双语例句</span>
                  </button>
                  <a
                    className="inline-flex items-center gap-1 rounded-lg border border-neutral-700 px-3 py-1.5 text-xs text-neutral-400 hover:text-white transition-colors"
                    href={youglishUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <span>网页直达 YouGlish</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {/* --- Source 2: Bilibili Domestic Channel (No VPN Needed) --- */}
        {source === 'bilibili' && (
          <div className="relative overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <Tv size={15} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-white">Bilibili 英语影视 / TED 原声语境库</h4>
                  <p className="text-[11px] text-neutral-500">国内原生高速 CDN，海量美剧、纪录片、名校公开课真人例句</p>
                </div>
              </div>
              <a
                href={bilibiliSearchUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-blue-400 hover:text-blue-300 hover:border-blue-500/50 transition-colors"
              >
                <span>在 B站 全屏探索</span>
                <ExternalLink size={12} />
              </a>
            </div>

            {/* Quick Context Card */}
            <div className="rounded-lg border border-neutral-800/80 bg-neutral-900/50 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-mono uppercase tracking-wider text-blue-400">Featured Context Video / 推荐原声切片</p>
                  <p className="mt-1 text-sm font-medium text-neutral-200">
                    《TED 演讲 / 美剧老友记中 “{word}” 的地道用法与连读爆破》
                  </p>
                </div>
                <a
                  href={bilibiliSearchUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 flex items-center gap-1.5 rounded-full bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 transition-transform active:scale-95 shadow-md shadow-blue-600/30"
                >
                  <Play size={12} className="fill-current" />
                  <span>立即在 B站 播放</span>
                </a>
              </div>
              <p className="text-xs text-neutral-400 leading-relaxed">
                包含真实语境演讲者原声语速、音标连读、英美不同文化语境下的语气重音切片。
              </p>
            </div>
          </div>
        )}

        {/* --- Source 3: Native Audio & Movie Sentence Stream (Domestic Fast) --- */}
        {source === 'native_audio' && (
          <div className="relative overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950 p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-neutral-800/60 pb-2">
              <div className="flex items-center gap-2">
                <Film size={15} className="text-purple-400" />
                <span className="text-xs font-semibold text-neutral-200">权威影视与辞书真实例句原声</span>
              </div>
              <a
                href={youdaoSentenceUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-purple-400 hover:text-purple-300 inline-flex items-center gap-1"
              >
                <span>更多影视例句库</span>
                <ExternalLink size={11} />
              </a>
            </div>

            {definitionsWithExamples.length > 0 ? (
              <div className="space-y-2.5">
                {definitionsWithExamples.map((item, idx) => (
                  <div
                    key={idx}
                    className="group rounded-lg border border-neutral-800/60 bg-neutral-900/40 p-3 hover:border-purple-500/30 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-neutral-200 leading-relaxed group-hover:text-white">
                        {item.example_en}
                      </p>
                      <button
                        type="button"
                        onClick={() => playSentenceAudio(item.example_en)}
                        className="shrink-0 p-1.5 rounded-full bg-purple-600/20 text-purple-400 hover:bg-purple-600 hover:text-white transition-colors"
                        title="朗读完整例句原声"
                      >
                        <Volume2 size={13} className={playingNativeAudio ? 'animate-pulse' : ''} />
                      </button>
                    </div>
                    {item.example_cn && (
                      <p className="mt-1 text-xs text-neutral-400">{item.example_cn}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-4 text-center text-xs text-neutral-500">
                暂无例句原声数据，可直接点击主词发音按钮或切换上方视频源。
              </div>
            )}
          </div>
        )}
      </div>
    </ModuleAccordion>
  );
}
