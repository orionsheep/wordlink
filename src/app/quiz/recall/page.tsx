'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Volume2, RotateCcw, CheckCircle2, AlertCircle, HelpCircle, ChevronRight, Trophy, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useQuizData, type QuizWord } from '@/hooks/useQuizData';
import { useSettings } from '@/context/SettingsContext';

export default function RecallQuizPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const requestedReturnTo = searchParams.get('returnTo');
  const returnTo = requestedReturnTo && requestedReturnTo.startsWith('/') && !requestedReturnTo.startsWith('//')
    ? requestedReturnTo
    : '/home';
  const returnLabel = returnTo === '/home' ? '返回主界面' : '返回上一级';

  const source = searchParams.get('source') as any;
  const libraryPath = searchParams.get('library');
  const groupIndex = searchParams.get('groupIndex') ? parseInt(searchParams.get('groupIndex')!) : null;
  const groupSize = searchParams.get('groupSize') ? parseInt(searchParams.get('groupSize')!) : 20;
  const count = searchParams.get('count') ? parseInt(searchParams.get('count')!) : 20;

  const { words, loading, error } = useQuizData({ source, libraryPath, groupIndex, groupSize, count });
  const { shortcuts, preferredAccent } = useSettings();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [isFinished, setIsFinished] = useState(false);
  const [records, setRecords] = useState<Array<{ word: string; rating: 'unknown' | 'hard' | 'easy'; score: number }>>([]);

  const currentWord: QuizWord | undefined = words[currentIndex];
  const progressPercent = words.length > 0 ? Math.round(((currentIndex) / words.length) * 100) : 0;

  const playAudio = useCallback((type: 'US' | 'UK' = preferredAccent === 'uk' ? 'UK' : 'US') => {
    if (!currentWord?.word) return;
    const w = currentWord.word;
    const audioType = type === 'US' ? 2 : 1;
    const url = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(w)}&type=${audioType}`;
    const audio = new Audio(url);
    audio.play().catch(() => {
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(w);
        u.lang = type === 'UK' ? 'en-GB' : 'en-US';
        window.speechSynthesis.speak(u);
      }
    });
  }, [currentWord, preferredAccent]);

  // Auto-play audio when new card appears
  useEffect(() => {
    if (currentWord && !isFinished) {
      playAudio();
    }
  }, [currentIndex, isFinished, playAudio]);

  const handleRate = useCallback(async (rating: 'unknown' | 'hard' | 'easy') => {
    if (!currentWord) return;

    let pts = 0;
    if (rating === 'easy') pts = 2;
    if (rating === 'hard') pts = 1;
    if (rating === 'unknown') pts = 0;

    setScore((s) => s + pts);
    setRecords((prev) => [...prev, { word: currentWord.word, rating, score: pts }]);

    // Asynchronously record result to backend
    fetch('/api/quiz/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word: currentWord.word, testType: 2, score: pts }),
      credentials: 'include',
    }).catch(() => {});

    // Move to next card or finish
    if (currentIndex < words.length - 1) {
      setRevealed(false);
      setCurrentIndex((i) => i + 1);
    } else {
      setIsFinished(true);
    }
  }, [currentWord, currentIndex, words.length]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const key = e.key.toLowerCase();
      if (e.code === 'Space') {
        e.preventDefault();
        setRevealed((prev) => !prev);
      } else if (key === shortcuts.quiz_easy.toLowerCase() || key === 'c') {
        e.preventDefault();
        handleRate('easy');
      } else if (key === shortcuts.quiz_hard.toLowerCase() || key === 'x') {
        e.preventDefault();
        handleRate('hard');
      } else if (key === shortcuts.quiz_unknown.toLowerCase() || key === 'z') {
        e.preventDefault();
        handleRate('unknown');
      } else if (key === 'e') {
        e.preventDefault();
        playAudio('US');
      } else if (key === 'q') {
        e.preventDefault();
        playAudio('UK');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts, handleRate, playAudio]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin"></div>
        <p className="text-xs text-neutral-400 font-mono">正在生成自适应回忆卡片...</p>
      </div>
    );
  }

  if (error || words.length === 0) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center space-y-4">
        <AlertCircle size={36} className="text-amber-500 mx-auto" />
        <h2 className="text-lg font-bold">{error || '暂无测验单词'}</h2>
        <Link
          href={returnTo}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs font-semibold text-white hover:bg-neutral-800"
        >
          <ArrowLeft size={14} />
          <span>{returnLabel}</span>
        </Link>
      </div>
    );
  }

  // End Screen: Report & Mastery Analysis
  if (isFinished) {
    const totalMax = words.length * 2;
    const accuracyPercent = Math.round((score / totalMax) * 100);
    const easyCount = records.filter((r) => r.rating === 'easy').length;
    const hardCount = records.filter((r) => r.rating === 'hard').length;
    const unknownCount = records.filter((r) => r.rating === 'unknown').length;

    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 sm:p-8">
        <div className="max-w-md w-full p-8 rounded-3xl bg-neutral-950 border border-neutral-800 shadow-2xl space-y-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto shadow-inner">
            <Trophy size={32} />
          </div>

          <div>
            <h2 className="text-2xl font-extrabold text-white tracking-tight">回忆测验完成！</h2>
            <p className="text-xs text-neutral-400 mt-1">
              本次共完成 {words.length} 个单词的主动回忆训练
            </p>
          </div>

          {/* Score & Accuracy Badge */}
          <div className="p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-2">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>综合掌握度得分</span>
              <span className="font-mono text-white font-bold text-base">{score} / {totalMax}</span>
            </div>
            <div className="w-full bg-neutral-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-gradient-to-r from-blue-500 to-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${accuracyPercent}%` }}
              />
            </div>
          </div>

          {/* Breakdown Stats */}
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="p-3 rounded-xl bg-emerald-950/20 border border-emerald-500/20">
              <div className="text-emerald-400 font-bold text-lg font-mono">{easyCount}</div>
              <div className="text-[10px] text-neutral-500">秒杀熟悉</div>
            </div>
            <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/20">
              <div className="text-amber-400 font-bold text-lg font-mono">{hardCount}</div>
              <div className="text-[10px] text-neutral-500">模糊犹豫</div>
            </div>
            <div className="p-3 rounded-xl bg-red-950/20 border border-red-500/20">
              <div className="text-red-400 font-bold text-lg font-mono">{unknownCount}</div>
              <div className="text-[10px] text-neutral-500">遗忘生疏</div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2.5 pt-2">
            <button
              onClick={() => {
                setCurrentIndex(0);
                setScore(0);
                setRevealed(false);
                setIsFinished(false);
                setRecords([]);
              }}
              className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-900/30 transition-all"
            >
              <RotateCcw size={14} />
              <span>重新测验本组</span>
            </button>
            <Link
              href={returnTo}
              className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 hover:text-white text-xs font-semibold transition-all"
            >
              <ArrowLeft size={14} />
              <span>{returnLabel}</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Active Flashcard Quiz View
  return (
    <div className="min-h-screen bg-black text-white flex flex-col items-center justify-between p-4 sm:p-8">
      {/* Top Header & Progress */}
      <div className="max-w-2xl w-full flex items-center justify-between gap-4 border-b border-neutral-900 pb-4">
        <Link
          href={returnTo}
          className="p-2 -ml-2 rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-900 border border-transparent hover:border-neutral-800 transition-all group"
        >
          <ArrowLeft size={20} className="group-hover:-translate-x-0.5 transition-transform text-neutral-300" />
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-neutral-400 font-mono">
            {currentIndex + 1} <span className="text-neutral-600">/</span> {words.length}
          </span>
          <div className="w-28 sm:w-36 bg-neutral-900 h-2 rounded-full overflow-hidden border border-neutral-800">
            <div
              className="bg-blue-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        <div className="text-xs font-mono text-neutral-400">
          得分: <span className="text-white font-bold">{score}</span>
        </div>
      </div>

      {/* Center 3D-styled Interactive Flashcard */}
      <div className="max-w-2xl w-full my-auto py-6 flex flex-col items-center">
        <div
          onClick={() => setRevealed((prev) => !prev)}
          className="w-full cursor-pointer rounded-3xl p-8 sm:p-12 bg-neutral-950/90 border border-neutral-800/90 shadow-2xl hover:border-neutral-700 transition-all duration-300 relative overflow-hidden flex flex-col items-center text-center space-y-6"
        >
          {/* Card Header Tag */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase font-bold tracking-widest px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
              主动回忆卡片 · 点击翻转
            </span>
          </div>

          {/* Word Name & Pronunciation */}
          <div className="space-y-3">
            <h2 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight">
              {currentWord.word}
            </h2>
            {currentWord.chineseData?.pronunciation && (
              <div className="flex items-center justify-center gap-2 text-sm font-mono text-neutral-400">
                <span>/{currentWord.chineseData.pronunciation}/</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    playAudio();
                  }}
                  className="p-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white transition-colors"
                  title="播放发音"
                >
                  <Volume2 size={16} />
                </button>
              </div>
            )}
          </div>

          {/* Revealed Meaning Area */}
          <div className="w-full min-h-[100px] flex items-center justify-center">
            {revealed ? (
              <div className="space-y-2 p-5 rounded-2xl bg-neutral-900/60 border border-neutral-800 w-full animate-fade-in text-left">
                <div className="text-sm font-semibold text-neutral-200">
                  {currentWord.chineseData?.concise_definition || '暂无简明释义'}
                </div>
                {currentWord.chineseData?.definitions?.[0] && (
                  <p className="text-xs text-neutral-400 leading-relaxed">
                    {currentWord.chineseData.definitions[0].explanation_cn}
                  </p>
                )}
              </div>
            ) : (
              <div className="py-4 text-xs text-neutral-500 font-mono flex items-center gap-1.5 animate-pulse">
                <span>按空格键 [Space] 或点击翻转查看释义</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Rating Controls (Z / X / C) */}
      <div className="max-w-2xl w-full pt-4 border-t border-neutral-900 space-y-3">
        <div className="grid grid-cols-3 gap-3">
          {/* Unknown */}
          <button
            type="button"
            onClick={() => handleRate('unknown')}
            className="flex flex-col items-center justify-center p-3 sm:p-4 rounded-2xl bg-red-950/20 hover:bg-red-950/40 border border-red-500/20 hover:border-red-500/50 text-red-400 hover:text-white transition-all group"
          >
            <span className="text-sm font-bold">遗忘 / 不认识</span>
            <span className="text-[10px] text-neutral-500 font-mono mt-1 group-hover:text-red-300">[Z] (+0分)</span>
          </button>

          {/* Hard */}
          <button
            type="button"
            onClick={() => handleRate('hard')}
            className="flex flex-col items-center justify-center p-3 sm:p-4 rounded-2xl bg-amber-950/20 hover:bg-amber-950/40 border border-amber-500/20 hover:border-amber-500/50 text-amber-400 hover:text-white transition-all group"
          >
            <span className="text-sm font-bold">模糊 / 犹豫</span>
            <span className="text-[10px] text-neutral-500 font-mono mt-1 group-hover:text-amber-300">[X] (+1分)</span>
          </button>

          {/* Easy */}
          <button
            type="button"
            onClick={() => handleRate('easy')}
            className="flex flex-col items-center justify-center p-3 sm:p-4 rounded-2xl bg-emerald-950/20 hover:bg-emerald-950/40 border border-emerald-500/20 hover:border-emerald-500/50 text-emerald-400 hover:text-white transition-all group"
          >
            <span className="text-sm font-bold">熟练 / 秒杀</span>
            <span className="text-[10px] text-neutral-500 font-mono mt-1 group-hover:text-emerald-300">[C] (+2分)</span>
          </button>
        </div>

        <div className="flex items-center justify-center gap-4 text-[11px] text-neutral-500 font-mono pt-1">
          <span>快捷键: [Space] 翻面 · [E/Q] 发音 · [Z/X/C] 评级</span>
        </div>
      </div>
    </div>
  );
}
