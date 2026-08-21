'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, Star } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ChineseData } from '@/lib/data';
import { cacheGet, cacheSet } from '@/lib/client-cache';
import { telemetry } from '@/lib/telemetry';
import { useSettings } from '@/context/SettingsContext';
import { useAI } from './ai/AIProvider';
import AudioSpeechModule from './word-modules/AudioSpeechModule';
import WordModules from './word-modules/WordModules';

interface WordDetailProps {
  word: string | null;
  onWordClick?: (word: string) => void;
  onNextWord?: () => void;
  onPrevWord?: () => void;
  transparent?: boolean;
  currentUserId?: string;
}

interface WordDetailEnvelope {
  content?: string | null;
  chinese?: ChineseData | null;
  chineseData?: ChineseData | null;
}

interface NormalizedWordDetail {
  content: string | null;
  chinese: ChineseData | null;
}

function normalizeContent(content: string | null | undefined): string | null {
  if (!content) return null;
  return content.replace(/\[\[(.*?)\]\]/g, (_match, linkedWord: string) => `[${linkedWord}](#${linkedWord})`);
}

function normalizeResponse(value: WordDetailEnvelope): NormalizedWordDetail {
  return {
    content: normalizeContent(value.content),
    chinese: value.chinese ?? value.chineseData ?? null,
  };
}

export default function WordDetail({ word, onWordClick, onNextWord, onPrevWord, transparent, currentUserId }: WordDetailProps) {
  const { shortcuts, showHoverTooltip, showWordDetailTooltip, aiEnabled } = useSettings();
  const { openWithWord } = useAI();
  const t = useTranslations();
  const [content, setContent] = useState<string | null>(null);
  const [chineseData, setChineseData] = useState<ChineseData | null>(null);
  const [loading, setLoading] = useState(() => Boolean(word));
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const playAudio = useCallback((type: 'US' | 'UK') => {
    const selectedWord = word?.trim();
    if (!selectedWord || typeof window === 'undefined') return;

    // Count the user's request once. Fallback URLs are retries of the same
    // interaction and must not inflate the telemetry counter.
    telemetry.trackAudio();
    const audioType = type === 'US' ? 2 : 1;
    const primaryUrl = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(selectedWord)}&type=${audioType}`;
    const fallbackUrl = `https://ssl.gstatic.com/dictionary/static/sounds/oxford/${selectedWord.toLowerCase()}--_${type.toLowerCase()}_1.mp3`;
    let fallbackStarted = false;
    const speakFallback = () => {
      if (fallbackStarted) return;
      fallbackStarted = true;
      try {
        const fallbackAudio = new Audio(fallbackUrl);
        Promise.resolve(fallbackAudio.play()).catch(() => {
          if (!('speechSynthesis' in window)) return;
          const utterance = new SpeechSynthesisUtterance(selectedWord);
          utterance.lang = type === 'UK' ? 'en-GB' : 'en-US';
          window.speechSynthesis.speak(utterance);
        });
      } catch {
        if (!('speechSynthesis' in window)) return;
        const utterance = new SpeechSynthesisUtterance(selectedWord);
        utterance.lang = type === 'UK' ? 'en-GB' : 'en-US';
        window.speechSynthesis.speak(utterance);
      }
    };

    try {
      const audio = new Audio(primaryUrl);
      audio.addEventListener('error', speakFallback, { once: true });
      Promise.resolve(audio.play()).catch(speakFallback);
    } catch {
      speakFallback();
    }
  }, [word]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      const key = event.key.toLowerCase();
      if (key === shortcuts.audio_us.toLowerCase()) {
        event.preventDefault();
        playAudio('US');
      } else if (key === shortcuts.audio_uk.toLowerCase()) {
        event.preventDefault();
        playAudio('UK');
      } else if (key === shortcuts.nav_prev.toLowerCase()) {
        event.preventDefault();
        onPrevWord?.();
      } else if (key === shortcuts.nav_next.toLowerCase()) {
        event.preventDefault();
        onNextWord?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onNextWord, onPrevWord, playAudio, shortcuts]);

  useEffect(() => {
    if (!word?.trim()) return;
    telemetry.trackEnter(word, 'studio');
    return () => telemetry.flush();
  }, [word]);

  useEffect(() => {
    const currentRequest = ++requestIdRef.current;
    const controller = new AbortController();
    const selectedWord = word?.trim() || '';
    const resetTimer = window.setTimeout(() => {
      if (currentRequest !== requestIdRef.current) return;
      setError(null);
      if (!selectedWord) {
        setContent(null);
        setChineseData(null);
        setLoading(false);
      } else {
        setContent(null);
        setChineseData(null);
        setLoading(true);
      }
    }, 0);

    if (!selectedWord) {
      return () => {
        window.clearTimeout(resetTimer);
        controller.abort();
      };
    }

    // Share the detail cache with the mobile route; reads still accept the
    // historical `chineseData` field while writes use the unified `chinese`.
    const cacheKey = `word:${selectedWord.toLowerCase()}`;
    const cached = cacheGet<WordDetailEnvelope>(cacheKey);
    if (cached) {
      const normalized = normalizeResponse(cached);
      const cacheTimer = window.setTimeout(() => {
        if (currentRequest !== requestIdRef.current) return;
        setContent(normalized.content);
        setChineseData(normalized.chinese);
        setLoading(false);
      }, 0);
      return () => {
        window.clearTimeout(resetTimer);
        window.clearTimeout(cacheTimer);
        controller.abort();
      };
    }

    fetch(`/api/words/${encodeURIComponent(selectedWord)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 404 ? 'not-found' : 'request-failed');
        return response.json() as Promise<WordDetailEnvelope>;
      })
      .then((payload) => {
        if (currentRequest !== requestIdRef.current) return;
        const normalized = normalizeResponse(payload);
        cacheSet(cacheKey, normalized);
        setContent(normalized.content);
        setChineseData(normalized.chinese);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        if (currentRequest !== requestIdRef.current) return;
        setContent(null);
        setChineseData(null);
        setError(reason instanceof Error && reason.message === 'not-found' ? t('wordDetail.wordNotFound') : t('wordDetail.errorLoading'));
      })
      .finally(() => {
        if (currentRequest === requestIdRef.current) setLoading(false);
      });

    return () => {
        window.clearTimeout(resetTimer);
        controller.abort();
    };
  }, [t, word]);

  const scrollToNotes = useCallback(() => {
    document.querySelector('[data-module="community_notes"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const renderCollinsStars = (collins: string | undefined) => {
    const count = Number.parseInt(collins || '', 10);
    if (!Number.isFinite(count) || count <= 0) return null;
    return (
      <span className="inline-flex items-center gap-0.5 text-yellow-500" title={`${t('wordDetail.collinsStars')}: ${count}`} aria-label={`${t('wordDetail.collinsStars')}: ${count}`}>
        {Array.from({ length: Math.min(5, count) }, (_, index) => <Star key={index} size={12} className="fill-current" aria-hidden="true" />)}
      </span>
    );
  };

  if (!word) {
    return <div className="flex h-full items-center justify-center text-neutral-500 font-light tracking-wider">{t('wordDetail.selectWord').toUpperCase()}</div>;
  }

  return (
    <div className={`flex h-full flex-col text-neutral-200 ${transparent ? 'bg-transparent' : 'bg-black'}`}>
      <header className="shrink-0 border-b border-neutral-900 bg-neutral-950/40 px-6 py-4 backdrop-blur-md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="truncate text-3xl font-extrabold tracking-tight text-white">{word}</h1>
            {chineseData && (
              <div className="flex items-center gap-2 text-xs font-mono text-neutral-400">
                <span>/{chineseData.phonetic || chineseData.pronunciation || word}/</span>
                {renderCollinsStars(chineseData.collins)}
              </div>
            )}
            {aiEnabled && (
              <button type="button" onClick={() => openWithWord(word)} className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-lg shadow-purple-900/30 transition-all hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400" title={t('wordDetail.askAI')}>
                <Sparkles size={13} aria-hidden="true" />
                <span>{t('wordDetail.askAI')}</span>
              </button>
            )}
          </div>
          <AudioSpeechModule
            word={word}
            chineseData={chineseData}
            onPlayAudio={playAudio}
            audioShortcuts={{ us: shortcuts.audio_us, uk: shortcuts.audio_uk }}
            collapsed={false}
            onToggle={() => undefined}
            compact
          />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto p-6 pt-4">
        <WordModules
          word={word}
          chineseData={chineseData}
          content={content}
          currentUserId={currentUserId}
          onWordClick={onWordClick}
          onScrollToNotes={scrollToNotes}
          onPlayAudio={playAudio}
          audioShortcuts={{ us: shortcuts.audio_us, uk: shortcuts.audio_uk }}
          showTooltip={showHoverTooltip && showWordDetailTooltip}
          loading={loading}
          error={error}
          audioInHeader
        />
      </main>
    </div>
  );
}
